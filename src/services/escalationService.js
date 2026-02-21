const { Op } = require('sequelize');
const { Incident, EscalationRule } = require('../models');
const notificationService = require('./notificationService');

class EscalationService {
  /**
   * Process an incident for escalation
   */
  async processIncident(incident) {
    // Skip if already escalated beyond max level
    if (incident.escalationLevel >= 5) {
      return { skipped: 'max_level_reached' };
    }

    // Find matching escalation rules
    const matchingRules = await this.findMatchingRules(incident);

    if (matchingRules.length === 0) {
      // Default escalation based on severity
      await this.applyDefaultEscalation(incident);
      return { escalated: false, reason: 'no_matching_rules' };
    }

    // Apply the highest priority matching rule
    const rule = matchingRules[0];
    await this.applyEscalation(incident, rule);

    return { escalated: true, ruleId: rule.ruleId, level: incident.escalationLevel };
  }

  /**
   * Find matching escalation rules
   */
  async findMatchingRules(incident) {
    const rules = await EscalationRule.findAll({
      where: { active: true },
      order: [['priority', 'ASC']],
    });

    const matchingRules = [];

    for (const rule of rules) {
      if (this.ruleMatchesIncident(rule, incident)) {
        matchingRules.push(rule);
      }
    }

    return matchingRules;
  }

  /**
   * Check if a rule matches the incident
   */
  ruleMatchesIncident(rule, incident) {
    // Check incident type
    if (rule.conditionsIncidentTypes && rule.conditionsIncidentTypes.length > 0) {
      if (!rule.conditionsIncidentTypes.includes(incident.incidentType)) {
        return false;
      }
    }

    // Check severity
    if (rule.conditionsSeverities && rule.conditionsSeverities.length > 0) {
      if (!rule.conditionsSeverities.includes(incident.severity)) {
        return false;
      }
    }

    // Check location (state)
    if (rule.conditionsStates && rule.conditionsStates.length > 0) {
      const incidentState = incident.locationState;
      if (!incidentState || !rule.conditionsStates.includes(incidentState)) {
        return false;
      }
    }

    // Check location (LGA)
    if (rule.conditionsLgas && rule.conditionsLgas.length > 0) {
      const incidentLga = incident.locationLga;
      if (!incidentLga || !rule.conditionsLgas.includes(incidentLga)) {
        return false;
      }
    }

    // Check time range
    if (rule.conditionsTimeRangeStart && rule.conditionsTimeRangeEnd) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      if (currentTime < rule.conditionsTimeRangeStart || currentTime > rule.conditionsTimeRangeEnd) {
        return false;
      }

      if (rule.conditionsDaysOfWeek && rule.conditionsDaysOfWeek.length > 0) {
        if (!rule.conditionsDaysOfWeek.includes(now.getDay())) {
          return false;
        }
      }
    }

    // Check confidence threshold
    if (rule.conditionsMinConfidence) {
      const confidence = incident.confidenceScore || 50;
      if (confidence < rule.conditionsMinConfidence) {
        return false;
      }
    }

    // Check channel
    if (rule.conditionsChannels && rule.conditionsChannels.length > 0) {
      if (!rule.conditionsChannels.includes(incident.channel)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply escalation based on a rule
   */
  async applyEscalation(incident, rule) {
    // Update incident
    incident.status = 'escalated';
    incident.escalationLevel = Math.max(incident.escalationLevel, rule.escalationLevel);
    incident.escalationRulesTriggered = [...(incident.escalationRulesTriggered || []), rule.ruleId];
    incident.escalationEscalatedAt = new Date();

    // Set assignee
    incident.escalationAssignedToType = rule.escalationAssigneeType;
    incident.escalationAssignedToName = rule.escalationAssigneeName;
    incident.escalationAssignedToPhone = rule.escalationAssigneePhone;
    incident.escalationAssignedToOrganization = rule.escalationAssigneeOrganization;

    await incident.save();

    // Send notification
    await notificationService.sendEscalationNotification(incident, rule);

    // Update rule statistics
    await EscalationRule.update(
      {
        lastTriggered: new Date(),
        triggerCount: rule.triggerCount + 1,
      },
      { where: { ruleId: rule.ruleId } }
    );

    return incident;
  }

  /**
   * Apply default escalation based on severity
   */
  async applyDefaultEscalation(incident) {
    const severityToLevel = {
      'low': 0,
      'medium': 1,
      'high': 2,
      'critical': 3,
    };

    const level = severityToLevel[incident.severity] || 1;

    if (level === 0) {
      // Low severity, no escalation needed
      incident.status = 'received';
      await incident.save();
      return;
    }

    // Escalate to level based on severity
    incident.status = 'escalated';
    incident.escalationLevel = level;
    incident.escalationEscalatedAt = new Date();
    incident.escalationRulesTriggered = [...(incident.escalationRulesTriggered || []), 'default_severity'];

    // Default assignment based on severity level
    const assigneeType = level >= 3 ? 'agency_liaison' : 'community_focal';
    const assignee = await this.getAssigneeForType(assigneeType, incident);
    incident.escalationAssignedToType = assignee.type;
    incident.escalationAssignedToName = assignee.contactName;
    incident.escalationAssignedToPhone = assignee.contactPhone;
    incident.escalationAssignedToOrganization = assignee.organization;

    await incident.save();

    // Send notification
    await notificationService.sendEscalationNotification(incident, {
      name: 'Default Severity Escalation',
      escalation: {
        level,
        slaMinutes: level * 30, // SLA: 30min for level 1, 60min for level 2, etc.
        notificationMethod: 'sms',
      },
    });
  }

  /**
   * Get assignee for a given type
   */
  async getAssigneeForType(type, incident) {
    const { Responder } = require('../models');

    // Try to find a location-specific responder
    const responders = await Responder.findAll({
      where: {
        type,
        status: 'active',
        [Op.or]: [
          { state: incident.locationState, lga: incident.locationLga },
          { state: incident.locationState, lga: null },
          { state: null, lga: null },
        ],
      },
      order: [['state', 'DESC'], ['lga', 'DESC']],
    });

    if (responders.length > 0) {
      // Pick one at random
      const responder = responders[Math.floor(Math.random() * responders.length)];
      return {
        type: responder.type,
        contactName: responder.name,
        contactPhone: responder.phone,
        organization: responder.organization,
      };
    }

    // Fallback to a default responder
    return {
      type: 'community_focal',
      contactName: 'Community Focal Point',
      contactPhone: '+2348000000002',
      organization: 'Community',
    };
  }

  /**
   * Escalate incident to next level
   */
  async escalateToLevel(incidentId, targetLevel, reason) {
    const incident = await Incident.findOne({ where: { incidentId } });
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const currentLevel = incident.escalationLevel;

    if (targetLevel <= currentLevel) {
      throw new Error(`Cannot de-escalate from level ${currentLevel} to ${targetLevel}`);
    }

    incident.escalationLevel = targetLevel;
    incident.status = 'escalated';
    incident.escalationEscalatedAt = new Date();

    await incident.save();

    // Get new assignee based on level
    const assigneeType = targetLevel >= 3 ? 'agency_liaison' : 'community_focal';
    const assignee = await this.getAssigneeForType(assigneeType, incident);
    incident.escalationAssignedToType = assignee.type;
    incident.escalationAssignedToName = assignee.contactName;
    incident.escalationAssignedToPhone = assignee.contactPhone;
    incident.escalationAssignedToOrganization = assignee.organization;

    await incident.save();

    // Send notification
    await notificationService.sendEscalationNotification(incident, {
      name: 'Manual Escalation',
      escalation: {
        level: targetLevel,
        slaMinutes: targetLevel * 30,
        notificationMethod: 'sms',
      },
    });

    return incident;
  }

  /**
   * Get escalation path for an incident
   */
  async getEscalationPath(incidentId) {
    const incident = await Incident.findOne({ where: { incidentId } });
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    return {
      currentLevel: incident.escalationLevel,
      escalatedAt: incident.escalationEscalatedAt,
      assignedTo: {
        type: incident.escalationAssignedToType,
        contactName: incident.escalationAssignedToName,
        contactPhone: incident.escalationAssignedToPhone,
        organization: incident.escalationAssignedToOrganization,
      },
    };
  }
}

module.exports = new EscalationService();

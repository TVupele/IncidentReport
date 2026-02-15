const { Op } = require('sequelize');
const { Incident, UssdSession } = require('../models');
const deduplicationService = require('./deduplicationService');
const escalationService = require('./escalationService');

class IncidentIngestionService {
  /**
   * Create incident from USSD session
   */
  async createFromUssd(sessionData, telcoMetadata = {}) {
    const incident = await Incident.create({
      channel: 'ussd',
      reporterPhoneNumber: sessionData.phoneNumber,
      reporterAnonymous: true,
      reporterCallbackConsent: sessionData.callbackConsent,
      reporterSessionId: sessionData.sessionId,
      incidentType: sessionData.incidentType,
      severity: sessionData.severity,
      locationCellTowerId: telcoMetadata.cellTowerId,
      locationCellTowerLac: telcoMetadata.lac,
      locationCellTowerMcc: telcoMetadata.mcc || '621',
      locationCellTowerMnc: telcoMetadata.mnc,
      locationState: sessionData.location?.state,
      locationLga: sessionData.location?.lga,
      locationVillage: sessionData.location?.village,
      locationLatitude: sessionData.location?.latitude,
      locationLongitude: sessionData.location?.longitude,
      locationManual: sessionData.location?.manual || false,
      descriptionText: sessionData.description,
      descriptionLanguage: sessionData.language || 'hausa',
      status: 'received',
      metadataReceivedVia: 'ussd',
      metadataReportTimestamp: new Date(),
      metadataQueueTime: telcoMetadata.queueTime || 0,
    });

    // Run de-duplication
    const duplicates = await deduplicationService.findDuplicates(incident);
    if (duplicates.length > 0) {
      // Update with duplicates info
      incident.confidenceDeDuplicationScore = duplicates[0]?.similarity || 0;
      await incident.save();
    }

    // Trigger escalation
    await escalationService.processIncident(incident);

    return incident;
  }

  /**
   * Create incident from web/mobile API
   */
  async createFromApi(reportData, sourceInfo = {}) {
    const incident = await Incident.create({
      channel: reportData.channel || 'web',
      reporterPhoneNumber: reportData.phoneNumber,
      reporterAnonymous: reportData.anonymous !== false,
      reporterCallbackConsent: reportData.callbackConsent || false,
      incidentType: reportData.incidentType,
      severity: reportData.severity || 'medium',
      locationLatitude: reportData.latitude,
      locationLongitude: reportData.longitude,
      locationAccuracy: reportData.accuracy,
      locationGpsTimestamp: reportData.gpsTimestamp,
      locationState: reportData.state,
      locationLga: reportData.lga,
      locationVillage: reportData.village,
      locationManual: !!reportData.latitude,
      descriptionText: reportData.description,
      descriptionAudioUrl: reportData.audioUrl,
      descriptionPhotoUrls: reportData.photoUrls || [],
      descriptionLanguage: reportData.language || 'hausa',
      status: 'received',
      sourceIp: sourceInfo.ip,
      sourceUserAgent: sourceInfo.userAgent,
      sourceDeviceInfo: sourceInfo.deviceInfo,
      metadataReceivedVia: reportData.channel || 'web',
      metadataReportTimestamp: new Date(),
    });

    // Run de-duplication
    const duplicates = await deduplicationService.findDuplicates(incident);
    if (duplicates.length > 0) {
      incident.confidenceDeDuplicationScore = duplicates[0]?.similarity || 0;
      await incident.save();
    }

    // Trigger escalation
    await escalationService.processIncident(incident);

    return incident;
  }

  /**
   * Update incident status
   */
  async updateStatus(incidentId, newStatus, additionalData = {}) {
    const incident = await Incident.findOne({ where: { incidentId } });
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    incident.status = newStatus;

    if (additionalData.response) {
      if (additionalData.response.firstResponder) {
        incident.responseFirstResponder = additionalData.response.firstResponder;
      }
      if (additionalData.response.responseTime) {
        incident.responseTime = additionalData.response.responseTime;
      }
      if (additionalData.response.arrivalTime) {
        incident.responseArrivalTime = additionalData.response.arrivalTime;
      }
      if (additionalData.response.resolution) {
        incident.responseResolution = additionalData.response.resolution;
      }
      if (additionalData.response.resolvedAt) {
        incident.responseResolvedAt = additionalData.response.resolvedAt;
      }
    }

    await incident.save();

    // Trigger escalation if status changed to escalated
    if (newStatus === 'escalated') {
      await escalationService.processIncident(incident);
    }

    return incident;
  }

  /**
   * Assign incident to responder
   */
  async assignIncident(incidentId, assignee) {
    const incident = await Incident.findOne({ where: { incidentId } });
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    incident.status = 'assigned';
    incident.escalationAssignedToType = assignee.type;
    incident.escalationAssignedToName = assignee.contactName;
    incident.escalationAssignedToPhone = assignee.contactPhone;
    incident.escalationAssignedToOrganization = assignee.organization;

    await incident.save();

    return incident;
  }

  /**
   * Get incident by ID
   */
  async getById(incidentId) {
    return Incident.findOne({ where: { incidentId } });
  }

  /**
   * Get incidents with filters
   */
  async getIncidents(filters = {}, options = {}) {
    const where = {};

    if (filters.status) where.status = filters.status;
    if (filters.incidentType) where.incidentType = filters.incidentType;
    if (filters.severity) where.severity = filters.severity;
    if (filters.state) where.locationState = filters.state;
    if (filters.lga) where.locationLga = filters.lga;
    if (filters.channel) where.channel = filters.channel;

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt[Op.gte] = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt[Op.lte] = new Date(filters.dateTo);
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const [incidents, total] = await Promise.all([
      Incident.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
      Incident.count({ where }),
    ]);

    return {
      incidents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get incident statistics
   */
  async getStatistics(filters = {}) {
    const where = {};

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt[Op.gte] = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt[Op.lte] = new Date(filters.dateTo);
    }

    const incidents = await Incident.findAll({ where });

    const stats = {
      total: incidents.length,
      byStatus: {},
      byType: {},
      bySeverity: {},
      byChannel: {},
      avgConfidence: 0,
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const incident of incidents) {
      // Count by status
      stats.byStatus[incident.status] = (stats.byStatus[incident.status] || 0) + 1;
      // Count by type
      stats.byType[incident.incidentType] = (stats.byType[incident.incidentType] || 0) + 1;
      // Count by severity
      stats.bySeverity[incident.severity] = (stats.bySeverity[incident.severity] || 0) + 1;
      // Count by channel
      stats.byChannel[incident.channel] = (stats.byChannel[incident.channel] || 0) + 1;
      // Calculate average confidence
      if (incident.confidenceScore) {
        totalConfidence += incident.confidenceScore;
        confidenceCount++;
      }
    }

    if (confidenceCount > 0) {
      stats.avgConfidence = Math.round((totalConfidence / confidenceCount) * 10) / 10;
    }

    return stats;
  }
}

module.exports = new IncidentIngestionService();

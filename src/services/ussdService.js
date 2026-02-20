const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const config = require('../config');
const { UssdSession, Incident, Alert } = require('../models');
const { sequelize } = require('../models/database'); // assuming sequelize instance is exported

// Simple in‑memory cache for alerts (use Redis in production)
const alertCache = {
  data: null,
  timestamp: 0,
  ttl: 30000, // 30 seconds
};

class UssdGateway {
  constructor() {
    this.menus = config.ussdMenus;
    this.sessionTimeout = config.ussd.sessionTimeoutMs;
    this.provider = config.ussd.provider || 'africastalking';
    this.maxMessageLength = config.ussd.maxMessageLength || 182; // Configurable
  }

  /**
   * Handle incoming USSD request
   */
  async handleRequest(params) {
    const { sessionId, phoneNumber, input, serviceCode, operator, provider } = params;

    // Find or create session
    let session = await UssdSession.findOne({ where: { sessionId } });
    if (!session) {
      session = await this.createSession(sessionId, phoneNumber);
    }

    // Check for timeout
    if (this.isSessionExpired(session)) {
      await this.endSession(session, 'timeout');
      return this.getMenuResponse(session, 'timeout');
    }

    // Process input
    const response = await this.processInput(session, input);

    // Update session only if changed
    if (session.changed()) {
      session.lastActivityAt = new Date();
      await session.save();
    }

    return response;
  }

  /**
   * Create new USSD session
   */
  async createSession(sessionId, phoneNumber) {
    return UssdSession.create({
      sessionId,
      phoneNumber,
      language: 'hausa', // Default; could be derived from phone number prefix
      state: 'main_menu',
      currentStep: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });
  }

  /**
   * Map state names to handler methods
   */
  getHandler(state) {
    const handlers = {
      'main_menu': this.handleMainMenu,
      'incident_category': this.handleIncidentCategory,
      'severity_selection': this.handleSeveritySelection,
      'location_selection': this.handleLocationSelection,
      'description': this.handleDescription,
      'callback_consent': this.handleCallbackConsent,
      'confirmation': this.handleConfirmation,
      'completed': this.handleMainMenu, // Restart on completed session
    };
    return handlers[state] || this.handleInvalidState;
  }

  /**
   * Process user input based on current state
   */
  async processInput(session, input) {
    const normalizedInput = (input || '').trim();

    // Basic input validation: length limit (typical USSD max 160)
    if (normalizedInput.length > 160) {
      return this.getMenuResponse(session, 'invalid');
    }

    const handler = this.getHandler(session.state);
    return handler.call(this, session, normalizedInput);
  }

  /**
   * Fallback handler for unknown state
   */
  async handleInvalidState(session, input) {
    session.state = 'main_menu';
    return this.getMenuResponse(session, 'welcome');
  }

  /**
   * Handle main menu selection
   */
  async handleMainMenu(session, input) {
    const menu = this.getLocalizedMenu(session.language);

    if (input === '') {
      return this.continueResponse(menu.welcome);
    }

    const choice = parseInt(input, 10);

    switch (choice) {
      case 1: // Report suspicious activity
        session.state = 'incident_category';
        session.dataIncidentType = 'suspicious_activity';
        return this.continueResponse(menu.suspiciousActivity);

      case 2: // Report incident in progress
        session.state = 'incident_category';
        session.dataIncidentType = 'incident_in_progress';
        return this.continueResponse(menu.incidentInProgress);

      case 3: // Request help
        session.state = 'incident_category';
        session.dataIncidentType = 'request_help';
        return this.continueResponse(menu.requestHelp);

      case 4: // Read alerts
        const alertText = await this.getLatestAlerts(session.language);
        return this.endResponse(alertText);

      case 5: // Repeat menu
        return this.continueResponse(menu.welcome);

      default:
        return this.getMenuResponse(session, 'invalid');
    }
  }

  /**
   * Handle incident category selection
   */
  async handleIncidentCategory(session, input) {
    const choice = parseInt(input, 10);
    const menu = this.getLocalizedMenu(session.language);

    const typeMap = {
      1: 'fight',
      2: 'gunshot',
      3: 'kidnap',
      4: 'theft',
      5: 'other',
    };

    const medicalMap = {
      1: 'police',
      2: 'fire_service',
      3: 'ambulance',
      4: 'community_focal',
    };

    if (session.dataIncidentType === 'request_help') {
      if (choice >= 1 && choice <= 4) {
        session.dataIncidentType = medicalMap[choice];
        session.dataSeverity = 'high'; // Help requests default to high
      } else {
        return this.getMenuResponse(session, 'invalid');
      }
    } else {
      if (choice >= 1 && choice <= 5) {
        session.dataIncidentType = typeMap[choice];
      } else {
        return this.getMenuResponse(session, 'invalid');
      }
    }

    session.state = 'severity_selection';
    return this.continueResponse(this.getLocalizedPrompt(session.language, 'severity'));
  }

  /**
   * Handle severity selection
   */
  async handleSeveritySelection(session, input) {
    const choice = parseInt(input, 10);
    const severityMap = {
      1: 'low',
      2: 'medium',
      3: 'high',
      4: 'critical',
    };

    if (choice >= 1 && choice <= 4) {
      session.dataSeverity = severityMap[choice];
    } else {
      session.dataSeverity = 'medium'; // default
    }

    session.state = 'location_selection';
    return this.continueResponse(this.getLocalizedPrompt(session.language, 'location'));
  }

  /**
   * Handle location selection
   */
  async handleLocationSelection(session, input) {
    const choice = parseInt(input, 10);

    if (choice === 1 || choice === 2) {
      // In a real app, you'd handle auto vs manual differently
      // For now, just proceed to description
      session.state = 'description';
      return this.continueResponse(this.getLocalizedPrompt(session.language, 'description'));
    } else {
      return this.getMenuResponse(session, 'invalid');
    }
  }

  /**
   * Handle description input
   */
  async handleDescription(session, input) {
    session.dataDescription = input || '';
    session.state = 'callback_consent';
    return this.continueResponse(this.getLocalizedPrompt(session.language, 'callback'));
  }

  /**
   * Handle callback consent
   */
  async handleCallbackConsent(session, input) {
    const choice = parseInt(input, 10);
    session.dataCallbackConsent = (choice === 1);
    session.state = 'confirmation';

    // Build summary dynamically to avoid hardcoding
    const summary = this.buildIncidentSummary(session);
    const confirmPrompt = this.getLocalizedPrompt(session.language, 'confirmation')
      .replace('{summary}', summary);
    return this.continueResponse(confirmPrompt);
  }

  /**
   * Handle final confirmation
   */
  async handleConfirmation(session, input) {
    const choice = parseInt(input, 10);

    if (choice === 1) {
      // Submit the report inside a transaction
      const transaction = await sequelize.transaction();
      try {
        const incident = await this.createIncident(session, transaction);
        session.incidentCreated = true;
        session.incidentId = incident.incidentId;
        session.state = 'completed';
        await session.save({ transaction });

        await transaction.commit();

        const menu = this.getLocalizedMenu(session.language);
        const thankYou = menu.thankYou.replace('{incidentId}', incident.incidentId);
        return this.endResponse(thankYou);
      } catch (error) {
        await transaction.rollback();
        console.error('Error creating incident:', error);
        // Return a generic error and restart
        session.state = 'main_menu';
        return this.getMenuResponse(session, 'invalid');
      }
    } else if (choice === 2) {
      // Cancel and restart
      session.state = 'main_menu';
      return this.getMenuResponse(session, 'welcome');
    } else {
      return this.getMenuResponse(session, 'invalid');
    }
  }

  /**
   * Build a summary of the incident for confirmation
   */
  buildIncidentSummary(session) {
    const type = session.dataIncidentType || 'unknown';
    const severity = session.dataSeverity || 'medium';
    const desc = (session.dataDescription || '').substring(0, 50); // truncate long descriptions
    return `Type: ${type}\nSeverity: ${severity}\nDesc: ${desc}`;
  }

  /**
   * Create incident from session data (within a transaction)
   */
  async createIncident(session, transaction) {
    const incident = await Incident.create({
      channel: 'ussd',
      reporterPhoneNumber: session.phoneNumber,
      reporterAnonymous: true,
      reporterCallbackConsent: session.dataCallbackConsent,
      reporterSessionId: session.sessionId,
      incidentType: session.dataIncidentType,
      severity: session.dataSeverity || 'medium',
      locationState: session.dataLocationState || config.location.defaultState,
      locationLga: session.dataLocationLga,
      locationVillage: session.dataLocationVillage,
      locationLatitude: session.dataLocationLatitude,
      locationLongitude: session.dataLocationLongitude,
      descriptionText: session.dataDescription,
      descriptionLanguage: session.language,
      status: 'received',
      metadataReceivedVia: this.provider,
      metadataReportTimestamp: new Date(),
    }, { transaction });

    // Trigger escalation engine – if this fails, the transaction will rollback
    const escalationService = require('./escalationService');
    await escalationService.processIncident(incident, { transaction });

    return incident;
  }

  /**
   * Get menu for the specified language
   */
  getLocalizedMenu(lang) {
    return lang === 'hausa' ? this.menus.hausa : this.menus.english;
  }

  /**
   * Get a specific prompt from the configuration
   */
  getLocalizedPrompt(lang, promptKey) {
    const menu = this.getLocalizedMenu(lang);
    // Fallback to English if key missing
    return menu[promptKey] || (lang === 'hausa' ? this.menus.english[promptKey] : '');
  }

  /**
   * Get menu response (continue/end) based on menu key
   */
  getMenuResponse(session, menuKey) {
    const message = this.getLocalizedPrompt(session.language, menuKey);
    // For 'timeout' and 'thankYou' we want to end the session
    if (menuKey === 'timeout' || menuKey === 'thankYou') {
      return this.endResponse(message);
    }
    // For others, continue
    return this.continueResponse(message);
  }

  /**
   * Get latest alerts (cached)
   */
  async getLatestAlerts(lang) {
    const now = Date.now();
    if (alertCache.data && (now - alertCache.timestamp) < alertCache.ttl) {
      return alertCache.data;
    }

    const alerts = await Alert.findAll({
      where: {
        status: 'active',
        validFrom: { [Op.lte]: new Date() },
        [Op.or]: [
          { validUntil: null },
          { validUntil: { [Op.gte]: new Date() } }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 3,
    });

    let result;
    if (alerts.length === 0) {
      result = this.getLocalizedPrompt(lang, 'noAlerts') || 'No new alerts.';
    } else {
      result = alerts.map(a => {
        const content = (lang === 'hausa' ? a.contentHausa : a.contentEnglish) || a.contentHausa || '';
        return `${a.alertId}: ${content.substring(0, 100)}`;
      }).join('\n\n');
    }

    alertCache.data = result;
    alertCache.timestamp = now;
    return result;
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(session) {
    const now = Date.now();
    const lastActivity = new Date(session.lastActivityAt).getTime();
    return (now - lastActivity) > this.sessionTimeout;
  }

  /**
   * End session
   */
  async endSession(session, reason) {
    session.state = reason === 'timeout' ? 'timeout' : 'completed';
    session.endedAt = new Date();
    await session.save();
  }

  /**
   * Generate continue response (USSD continue)
   */
  continueResponse(message) {
    return {
      response: 'continue',
      message: this.truncateForUssd(message),
    };
  }

  /**
   * Generate end response (USSD end)
   */
  endResponse(message) {
    return {
      response: 'end',
      message: this.truncateForUssd(message),
    };
  }

  /**
   * Truncate message to configured max length
   */
  truncateForUssd(message) {
    if (message.length <= this.maxMessageLength) return message;
    return message.substring(0, this.maxMessageLength - 3) + '...';
  }
}

module.exports = new UssdGateway();
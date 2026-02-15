const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const config = require('../config');
const { UssdSession, Incident, Alert } = require('../models');

class UssdGateway {
  constructor() {
    this.menus = config.ussdMenus;
    this.sessionTimeout = config.ussd.sessionTimeoutMs;
    this.provider = config.ussd.provider || 'africastalking';
  }

  /**
   * Handle incoming USSD request
   */
  async handleRequest(params) {
    const { sessionId, phoneNumber, input, serviceCode, operator, provider } = params;

    // Check or create session
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

    // Update session
    await this.updateSession(session, input, response);

    return response;
  }

  /**
   * Create new USSD session
   */
  async createSession(sessionId, phoneNumber) {
    const session = await UssdSession.create({
      sessionId,
      phoneNumber,
      language: 'hausa', // Default to Hausa
      state: 'main_menu',
      currentStep: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });
    return session;
  }

  /**
   * Process user input based on current state
   */
  async processInput(session, input) {
    const normalizedInput = input ? input.trim() : '';

    switch (session.state) {
      case 'idle':
        return this.handleMainMenu(session, normalizedInput);

      case 'main_menu':
        return this.handleMainMenu(session, normalizedInput);

      case 'incident_type_selection':
        return this.handleIncidentTypeSelection(session, normalizedInput);

      case 'incident_category':
        return this.handleIncidentCategory(session, normalizedInput);

      case 'severity_selection':
        return this.handleSeveritySelection(session, normalizedInput);

      case 'location_selection':
        return this.handleLocationSelection(session, normalizedInput);

      case 'description':
        return this.handleDescription(session, normalizedInput);

      case 'callback_consent':
        return this.handleCallbackConsent(session, normalizedInput);

      case 'confirmation':
        return this.handleConfirmation(session, normalizedInput);

      case 'completed':
        // Session completed, restart
        return this.handleMainMenu(session, '');

      default:
        return this.getMenuResponse(session, 'invalid');
    }
  }

  /**
   * Handle main menu selection
   */
  async handleMainMenu(session, input) {
    const menu = session.language === 'hausa' ? this.menus.hausa : this.menus.english;

    if (!input || input === '') {
      session.state = 'main_menu';
      session.currentStep = 1;
      return this.getMenuResponse(session, 'welcome');
    }

    const choice = parseInt(input, 10);

    switch (choice) {
      case 1: // Report suspicious activity
        session.state = 'incident_category';
        session.dataIncidentType = 'suspicious_activity';
        return this.getMenuResponse(session, 'suspiciousActivity');

      case 2: // Report incident in progress
        session.state = 'incident_category';
        session.dataIncidentType = 'incident_in_progress';
        return this.getMenuResponse(session, 'incidentInProgress');

      case 3: // Request help
        session.state = 'incident_category';
        session.dataIncidentType = 'request_help';
        return this.getMenuResponse(session, 'requestHelp');

      case 4: // Read alerts (check for active alerts)
        const alertText = await this.getLatestAlerts(session);
        return this.endWithAlert(session, alertText);

      case 5: // Repeat menu
        return this.getMenuResponse(session, 'welcome');

      default:
        return this.getMenuResponse(session, 'invalid');
    }
  }

  /**
   * Handle incident category selection
   */
  async handleIncidentTypeSelection(session, input) {
    // Handle menu directly without intermediate step
    return this.handleIncidentCategory(session, input);
  }

  /**
   * Handle incident category selection
   */
  async handleIncidentCategory(session, input) {
    const choice = parseInt(input, 10);
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
    return this.getSeverityPrompt(session);
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
      // Default to medium if invalid
      session.dataSeverity = 'medium';
    }

    session.state = 'location_selection';
    return this.getLocationPrompt(session);
  }

  /**
   * Handle location selection
   */
  async handleLocationSelection(session, input) {
    const choice = parseInt(input, 10);

    if (choice === 1) {
      // Use cell tower location (automatic)
      session.state = 'description';
      return this.getDescriptionPrompt(session);
    } else if (choice === 2) {
      // Manual village selection - show state/LGA list
      session.state = 'description';
      return this.getDescriptionPrompt(session);
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
    return this.getCallbackPrompt(session);
  }

  /**
   * Handle callback consent
   */
  async handleCallbackConsent(session, input) {
    const choice = parseInt(input, 10);

    session.dataCallbackConsent = (choice === 1);
    session.state = 'confirmation';
    return this.getConfirmationPrompt(session);
  }

  /**
   * Handle final confirmation
   */
  async handleConfirmation(session, input) {
    const choice = parseInt(input, 10);

    if (choice === 1) {
      // Submit the report
      try {
        const incident = await this.createIncident(session);
        session.incidentCreated = true;
        session.incidentId = incident.incidentId;
        session.state = 'completed';
        await session.save();

        const menu = session.language === 'hausa' ? this.menus.hausa : this.menus.english;
        const responseText = menu.thankYou.replace('{incidentId}', incident.incidentId);
        return this.endResponse(responseText);
      } catch (error) {
        console.error('Error creating incident:', error);
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
   * Create incident from session data
   */
  async createIncident(session) {
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
    });

    // Trigger escalation engine
    const escalationService = require('./escalationService');
    await escalationService.processIncident(incident);

    return incident;
  }

  /**
   * Get menu response
   */
  getMenuResponse(session, menuKey) {
    const menu = session.language === 'hausa' ? this.menus.hausa : this.menus.english;
    let response = menu[menuKey] || menu.invalid;

    // Update session state
    if (menuKey !== 'invalid') {
      session.state = this.getStateFromMenu(menuKey);
    }

    return this.continueResponse(response);
  }

  /**
   * Get state from menu key
   */
  getStateFromMenu(menuKey) {
    const stateMap = {
      welcome: 'main_menu',
      suspiciousActivity: 'incident_category',
      incidentInProgress: 'incident_category',
      requestHelp: 'incident_category',
    };
    return stateMap[menuKey] || 'main_menu';
  }

  /**
   * Get severity prompt
   */
  getSeverityPrompt(session) {
    const severityText = session.language === 'hausa'
      ? 'Matakara?: 1. Ƙasa 2. Matsakaici 3. Babba 4. Cyrori'
      : 'Severity?: 1. Low 2. Medium 3. High 4. Critical';
    return this.continueResponse(severityText);
  }

  /**
   * Get location prompt
   */
  getLocationPrompt(session) {
    const prompt = session.language === 'hausa'
      ? 'Wuri:\n1. Amfani da wata mashin\n2. Zaba wuri da hannu'
      : 'Location:\n1. Auto (cell tower)\n2. Manual select';
    return this.continueResponse(prompt);
  }

  /**
   * Get description prompt
   */
  getDescriptionPrompt(session) {
    const prompt = session.language === 'hausa'
      ? 'Rubuta bayani (ko bar shi fanko):'
      : 'Add description (or leave blank):';
    return this.continueResponse(prompt);
  }

  /**
   * Get callback consent prompt
   */
  getCallbackPrompt(session) {
    const prompt = session.language === 'hausa'
      ? 'Shin kana so su Kira ku?:\n1. Eh\n2. A\'a'
      : 'Can we call you back?:\n1. Yes\n2. No';
    return this.continueResponse(prompt);
  }

  /**
   * Get confirmation prompt
   */
  getConfirmationPrompt(session) {
    const summary = this.getIncidentSummary(session);
    const prompt = session.language === 'hausa'
      ? `${summary}\n\nAika? 1. Eh 2. A\'a`
      : `${summary}\n\nSubmit? 1. Yes 2. No`;
    return this.continueResponse(prompt);
  }

  /**
   * Get incident summary for confirmation
   */
  getIncidentSummary(session) {
    const type = session.dataIncidentType || 'Unknown';
    const severity = session.dataSeverity || 'Medium';
    const desc = session.dataDescription || '';
    return `Type: ${type}\nSeverity: ${severity}\nDesc: ${desc}`;
  }

  /**
   * Get latest alerts for user
   */
  async getLatestAlerts(session) {
    const alerts = await Alert.findAll({
      where: {
        status: 'active',
        validFrom: { [Op.lte]: new Date() },
        [Op.or]: [
          { validUntil: { [Op.is]: null } },
          { validUntil: { [Op.gte]: new Date() } }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 3,
    });

    if (alerts.length === 0) {
      return session.language === 'hausa'
        ? 'Babu alerta da sabo.'
        : 'No new alerts.';
    }

    return alerts.map(a => {
      const content = session.language === 'hausa' ? a.contentHausa : a.contentEnglish || a.contentHausa || '';
      return `${a.alertId}: ${content.substring(0, 100)}`;
    }).join('\n\n');
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
   * Update session after processing
   */
  async updateSession(session, input, response) {
    session.lastActivityAt = new Date();
    session.currentStep++;

    // If session ended, mark it
    if (response && response.endSession) {
      session.endedAt = new Date();
    }

    await session.save();
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
   * End with alert display
   */
  endWithAlert(session, alertText) {
    return {
      response: 'end',
      message: this.truncateForUssd(alertText),
    };
  }

  /**
   * Truncate message for USSD (typically 182 characters max)
   */
  truncateForUssd(message) {
    const maxLength = 182;
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
  }
}

module.exports = new UssdGateway();

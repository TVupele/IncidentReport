const { Op } = require('sequelize');
const { Alert, Incident } = require('../models');
const notificationService = require('./notificationService');

class AlertBroadcastService {
  constructor() {
    this.broadcastQueue = [];
    this.isProcessing = false;
  }

  /**
   * Create and broadcast a new alert
   */
  async createAndBroadcast(alertData, options = {}) {
    // Create alert
    const alert = await Alert.create({
      titleHausa: alertData.titleHausa,
      titleEnglish: alertData.titleEnglish,
      contentHausa: alertData.contentHausa,
      contentEnglish: alertData.contentEnglish,
      alertType: alertData.alertType,
      severity: alertData.severity,
      targetAreaState: alertData.targetAreaState,
      targetAreaLgas: alertData.targetAreaLgas || [],
      targetAreaVillages: alertData.targetAreaVillages || [],
      targetAreaGeohashes: alertData.targetAreaGeohashes || [],
      targetAreaRadius: alertData.targetAreaRadius,
      targetAreaLatitude: alertData.targetAreaLatitude,
      targetAreaLongitude: alertData.targetAreaLongitude,
      validFrom: alertData.validFrom || new Date(),
      validUntil: alertData.validUntil,
      status: 'active',
      createdByUserId: options.createdByUserId,
      createdByName: options.createdByName,
      createdByRole: options.createdByRole,
    });

    // Start broadcast asynchronously
    this.queueBroadcast(alert, options);

    return alert;
  }

  /**
   * Queue broadcast for async processing
   */
  queueBroadcast(alert, options = {}) {
    this.broadcastQueue.push({
      alert,
      options,
      queuedAt: new Date(),
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process broadcast queue
   */
  async processQueue() {
    if (this.broadcastQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const { alert, options } = this.broadcastQueue.shift();

    try {
      const result = await this.broadcastAlert(alert, options);
      console.log(`Alert ${alert.alertId} broadcast completed:`, result);
    } catch (error) {
      console.error(`Alert ${alert.alertId} broadcast failed:`, error);
      // Requeue for retry
      this.broadcastQueue.unshift({ alert, options, retryCount: (options.retryCount || 0) + 1 });
    }

    // Continue processing
    this.processQueue();
  }

  /**
   * Broadcast alert to affected subscribers
   */
  async broadcastAlert(alert, options = {}) {
    // Find subscribers in target area
    const subscribers = await this.findSubscribers(alert);

    if (subscribers.length === 0) {
      console.log(`No subscribers found for alert ${alert.alertId}`);
      return { sent: 0, failed: 0, total: 0 };
    }

    // Format message
    const message = this.formatAlertMessage(alert);

    // Send bulk SMS
    const result = await notificationService.sendBulkSms(subscribers, message, {
      type: 'alert',
      alertId: alert.alertId,
    });

    // Update alert stats
    await alert.update({
      statsSentCount: result.total,
      statsDeliveredCount: result.sent,
    });

    return result;
  }

  /**
   * Find subscribers in target area
   */
  async findSubscribers(alert) {
    // For MVP, we broadcast to all subscribers who opted in
    // In production, filter by geolocation

    // Find recent incident reporters who gave consent
    const recentReporters = await Incident.findAll({
      where: {
        reporterCallbackConsent: true,
        createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
      attributes: ['reporterPhoneNumber'],
      group: ['reporterPhoneNumber'],
    });

    return recentReporters.map(r => ({
      phone: r.reporterPhoneNumber,
      name: 'Subscriber',
    }));
  }

  /**
   * Format alert message for SMS
   */
  formatAlertMessage(alert) {
    const content = alert.contentHausa || '';
    const title = alert.titleHausa || '';

    // Truncate for SMS (160 chars)
    const maxLength = 150;
    let message = `[${alert.severity.toUpperCase()}] ${title}\n${content}`;
    
    if (message.length > maxLength) {
      message = message.substring(0, maxLength - 3) + '...';
    }

    return message;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(filters = {}) {
    const where = {
      status: 'active',
    };

    // Filter by location if provided
    if (filters.state) {
      where.targetAreaState = filters.state;
    }

    if (filters.lga) {
      where.targetAreaLgas = { [Op.contains]: [filters.lga] };
    }

    return Alert.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Expire old alerts
   */
  async expireAlerts() {
    const now = new Date();
    
    const [count] = await Alert.update(
      { status: 'expired' },
      {
        where: {
          status: 'active',
          validUntil: { [Op.lte]: now },
        },
      }
    );

    return { expiredCount: count };
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(filters = {}) {
    const where = {};

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt[Op.gte] = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt[Op.lte] = new Date(filters.dateTo);
    }

    const alerts = await Alert.findAll({ where });

    return {
      total: alerts.length,
      byStatus: {
        active: alerts.filter(a => a.status === 'active').length,
        expired: alerts.filter(a => a.status === 'expired').length,
        draft: alerts.filter(a => a.status === 'draft').length,
      },
      byType: {},
      bySeverity: {},
      totalRecipients: alerts.reduce((sum, a) => sum + (a.statsSentCount || 0), 0),
      deliveryRate: 0,
    };
  }

  /**
   * Cancel an alert
   */
  async cancelAlert(alertId, cancelledBy) {
    const alert = await Alert.findOne({ where: { alertId } });
    
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = 'cancelled';
    await alert.save();

    return alert;
  }

  /**
   * Get alert by ID
   */
  async getById(alertId) {
    return Alert.findOne({ where: { alertId } });
  }

  /**
   * List alerts with pagination
   */
  async listAlerts(options = {}) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const offset = (page - 1) * limit;

    const where = {};
    if (options.status) where.status = options.status;
    if (options.alertType) where.alertType = options.alertType;

    const [alerts, total] = await Promise.all([
      Alert.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
      Alert.count({ where }),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new AlertBroadcastService();

const axios = require('axios');
const config = require('../config');

class NotificationService {
  constructor() {
    // Initialize Africa's Talking client if credentials are available
    if (config.africastalking.apiKey && config.africastalking.username) {
      this.africastalking = {
        apiKey: config.africastalking.apiKey,
        username: config.africastalking.username,
      };
    }
    
    // Initialize Twilio client if credentials are available (fallback)
    // Must have valid accountSid (starts with AC) and authToken
    if (config.twilio.accountSid && 
        config.twilio.accountSid.startsWith('AC') && 
        config.twilio.authToken && 
        config.twilio.authToken !== 'your_auth_token') {
      const twilio = require('twilio');
      this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    } else {
      console.log('Twilio not configured - using Africa\'s Talking only');
    }
    
    // Message queue for offline support
    this.messageQueue = [];
  }

  /**
   * Send SMS notification using Africa's Talking (primary) or Twilio (fallback)
   */
  async sendSms(to, message, options = {}) {
    const phoneNumber = this.formatPhoneNumber(to);
    
    if (!phoneNumber) {
      console.error(`Invalid phone number: ${to}`);
      return { success: false, error: 'Invalid phone number' };
    }

    try {
      // Try Africa's Talking first
      if (this.africastalking) {
        const result = await this.sendViaAfricasTalking(phoneNumber, message);
        if (result.success) {
          return result;
        }
      }
      
      // Fallback to Twilio if available
      if (this.twilioClient) {
        const result = await this.sendViaTwilio(phoneNumber, message);
        return result;
      }
      
      // Fallback: log message (for development)
      console.log(`[SMS] To: ${phoneNumber}, Message: ${message}`);
      return {
        success: true,
        messageId: `dev-${Date.now()}`,
        status: 'sent',
      };
    } catch (error) {
      console.error(`SMS send failed: ${error.message}`);
      
      // Queue for retry
      this.queueMessage('sms', { to: phoneNumber, message, options });
      
      return {
        success: false,
        error: error.message,
        queued: true,
      };
    }
  }

  /**
   * Send SMS via Africa's Talking API
   */
  async sendViaAfricasTalking(phoneNumber, message) {
    const { apiKey, username } = this.africastalking;
    
    try {
      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        {
          to: phoneNumber,
          message: message,
          from: config.africastalking.shortCode,
        },
        {
          headers: {
            'apiKey': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const data = response.data;
      
      if (data.SMSMessageData && data.SMSMessageData.Recipients) {
        const recipient = data.SMSMessageData.Recipients[0];
        if (recipient.status === 'Success') {
          return {
            success: true,
            messageId: recipient.messageId,
            status: 'sent',
            provider: 'africastalking',
          };
        } else {
          return {
            success: false,
            error: recipient.status,
            provider: 'africastalking',
          };
        }
      }
      
      return { success: true, messageId: data.UID, status: 'sent' };
    } catch (error) {
      console.error(`Africa's Talking SMS error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send SMS via Twilio (fallback)
   */
  async sendViaTwilio(phoneNumber, message) {
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: config.twilio.phoneNumber,
        to: phoneNumber,
      });
      
      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        provider: 'twilio',
      };
    } catch (error) {
      console.error(`Twilio SMS error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send escalation notification
   */
  async sendEscalationNotification(incident, rule) {
    const assignee = incident.escalation.assignedTo;
    if (!assignee || !assignee.contactPhone) {
      console.warn(`No assignee phone for incident ${incident.incidentId}`);
      return;
    }

    const message = this.formatEscalationMessage(incident, rule);
    
    await this.sendSms(assignee.contactPhone, message, {
      type: 'escalation',
      incidentId: incident.incidentId,
      priority: rule.escalation?.level || incident.severity,
    });
  }

  /**
   * Send alert to subscribers
   */
  async sendAlert(alert, subscribers = []) {
    const message = this.formatAlertMessage(alert);
    const results = [];

    for (const subscriber of subscribers) {
      const result = await this.sendSms(subscriber.phone, message, {
        type: 'alert',
        alertId: alert.alertId,
      });
      results.push({
        phone: subscriber.phone,
        ...result,
      });
    }

    return {
      alertId: alert.alertId,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Send confirmation to reporter
   */
  async sendReporterConfirmation(incident) {
    if (!incident.reporter.callbackConsent) {
      return { skipped: 'no_consent' };
    }

    const phone = incident.reporter.phoneNumber;
    if (!phone) {
      return { skipped: 'no_phone' };
    }

    const message = this.formatConfirmationMessage(incident);
    
    return this.sendSms(phone, message, {
      type: 'confirmation',
      incidentId: incident.incidentId,
    });
  }

  /**
   * Send bulk SMS (for announcements)
   */
  async sendBulkSms(recipients, message, options = {}) {
    const results = [];
    
    // Process in batches to avoid rate limiting
    const batchSize = 50;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(recipient => 
          this.sendSms(recipient.phone, message, { ...options, recipientName: recipient.name })
        )
      );
      
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      total: recipients.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Queue message for retry
   */
  queueMessage(type, data) {
    this.messageQueue.push({
      type,
      data,
      timestamp: new Date(),
      retryCount: 0,
    });
  }

  /**
   * Process queued messages
   */
  async processQueue() {
    if (this.messageQueue.length === 0) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of messages) {
      if (msg.retryCount >= 3) {
        console.warn(`Max retries reached for queued message`);
        continue;
      }

      msg.retryCount++;
      
      try {
        if (msg.type === 'sms') {
          await this.sendSms(msg.data.to, msg.data.message, msg.data.options);
        }
      } catch (error) {
        console.error(`Queue processing failed: ${error.message}`);
        this.messageQueue.push(msg);
      }
    }
  }

  /**
   * Format escalation message
   */
  formatEscalationMessage(incident, rule) {
    const severity = incident.severity?.toUpperCase() || 'MEDIUM';
    const type = incident.incidentType?.replace('_', ' ').toUpperCase() || 'INCIDENT';
    const id = incident.incidentId;
    const loc = incident.location?.village || incident.location?.lga || 'Unknown';
    const desc = incident.description?.text?.substring(0, 100) || 'No description';
    
    return `ESCALATION ${severity}\n` +
      `Type: ${type}\n` +
      `ID: ${id}\n` +
      `Location: ${loc}\n` +
      `Desc: ${desc}\n` +
      `SLA: ${rule.escalation?.slaMinutes || 60}min`;
  }

  /**
   * Format alert message
   */
  formatAlertMessage(alert) {
    const type = alert.type?.toUpperCase() || 'ALERT';
    const severity = alert.severity?.toUpperCase() || 'INFO';
    const content = alert.content?.english || alert.content?.hausa || '';
    
    return `[${type} ${severity}]\n${content.substring(0, 150)}`;
  }

  /**
   * Format confirmation message
   */
  formatConfirmationMessage(incident) {
    return `Your report (${incident.incidentId}) has been received. ` +
      `Severity: ${incident.severity?.toUpperCase()}. ` +
      `We may contact you if needed. Thank you for keeping your community safe.`;
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    
    // Handle Nigerian numbers
    if (digits.startsWith('234')) {
      return `+${digits}`;
    }
    
    if (digits.startsWith('0')) {
      return `+234${digits.substring(1)}`;
    }
    
    if (digits.length === 10) {
      return `+234${digits}`;
    }
    
    // Return as-is if can't parse
    return `+${digits}`;
  }
}

module.exports = new NotificationService();

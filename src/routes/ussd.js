const express = require('express');
const router = express.Router();
const { ussdService } = require('../services');
const { rateLimiterService } = require('../services');
const config = require('../config');

/**
 * @route POST /api/v1/ussd
 * @description Handle incoming USSD requests (Africa's Talking webhook)
 */
router.post('/',
  async (req, res) => {
    try {
      // Extract USSD parameters based on provider
      const provider = config.ussd.provider;
      
      let sessionId, phoneNumber, input, serviceCode, operator;
      
      if (provider === 'africastalking') {
        // Africa's Talking format
        const { sessionId: atSessionId, phoneNumber: atPhone, text, serviceCode: atServiceCode, operator: atOperator } = req.body;
        sessionId = atSessionId;
        phoneNumber = atPhone;
        input = text;
        serviceCode = atServiceCode;
        operator = atOperator;
      } else if (provider === 'hub2') {
        // Hub2 format
        const { session_id, msisdn, ussd_text, operator_name } = req.body;
        sessionId = session_id;
        phoneNumber = msisdn;
        input = ussd_text;
        serviceCode = config.ussd.shortCode;
        operator = operator_name;
      } else {
        // Twilio format (fallback)
        const { SessionId, MobileNumber, UserInput, ServiceCode, Operator } = req.body;
        sessionId = SessionId;
        phoneNumber = MobileNumber;
        input = UserInput;
        serviceCode = ServiceCode;
        operator = Operator;
      }

      // Validate required fields
      if (!sessionId || !phoneNumber) {
        return res.status(400).json({
          error: 'Missing required fields: sessionId, phoneNumber',
        });
      }

      // Rate limit by phone number
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      const rateLimitResult = await rateLimiterService.checkRateLimit(cleanPhoneNumber, {
        prefix: 'ussd',
        maxRequests: 20,
        windowMs: 3600000, // 1 hour
      });

      if (rateLimitResult.limited) {
        // Return USSD response for rate limit
        if (provider === 'africastalking') {
          return res.send(`CON You have exceeded the rate limit. Please try again later.`);
        }
        return res.status(429).json({
          error: 'Rate limit exceeded',
        });
      }

      // Process USSD request
      const result = await ussdService.handleRequest({
        sessionId,
        phoneNumber,
        input,
        serviceCode,
        operator,
        provider,
      });

      // Send USSD response based on provider format
      if (provider === 'africastalking') {
        // Africa's Talking: CON for continue, END for end
        if (result.response === 'end') {
          res.set('Content-Type', 'text/plain');
          res.send(`END ${result.message}`);
        } else {
          res.set('Content-Type', 'text/plain');
          res.send(`CON ${result.message}`);
        }
      } else if (provider === 'hub2') {
        // Hub2: "1" to continue, "0" to end
        if (result.response === 'end') {
          res.json({
            ussd_response: {
             SESSIONID: sessionId,
              MENU: result.message,
              ACTION: 0, // End
            }
          });
        } else {
          res.json({
            ussd_response: {
              SESSIONID: sessionId,
              MENU: result.message,
              ACTION: 1, // Continue
            }
          });
        }
      } else {
        // Twilio format (fallback)
        if (result.response === 'end') {
          res.set('Content-Type', 'text/plain');
          res.send(`END ${result.message}`);
        } else {
          res.set('Content-Type', 'text/plain');
          res.send(`CON ${result.message}`);
        }
      }
    } catch (error) {
      console.error('USSD handling error:', error);
      
      // Return error response based on provider
      const provider = config.ussd.provider;
      if (provider === 'africastalking') {
        res.set('Content-Type', 'text/plain');
        res.send('END An error occurred. Please try again.');
      } else {
        res.status(500).json({
          error: 'Failed to process USSD request',
          message: error.message,
        });
      }
    }
  }
);

/**
 * @route POST /api/v1/ussd/callback
 * @description Handle USSD callback for session completion (Africa's Talking)
 */
router.post('/callback', async (req, res) => {
  try {
    const { sessionId, phoneNumber, text, status } = req.body;
    
    console.log(`USSD Callback - Session: ${sessionId}, Phone: ${phoneNumber}, Status: ${status}`);
    
    // Process any final actions after USSD session ends
    if (status === 'Timeout' || status === 'Terminated') {
      // Log session termination for analytics
      const { UssdSession } = require('../models');
      await UssdSession.update(
        { endedAt: new Date(), state: status.toLowerCase() },
        { where: { sessionId } }
      );
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('USSD callback error:', error);
    res.status(500).send('Error processing callback');
  }
});

/**
 * @route POST /api/v1/ussd/simulate
 * @description Simulate USSD request (for testing)
 */
router.post('/simulate', async (req, res) => {
  try {
    const {
      sessionId,
      phoneNumber,
      input,
      language = 'hausa',
      provider = 'africastalking',
    } = req.body;

    if (!sessionId || !phoneNumber) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, phoneNumber',
      });
    }

    // Create a mock USSD session
    const result = await ussdService.handleRequest({
      sessionId,
      phoneNumber,
      input,
      serviceCode: config.ussd.shortCode,
      operator: 'SIMULATION',
      provider,
    });

    res.json({
      success: true,
      response: result,
      sessionInfo: {
        sessionId,
        phoneNumber,
        provider,
      },
    });
  } catch (error) {
    console.error('USSD simulation error:', error);
    res.status(500).json({
      error: 'Simulation failed',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/ussd/session/:sessionId
 * @description Get USSD session status
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { UssdSession } = require('../models');
    
    const session = await UssdSession.findOne({ where: { sessionId: req.params.sessionId } });

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
      });
    }

    // Return session without stepHistory for performance
    const sessionData = session.toJSON();
    delete sessionData.stepHistory;

    res.json({
      success: true,
      session: sessionData,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/ussd/health
 * @description Check USSD service health
 */
router.get('/health', async (req, res) => {
  res.json({
    success: true,
    provider: config.ussd.provider,
    shortCode: config.ussd.shortCode,
    status: 'operational',
  });
});

module.exports = router;

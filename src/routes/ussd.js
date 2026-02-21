const express = require('express');
const router = express.Router();
const { ussdService, rateLimiterService } = require('../services');
const config = require('../config');

// Import models once at the top
const { UssdSession } = require('../models');

// Structured logger placeholder – replace with actual logger (e.g., Winston, Pino)
const logger = {
  info: (...args) => console.log(new Date().toISOString(), ...args),
  error: (...args) => console.error(new Date().toISOString(), ...args),
};

// Provider parameter extractors
const providerParamExtractors = {
  africastalking: (body) => ({
    sessionId: body.sessionId,
    phoneNumber: body.phoneNumber,
    input: body.text,
    serviceCode: body.serviceCode,
    operator: body.operator,
  }),
  hub2: (body) => ({
    sessionId: body.session_id,
    phoneNumber: body.msisdn,
    input: body.ussd_text,
    serviceCode: config.ussd.shortCode,
    operator: body.operator_name,
  }),
  // Fallback (Twilio-like)
  default: (body) => ({
    sessionId: body.SessionId,
    phoneNumber: body.MobileNumber,
    input: body.UserInput,
    serviceCode: body.ServiceCode || config.ussd.shortCode,
    operator: body.Operator,
  }),
};

// Provider response formatters
const providerResponseFormatters = {
  africastalking: (message, isEnd) => ({
    type: 'text',
    body: `${isEnd ? 'END' : 'CON'} ${message}`,
  }),
  hub2: (message, isEnd, sessionId) => ({
    type: 'json',
    body: {
      ussd_response: {
        SESSIONID: sessionId,
        MENU: message,
        ACTION: isEnd ? 0 : 1,
      },
    },
  }),
  default: (message, isEnd) => ({
    type: 'text',
    body: `${isEnd ? 'END' : 'CON'} ${message}`,
  }),
};

/**
 * @route POST /api/v1/ussd
 * @description Handle incoming USSD requests
 */
router.post('/', async (req, res) => {
  logger.info('Incoming USSD request', { body: req.body });
  const provider = config.ussd.provider;
  const extractor = providerParamExtractors[provider] || providerParamExtractors.default;
  const params = extractor(req.body);
  logger.info('Extracted USSD params', { params });

  const { sessionId, phoneNumber, input, serviceCode, operator } = params;

  // Validate required fields
  if (!sessionId || !phoneNumber) {
    logger.error('Missing required fields', { sessionId, phoneNumber });
    return sendErrorResponse(res, provider, 'Missing required fields');
  }

  // Rate limiting
  const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
  const rateLimitResult = await rateLimiterService.checkRateLimit(cleanPhoneNumber, {
    prefix: 'ussd',
    maxRequests: config.rateLimit.ussdMaxRequests || 20,
    windowMs: config.rateLimit.ussdWindowMs || 3600000,
  });

  if (rateLimitResult.limited) {
    logger.warn('Rate limit exceeded', { phoneNumber: cleanPhoneNumber });
    return sendProviderResponse(res, provider, sessionId, 'You have exceeded the rate limit. Please try again later.', true);
  }

  try {
    // Process USSD request
    const result = await ussdService.handleRequest({
      sessionId,
      phoneNumber,
      input,
      serviceCode,
      operator,
      provider,
    });

    sendProviderResponse(res, provider, sessionId, result.message, result.response === 'end');
  } catch (error) {
    logger.error('USSD handling error', { error: error.message, sessionId, phoneNumber });
    sendProviderResponse(res, provider, sessionId, 'An error occurred. Please try again.', true);
  }
});

/**
 * Helper to send provider‑specific responses
 */
function sendProviderResponse(res, provider, sessionId, message, isEnd) {
  const formatter = providerResponseFormatters[provider] || providerResponseFormatters.default;
  const response = formatter(message, isEnd, sessionId);

  if (response.type === 'text') {
    res.set('Content-Type', 'text/plain; charset=utf-8').send(response.body);
  } else {
    res.json(response.body);
  }
}

/**
 * Helper to send error responses (client or server)
 */
function sendErrorResponse(res, provider, message, status = 400) {
  if (provider === 'africastalking' || provider === 'default') {
    res.set('Content-Type', 'text/plain; charset=utf-8').status(status).send(`END ${message}`);
  } else {
    res.status(status).json({ error: message });
  }
}

/**
 * @route POST /api/v1/ussd/callback
 * @description Handle USSD callback for session completion (Africa's Talking)
 */
router.post('/callback', async (req, res) => {
  try {
    const { sessionId, phoneNumber, text, status } = req.body;

    logger.info('USSD Callback received', { sessionId, phoneNumber, status });

    if (status === 'Timeout' || status === 'Terminated') {
      await UssdSession.update(
        {
          endedAt: new Date(),
          state: status.toLowerCase(),
        },
        { where: { sessionId } }
      );
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('USSD callback error', { error: error.message, body: req.body });
    res.status(500).send('Error processing callback');
  }
});

/**
 * @route POST /api/v1/ussd/simulate
 * @description Simulate USSD request – disabled in production
 */
if (config.env !== 'production') {
  router.post('/simulate', async (req, res) => {
    try {
      const { sessionId, phoneNumber, input, language = 'hausa', provider = 'africastalking' } = req.body;

      if (!sessionId || !phoneNumber) {
        return res.status(400).json({ error: 'Missing required fields: sessionId, phoneNumber' });
      }

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
        sessionInfo: { sessionId, phoneNumber, provider },
      });
    } catch (error) {
      logger.error('USSD simulation error', { error: error.message });
      res.status(500).json({ error: 'Simulation failed', message: error.message });
    }
  });
} else {
  // Return 404 in production
  router.post('/simulate', (req, res) => res.status(404).json({ error: 'Not found' }));
}

/**
 * @route GET /api/v1/ussd/session/:sessionId
 * @description Get USSD session status
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await UssdSession.findOne({
      where: { sessionId: req.params.sessionId },
      attributes: { exclude: ['stepHistory'] }, // Exclude large field directly
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Get session error', { error: error.message, sessionId: req.params.sessionId });
    res.status(500).json({ error: 'Failed to get session', message: error.message });
  }
});

/**
 * @route GET /api/v1/ussd/health
 * @description Check USSD service health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    provider: config.ussd.provider,
    shortCode: config.ussd.shortCode,
    status: 'operational',
  });
});

module.exports = router;
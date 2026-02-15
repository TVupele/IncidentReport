const express = require('express');
const router = express.Router();
const { incidentIngestionService } = require('../services');
const { rateLimiterService } = require('../services');

/**
 * @route POST /api/v1/incidents
 * @description Submit a new incident report (from mobile/web)
 */
router.post('/', 
  rateLimiterService.createMiddleware({
    maxRequests: 10,
    windowMs: 900000, // 15 minutes
  }),
  async (req, res) => {
    try {
      const {
        channel = 'web',
        incidentType,
        severity,
        latitude,
        longitude,
        accuracy,
        description,
        photoUrls,
        audioUrl,
        phoneNumber,
        callbackConsent = false,
        language = 'hausa',
        state,
        lga,
        village,
      } = req.body;

      // Validate required fields
      if (!incidentType) {
        return res.status(400).json({
          error: 'Missing required field: incidentType',
        });
      }

      const reportData = {
        channel,
        incidentType,
        severity,
        latitude,
        longitude,
        accuracy,
        gpsTimestamp: accuracy ? new Date() : null,
        description,
        photoUrls,
        audioUrl,
        phoneNumber,
        callbackConsent,
        language,
        state,
        lga,
        village,
      };

      const sourceInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        deviceInfo: req.get('X-Device-Info'),
      };

      const incident = await incidentIngestionService.createFromApi(reportData, sourceInfo);

      res.status(201).json({
        success: true,
        incidentId: incident.incidentId,
        message: 'Report submitted successfully',
        status: incident.status,
      });
    } catch (error) {
      console.error('Incident submission error:', error);
      res.status(500).json({
        error: 'Failed to submit incident',
        message: error.message,
      });
    }
  }
);

/**
 * @route GET /api/v1/incidents/:id
 * @description Get incident by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const incident = await incidentIngestionService.getById(req.params.id);
    
    if (!incident) {
      return res.status(404).json({
        error: 'Incident not found',
      });
    }

    res.json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({
      error: 'Failed to get incident',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/incidents
 * @description List incidents with filters
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      incidentType,
      severity,
      state,
      lga,
      channel,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = req.query;

    const filters = {
      status,
      incidentType,
      severity,
      state,
      lga,
      channel,
      dateFrom,
      dateTo,
    };

    const options = {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
    };

    const result = await incidentIngestionService.getIncidents(filters, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('List incidents error:', error);
    res.status(500).json({
      error: 'Failed to list incidents',
      message: error.message,
    });
  }
});

/**
 * @route PATCH /api/v1/incidents/:id/status
 * @description Update incident status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, note, noteAuthor } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing required field: status',
      });
    }

    const incident = await incidentIngestionService.updateStatus(
      req.params.id,
      status,
      { note, noteAuthor }
    );

    res.json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      error: 'Failed to update status',
      message: error.message,
    });
  }
});

/**
 * @route POST /api/v1/incidents/:id/assign
 * @description Assign incident to responder
 */
router.post('/:id/assign', async (req, res) => {
  try {
    const {
      type,
      contactName,
      contactPhone,
      organization,
      reason,
    } = req.body;

    if (!contactName || !contactPhone) {
      return res.status(400).json({
        error: 'Missing required fields: contactName, contactPhone',
      });
    }

    const incident = await incidentIngestionService.assignIncident(req.params.id, {
      type,
      contactName,
      contactPhone,
      organization,
      reason,
    });

    res.json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error('Assign incident error:', error);
    res.status(500).json({
      error: 'Failed to assign incident',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/incidents/stats/summary
 * @description Get incident statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    const stats = await incidentIngestionService.getStatistics({
      dateFrom,
      dateTo,
    });

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message,
    });
  }
});

module.exports = router;

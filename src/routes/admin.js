const express = require('express');
const router = express.Router();
const { incidentIngestionService, escalationService, confidenceScoringService, alertBroadcastService } = require('../services');
const { Incident, Alert, EscalationRule } = require('../models');

/**
 * @route GET /api/v1/admin/stats/dashboard
 * @description Get dashboard statistics
 */
router.get('/stats/dashboard', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calculate period
    const periodMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[period] || 24 * 60 * 60 * 1000;

    const dateFrom = new Date(Date.now() - periodMs);

    // Get incident stats
    const incidentStats = await incidentIngestionService.getStatistics({ dateFrom });
    const confidenceStats = await confidenceScoringService.getConfidenceStats({ dateFrom });

    // Get alert stats
    const alertStats = await alertBroadcastService.getAlertStats({ dateFrom });

    // Get escalation stats
    const escalatedCount = await Incident.count({
      where: {
        status: 'escalated',
        createdAt: { [Op.gte]: dateFrom },
      },
    });

    // Get response stats
    const responseStats = await this.getResponseStats(dateFrom);

    res.json({
      success: true,
      period,
      incidents: incidentStats,
      confidence: confidenceStats,
      alerts: alertStats,
      escalations: {
        total: escalatedCount,
        rate: incidentStats.total > 0 
          ? Math.round((escalatedCount / incidentStats.total) * 100) 
          : 0,
      },
      response: responseStats,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard stats',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/incidents/live
 * @description Get live incidents (recent, unresolved)
 */
router.get('/incidents/live', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;

    const where = {
      status: { [Op.notIn]: ['resolved', 'closed', 'expired', 'false_alarm'] },
      createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    };

    if (status) {
      where.status = status;
    }

    const incidents = await Incident.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    // Enrich with escalation info
    const enrichedIncidents = await Promise.all(
      incidents.map(async (incident) => {
        const escalationPath = await escalationService.getEscalationPath(incident.incidentId);
        return {
          ...incident.toJSON(),
          escalation: escalationPath,
        };
      })
    );

    res.json({
      success: true,
      count: incidents.length,
      incidents: enrichedIncidents,
    });
  } catch (error) {
    console.error('Live incidents error:', error);
    res.status(500).json({
      error: 'Failed to get live incidents',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/incidents/heatmap
 * @description Get incident heatmap data
 */
router.get('/incidents/heatmap', async (req, res) => {
  try {
    const { 
      period = '7d',
      groupBy = 'hour',
      type = 'all',
    } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const dateFrom = new Date(Date.now() - periodMs);

    const where = {
      createdAt: { [Op.gte]: dateFrom },
    };

    if (type !== 'all') {
      where.incidentType = type;
    }

    const incidents = await Incident.findAll({
      where,
      attributes: ['locationLatitude', 'locationLongitude', 'incidentType', 'severity', 'createdAt'],
    });

    // Group by geohash (6 chars = ~1km x 1km)
    const heatmap = {};
    for (const incident of incidents) {
      if (!incident.locationLatitude || !incident.locationLongitude) continue;

      const geohash = this.calculateGeohash(incident.locationLatitude, incident.locationLongitude, 4);
      
      if (!heatmap[geohash]) {
        heatmap[geohash] = {
          lat: incident.locationLatitude,
          lng: incident.locationLongitude,
          count: 0,
          types: {},
          severities: {},
        };
      }

      heatmap[geohash].count++;
      heatmap[geohash].types[incident.incidentType] = (heatmap[geohash].types[incident.incidentType] || 0) + 1;
      heatmap[geohash].severities[incident.severity] = (heatmap[geohash].severities[incident.severity] || 0) + 1;
    }

    // Convert to array
    const heatmapData = Object.entries(heatmap).map(([geohash, data]) => ({
      geohash,
      ...data,
      intensity: Math.min(data.count / 5, 1), // Normalize to 0-1
    }));

    res.json({
      success: true,
      period,
      data: heatmapData,
      totalIncidents: incidents.length,
      totalLocations: heatmapData.length,
    });
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({
      error: 'Failed to get heatmap data',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/incidents/map
 * @description Get incidents for map display
 */
router.get('/incidents/map', async (req, res) => {
  try {
    const { 
      status = 'active',
      bounds,
      limit = 100,
    } = req.query;

    const where = {
      status: { [Op.notIn]: ['resolved', 'closed', 'expired'] },
      createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    };

    // Filter by bounds if provided
    if (bounds) {
      const [swLat, swLng, neLat, neLng] = bounds.split(',').map(parseFloat);
      where.locationLatitude = { [Op.between]: [swLat, neLat] };
      where.locationLongitude = { [Op.between]: [swLng, neLng] };
    }

    const incidents = await Incident.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    res.json({
      success: true,
      incidents: incidents.map(i => ({
        id: i.incidentId,
        type: i.incidentType,
        severity: i.severity,
        status: i.status,
        lat: i.locationLatitude,
        lng: i.locationLongitude,
        time: i.createdAt,
      })),
    });
  } catch (error) {
    console.error('Map incidents error:', error);
    res.status(500).json({
      error: 'Failed to get map incidents',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/response/status
 * @description Get response status overview
 */
router.get('/response/status', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    const periodMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }[period] || 24 * 60 * 60 * 1000;

    const dateFrom = new Date(Date.now() - periodMs);

    // Get incidents by response status
    const incidents = await Incident.findAll({
      where: {
        createdAt: { [Op.gte]: dateFrom },
        status: { [Op.notIn]: ['received'] },
      },
    });

    const byStatus = {};
    const byType = {};
    const byAssignee = {};

    for (const incident of incidents) {
      // By status
      byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
      
      // By type
      byType[incident.incidentType] = (byType[incident.incidentType] || 0) + 1;
      
      // By assignee
      const assignee = incident.escalationAssignedToName || 'Unassigned';
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1;
    }

    // Calculate average response times
    const resolvedIncidents = incidents.filter(i => i.responseTime);
    const avgResponseTime = resolvedIncidents.length > 0
      ? Math.round(resolvedIncidents.reduce((sum, i) => sum + i.responseTime, 0) / resolvedIncidents.length)
      : 0;

    res.json({
      success: true,
      period,
      byStatus,
      byType,
      byAssignee,
      totalIncidents: incidents.length,
      averageResponseTime: avgResponseTime,
      slaCompliance: await this.getSlaCompliance(dateFrom),
    });
  } catch (error) {
    console.error('Response status error:', error);
    res.status(500).json({
      error: 'Failed to get response status',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/rules
 * @description Get escalation rules
 */
router.get('/rules', async (req, res) => {
  try {
    const rules = await EscalationRule.findAll({
      order: [['priority', 'ASC']],
    });

    res.json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({
      error: 'Failed to get rules',
      message: error.message,
    });
  }
});

/**
 * @route POST /api/v1/admin/rules
 * @description Create escalation rule
 */
router.post('/rules', async (req, res) => {
  try {
    const rule = await EscalationRule.create(req.body);

    res.status(201).json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({
      error: 'Failed to create rule',
      message: error.message,
    });
  }
});

/**
 * @route POST /api/v1/admin/alerts
 * @description Create and broadcast alert
 */
router.post('/alerts', async (req, res) => {
  try {
    const { createdByUserId, createdByName } = req.user || {};

    const alert = await alertBroadcastService.createAndBroadcast(req.body, {
      createdByUserId,
      createdByName,
    });

    res.status(201).json({
      success: true,
      alert,
      message: 'Alert created and broadcast queued',
    });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({
      error: 'Failed to create alert',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/v1/admin/alerts
 * @description List alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const result = await alertBroadcastService.listAlerts(req.query);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('List alerts error:', error);
    res.status(500).json({
      error: 'Failed to list alerts',
      message: error.message,
    });
  }
});

// Helper functions
function calculateGeohash(lat, lng, precision = 4) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';

  for (let i = 0; i < precision; i++) {
    const latMid = (latMin + latMax) / 2;
    const lngMid = (lngMin + lngMax) / 2;

    const isEven = i % 2 === 0;
    if (isEven) {
      if (lng > lngMid) {
        hash += '1';
        lngMin = lngMid;
      } else {
        hash += '0';
        lngMax = lngMid;
      }
    } else {
      if (lat > latMid) {
        hash += '1';
        latMin = latMid;
      } else {
        hash += '0';
        latMax = latMid;
      }
    }
  }

  return hash;
}

async function getResponseStats(dateFrom) {
  const incidents = await Incident.findAll({
    where: {
      createdAt: { [Op.gte]: dateFrom },
      status: { [Op.in]: ['resolved', 'closed'] },
    },
  });

  let totalResponseTime = 0;
  let withResponseTime = 0;

  for (const incident of incidents) {
    if (incident.responseTime) {
      totalResponseTime += incident.responseTime;
      withResponseTime++;
    }
  }

  return {
    resolved: incidents.length,
    averageResponseTime: withResponseTime > 0 ? Math.round(totalResponseTime / withResponseTime) : 0,
  };
}

async function getSlaCompliance(dateFrom) {
  const escalated = await Incident.findAll({
    where: {
      createdAt: { [Op.gte]: dateFrom },
      status: 'escalated',
    },
  });

  let onTime = 0;
  for (const incident of escalated) {
    // SLA is based on escalation level (30min per level)
    const slaMinutes = (incident.escalationLevel || 1) * 30;
    const responseTime = incident.responseTime || 0;
    if (responseTime <= slaMinutes) {
      onTime++;
    }
  }

  return {
    total: escalated.length,
    onTime,
    rate: escalated.length > 0 ? Math.round((onTime / escalated.length) * 100) : 100,
  };
}

// Export helper functions
module.exports.calculateGeohash = calculateGeohash;

const { Op } = require('sequelize');

module.exports = router;

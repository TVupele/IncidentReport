const { Op } = require('sequelize');
const { Incident } = require('../models');

class ConfidenceScoringService {
  /**
   * Calculate overall confidence score for an incident
   * Score ranges from 0-100, higher = more reliable
   */
  async calculateConfidenceScore(incident) {
    const scores = {
      sourceReliability: await this.calculateSourceReliability(incident),
      temporal: this.calculateTemporalScore(incident),
      spatial: await this.calculateSpatialScore(incident),
      content: this.calculateContentScore(incident),
      deduplication: this.calculateDeduplicationScore(incident),
    };

    // Weighted average
    const weights = {
      sourceReliability: 0.25,
      temporal: 0.20,
      spatial: 0.20,
      content: 0.20,
      deduplication: 0.15,
    };

    let totalScore = 0;
    for (const [key, score] of Object.entries(scores)) {
      totalScore += score * weights[key];
    }

    const finalScore = Math.round(totalScore);

    return {
      score: finalScore,
      breakdown: scores,
      factors: this.getScoringFactors(scores),
    };
  }

  /**
   * Calculate source reliability score based on channel and history
   */
  async calculateSourceReliability(incident) {
    // Channel-based reliability
    const channelScores = {
      'ussd': 70,    // USSD - moderate reliability
      'web': 60,     // Web - moderate reliability
      'mobile': 80,  // Mobile app - higher reliability
      'api': 65,     // API - unknown source
    };

    let score = channelScores[incident.channel] || 50;

    // Bonus for callback consent (willingness to be contacted)
    if (incident.reporterCallbackConsent) {
      score += 10;
    }

    // Check reporter history (if phone number known)
    if (incident.reporterPhoneNumber && !incident.reporterAnonymous) {
      const pastIncidents = await Incident.count({
        where: {
          reporterPhoneNumber: incident.reporterPhoneNumber,
          createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        },
      });

      // Bonus for consistent reporters
      if (pastIncidents > 0) {
        score += Math.min(pastIncidents * 5, 20); // Up to +20 for history
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate temporal score based on time of report
   */
  calculateTemporalScore(incident) {
    const reportTime = new Date(incident.createdAt);
    const hour = reportTime.getHours();

    // Night hours (8PM - 6AM) are higher risk but reports are more significant
    if (hour >= 20 || hour < 6) {
      return 85;
    }

    // Peak hours (6AM - 9AM, 5PM - 8PM) are moderate
    if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 20)) {
      return 75;
    }

    // Day hours - normal
    return 70;
  }

  /**
   * Calculate spatial score based on location quality
   */
  async calculateSpatialScore(incident) {
    // GPS coordinates are most reliable
    if (incident.locationLatitude && incident.locationLongitude) {
      if (incident.locationAccuracy && incident.locationAccuracy <= 50) {
        return 95; // High accuracy GPS
      }
      if (incident.locationAccuracy && incident.locationAccuracy <= 200) {
        return 85; // Moderate accuracy
      }
      return 75; // Basic GPS
    }

    // Cell tower location is moderate
    if (incident.locationCellTowerId) {
      return 60;
    }

    // Manual location selection
    if (incident.locationVillage || incident.locationLga) {
      return 50;
    }

    // No location - low reliability
    return 30;
  }

  /**
   * Calculate content score based on description quality
   */
  calculateContentScore(incident) {
    const description = incident.descriptionText || '';
    const length = description.length;

    // Optimal length check
    if (length >= 20 && length <= 200) {
      return 85;
    }
    if (length > 0 && length < 20) {
      return 60; // Too short
    }
    if (length > 200) {
      return 70; // Could be verbose
    }

    // No description
    return 50;
  }

  /**
   * Calculate deduplication score (inverse of similarity to others)
   */
  calculateDeduplicationScore(incident) {
    const dedupScore = incident.confidenceDeDuplicationScore;

    if (!dedupScore) {
      return 50; // No duplicate info available
    }

    // High similarity to other reports increases confidence
    if (dedupScore >= 80) {
      return 90;
    }
    if (dedupScore >= 60) {
      return 75;
    }
    if (dedupScore >= 40) {
      return 60;
    }

    return 50;
  }

  /**
   * Get human-readable scoring factors
   */
  getScoringFactors(scores) {
    const factors = [];

    if (scores.sourceReliability >= 75) {
      factors.push({ factor: 'Reliable source', positive: true });
    } else if (scores.sourceReliability < 50) {
      factors.push({ factor: 'Source unverified', positive: false });
    }

    if (scores.spatial >= 80) {
      factors.push({ factor: 'Precise location', positive: true });
    } else if (scores.spatial < 50) {
      factors.push({ factor: 'Location uncertain', positive: false });
    }

    if (scores.deduplication >= 80) {
      factors.push({ factor: 'Corroborated by others', positive: true });
    }

    if (scores.temporal >= 80) {
      factors.push({ factor: 'Timely report', positive: true });
    }

    return factors;
  }

  /**
   * Batch update confidence scores for recent incidents
   */
  async batchUpdateScores(hoursBack = 24) {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const incidents = await Incident.findAll({
      where: {
        createdAt: { [Op.gte]: cutoff },
        status: { [Op.notIn]: ['resolved', 'closed', 'expired'] },
      },
      order: [['createdAt', 'DESC']],
    });

    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
    };

    for (const incident of incidents) {
      try {
        const confidence = await this.calculateConfidenceScore(incident);
        incident.confidenceScore = confidence.score;
        await incident.save();
        results.updated++;
      } catch (error) {
        console.error(`Failed to update confidence for ${incident.incidentId}:`, error);
        results.errors++;
      }
      results.processed++;
    }

    return results;
  }

  /**
   * Get confidence distribution statistics
   */
  async getConfidenceStats(filters = {}) {
    const where = {};

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt[Op.gte] = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt[Op.lte] = new Date(filters.dateTo);
    }

    const incidents = await Incident.findAll({ where });

    const distribution = {
      high: 0,    // 80-100
      medium: 0, // 50-79
      low: 0,     // 0-49
    };

    let totalScore = 0;
    let count = 0;

    for (const incident of incidents) {
      const score = incident.confidenceScore || 50;
      totalScore += score;
      count++;

      if (score >= 80) distribution.high++;
      else if (score >= 50) distribution.medium++;
      else distribution.low++;
    }

    return {
      distribution,
      averageScore: count > 0 ? Math.round(totalScore / count) : 0,
      totalIncidents: count,
    };
  }
}

module.exports = new ConfidenceScoringService();

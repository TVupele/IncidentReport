const { Op } = require('sequelize');
const { Incident } = require('../models');
const geolib = require('geolib');

class DeduplicationService {
  /**
   * Configuration for duplicate detection
   */
  config = {
    // Time window for duplicate detection (in minutes)
    timeWindowMinutes: 60,
    // Distance threshold for spatial duplicate (in meters)
    distanceThresholdMeters: 500,
    // Minimum similarity score to consider as duplicate (0-100)
    similarityThreshold: 60,
    // Maximum duplicates to return
    maxDuplicates: 5,
  };

  /**
   * Find potential duplicates for an incident
   */
  async findDuplicates(incident) {
    const timeWindow = new Date(Date.now() - this.config.timeWindowMinutes * 60000);

    // Find recent incidents of same type
    const where = {
      incidentId: { [Op.ne]: incident.incidentId },
      createdAt: { [Op.gte]: timeWindow },
      status: { [Op.notIn]: ['resolved', 'closed', 'expired'] },
    };

    // Get candidates based on incident type
    if (incident.incidentType) {
      where.incidentType = incident.incidentType;
    }

    const candidates = await Incident.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    // Calculate similarity scores
    const duplicates = [];

    for (const candidate of candidates) {
      const similarity = await this.calculateSimilarity(incident, candidate);

      if (similarity >= this.config.similarityThreshold) {
        duplicates.push({
          incidentId: candidate.incidentId,
          similarity,
          factors: this.getSimilarityFactors(incident, candidate),
        });
      }
    }

    // Sort by similarity and return top matches
    return duplicates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxDuplicates);
  }

  /**
   * Calculate similarity score between two incidents
   */
  async calculateSimilarity(incident1, incident2) {
    let totalScore = 0;
    let maxScore = 0;

    // Spatial similarity (0-40 points)
    const loc1 = {
      latitude: incident1.locationLatitude,
      longitude: incident1.locationLongitude,
      village: incident1.locationVillage,
      lga: incident1.locationLga,
      state: incident1.locationState,
    };
    const loc2 = {
      latitude: incident2.locationLatitude,
      longitude: incident2.locationLongitude,
      village: incident2.locationVillage,
      lga: incident2.locationLga,
      state: incident2.locationState,
    };
    const spatialScore = this.calculateSpatialSimilarity(loc1, loc2);
    totalScore += spatialScore * 0.4;
    maxScore += 40;

    // Temporal similarity (0-30 points)
    const temporalScore = this.calculateTemporalSimilarity(
      incident1.createdAt,
      incident2.createdAt
    );
    totalScore += temporalScore * 0.3;
    maxScore += 30;

    // Type similarity (0-20 points)
    const typeScore = this.calculateTypeSimilarity(
      incident1.incidentType,
      incident2.incidentType
    );
    totalScore += typeScore * 0.2;
    maxScore += 20;

    // Severity similarity (0-10 points)
    const severityScore = this.calculateSeveritySimilarity(
      incident1.severity,
      incident2.severity
    );
    totalScore += severityScore * 0.1;
    maxScore += 10;

    return Math.round((totalScore / maxScore) * 100);
  }

  /**
   * Calculate spatial similarity
   */
  calculateSpatialSimilarity(loc1, loc2) {
    // If both have GPS coordinates
    if (loc1.latitude && loc1.longitude && loc2.latitude && loc2.longitude) {
      const distance = geolib.getDistance(
        { latitude: loc1.latitude, longitude: loc1.longitude },
        { latitude: loc2.latitude, longitude: loc2.longitude }
      );

      if (distance <= 100) return 40;
      if (distance <= 250) return 30;
      if (distance <= 500) return 20;
      if (distance <= 1000) return 10;
      return 0;
    }

    // If only one has GPS, check location names
    if (loc1.village && loc2.village && loc1.village === loc2.village) {
      return 30;
    }
    if (loc1.lga && loc2.lga && loc1.lga === loc2.lga) {
      return 20;
    }
    if (loc1.state && loc2.state && loc1.state === loc2.state) {
      return 10;
    }

    return 0;
  }

  /**
   * Calculate temporal similarity
   */
  calculateTemporalSimilarity(time1, time2) {
    const t1 = new Date(time1).getTime();
    const t2 = new Date(time2).getTime();
    const diffMinutes = Math.abs(t1 - t2) / 60000;

    if (diffMinutes <= 5) return 30;
    if (diffMinutes <= 15) return 25;
    if (diffMinutes <= 30) return 20;
    if (diffMinutes <= 60) return 15;
    if (diffMinutes <= 120) return 10;
    return 5;
  }

  /**
   * Calculate type similarity
   */
  calculateTypeSimilarity(type1, type2) {
    if (type1 === type2) return 20;

    // Check for related types
    const relatedTypes = {
      'suspicious_activity': ['theft', 'fight', 'gunshot'],
      'incident_in_progress': ['fire', 'explosion', 'violence'],
      'fire': ['explosion'],
      'theft': ['suspicious_activity'],
      'fight': ['violence', 'suspicious_activity'],
      'gunshot': ['suspicious_activity', 'violence'],
    };

    const related = relatedTypes[type1] || [];
    if (related.includes(type2)) return 10;

    return 0;
  }

  /**
   * Calculate severity similarity
   */
  calculateSeveritySimilarity(sev1, sev2) {
    const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const s1 = severityOrder[sev1] || 2;
    const s2 = severityOrder[sev2] || 2;
    const diff = Math.abs(s1 - s2);

    if (diff === 0) return 10;
    if (diff === 1) return 5;
    return 0;
  }

  /**
   * Get detailed similarity factors
   */
  getSimilarityFactors(incident1, incident2) {
    const loc1 = {
      latitude: incident1.locationLatitude,
      longitude: incident1.locationLongitude,
      village: incident1.locationVillage,
      lga: incident1.locationLga,
      state: incident1.locationState,
    };
    const loc2 = {
      latitude: incident2.locationLatitude,
      longitude: incident2.locationLongitude,
      village: incident2.locationVillage,
      lga: incident2.locationLga,
      state: incident2.locationState,
    };
    return [
      {
        factor: 'spatial',
        weight: 0.4,
        value: this.calculateSpatialSimilarity(loc1, loc2) / 40,
      },
      {
        factor: 'temporal',
        weight: 0.3,
        value: this.calculateTemporalSimilarity(incident1.createdAt, incident2.createdAt) / 30,
      },
      {
        factor: 'type',
        weight: 0.2,
        value: this.calculateTypeSimilarity(incident1.incidentType, incident2.incidentType) / 20,
      },
      {
        factor: 'severity',
        weight: 0.1,
        value: this.calculateSeveritySimilarity(incident1.severity, incident2.severity) / 10,
      },
    ];
  }

  /**
   * Merge duplicate incidents
   */
  async mergeIncidents(primaryId, secondaryIds) {
    const primary = await Incident.findOne({ where: { incidentId: primaryId } });
    if (!primary) {
      throw new Error(`Primary incident not found: ${primaryId}`);
    }

    for (const secondaryId of secondaryIds) {
      const secondary = await Incident.findOne({ where: { incidentId: secondaryId } });
      if (!secondary) continue;

      // Merge data
      if (secondary.descriptionText && !primary.descriptionText) {
        primary.descriptionText = secondary.descriptionText;
      }

      // Update status
      secondary.status = 'merged';
      await secondary.save();
    }

    await primary.save();
    return primary;
  }

  /**
   * Auto-resolve false duplicates (clustering)
   */
  async clusterIncidents() {
    const cutoffTime = new Date(Date.now() - 60 * 60000);
    const recentIncidents = await Incident.findAll({
      where: {
        status: 'received',
        createdAt: { [Op.gte]: cutoffTime },
      },
      order: [['createdAt', 'DESC']],
    });

    const clusters = [];
    const processed = new Set();

    for (const incident of recentIncidents) {
      if (processed.has(incident.incidentId)) continue;

      const duplicates = await this.findDuplicates(incident);
      const clusterIncidents = [incident.incidentId];

      for (const dup of duplicates) {
        if (!processed.has(dup.incidentId)) {
          clusterIncidents.push(dup.incidentId);
          processed.add(dup.incidentId);
        }
      }

      clusters.push({
        primaryIncident: incident.incidentId,
        relatedIncidents: clusterIncidents,
        count: clusterIncidents.length,
      });

      processed.add(incident.incidentId);
    }

    return clusters;
  }
}

module.exports = new DeduplicationService();

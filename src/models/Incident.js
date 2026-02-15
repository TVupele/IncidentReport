const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const geolib = require('geolib');

module.exports = (sequelize) => {
  const Incident = sequelize.define('Incident', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    
    // Custom incident ID
    incidentId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `INC-${uuidv4().split('-')[0].toUpperCase()}`,
      allowNull: false,
    },
    
    // Report channel
    channel: {
      type: DataTypes.ENUM('ussd', 'web', 'mobile', 'api'),
      allowNull: false,
    },
    
    // Anonymous reporter info (optional)
    reporterPhoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reporterAnonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    reporterCallbackConsent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reporterSessionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    // Incident type categorization
    incidentType: {
      type: DataTypes.ENUM(
        'suspicious_activity',
        'incident_in_progress',
        'fire',
        'theft',
        'violence',
        'gunshot',
        'fight',
        'kidnap',
        'explosion',
        'medical_emergency',
        'other'
      ),
      allowNull: false,
    },
    
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
    },
    
    // Location data - Cell tower info
    locationCellTowerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationCellTowerLac: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationCellTowerMcc: {
      type: DataTypes.STRING,
      defaultValue: '621', // Nigeria MCC
    },
    locationCellTowerMnc: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    // GPS coordinates
    locationLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    locationLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    locationAccuracy: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    locationGpsTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Manual location
    locationState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationLga: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationWard: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationVillage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locationManual: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    
    // Geohash
    locationGeohash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    // Description
    descriptionText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    descriptionAudioUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    descriptionPhotoUrls: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    descriptionLanguage: {
      type: DataTypes.STRING,
      defaultValue: 'hausa',
    },
    
    // Confidence scoring
    confidenceScore: {
      type: DataTypes.FLOAT,
      defaultValue: 50,
    },
    confidenceDeDuplicationScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    confidenceSourceReliability: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    
    // Status workflow
    status: {
      type: DataTypes.ENUM(
        'received',
        'processing',
        'assigned',
        'in_progress',
        'resolved',
        'escalated',
        'closed',
        'false_alarm',
        'expired'
      ),
      defaultValue: 'received',
    },
    
    // Escalation info
    escalationLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    escalationRulesTriggered: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    escalationAssignedToType: {
      type: DataTypes.ENUM('security_team', 'community_focal', 'agency_liaison'),
      allowNull: true,
    },
    escalationAssignedToName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationAssignedToPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationAssignedToOrganization: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationEscalatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Response tracking
    responseFirstResponder: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    responseTime: {
      type: DataTypes.INTEGER, // in minutes
      allowNull: true,
    },
    responseArrivalTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responseResolution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    responseResolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Source info
    sourceIp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceUserAgent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceDeviceInfo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    // Metadata
    metadataReportTimestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    metadataReceivedVia: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadataProcessingTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    metadataQueueTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    
    // Retention
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
  }, {
    tableName: 'incidents',
    timestamps: true,
    indexes: [
      { fields: ['incidentId'] },
      { fields: ['channel'] },
      { fields: ['incidentType'] },
      { fields: ['severity'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      { fields: ['status', 'createdAt'] },
      { fields: ['location_geohash'] },
      { fields: ['location_latitude', 'location_longitude'] },
      { fields: ['escalation_level'] },
    ],
    hooks: {
      beforeSave: (instance) => {
        // Calculate geohash from coordinates
        if (instance.locationLatitude && instance.locationLongitude) {
          instance.locationGeohash = geolib.encode([instance.locationLatitude, instance.locationLongitude], 6);
        }
      },
    },
  });

  // Instance method to get age in minutes
  Incident.prototype.getAgeInMinutes = function() {
    return Math.floor((Date.now() - this.createdAt) / 60000);
  };

  return Incident;
};

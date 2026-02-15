const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Alert = sequelize.define('Alert', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    
    // Custom alert ID
    alertId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `ALT-${Date.now().toString(36).toUpperCase()}`,
      allowNull: false,
    },
    
    // Multilingual content
    titleHausa: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    titleEnglish: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contentHausa: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentEnglish: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    
    // Alert type
    alertType: {
      type: DataTypes.ENUM('security', 'weather', 'health', 'community', 'emergency', 'update'),
      allowNull: false,
    },
    
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'alert', 'critical'),
      defaultValue: 'info',
    },
    
    // Target area - Single values
    targetAreaState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    targetAreaLgas: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    targetAreaWards: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    targetAreaVillages: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    targetAreaGeohashes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    targetAreaRadius: {
      type: DataTypes.FLOAT, // in km
      allowNull: true,
    },
    targetAreaLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    targetAreaLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    
    // Timing
    validFrom: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Status
    status: {
      type: DataTypes.ENUM('draft', 'active', 'expired', 'cancelled'),
      defaultValue: 'draft',
    },
    
    // Statistics
    statsSentCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    statsDeliveredCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    statsReadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    
    // Created by
    createdByUserId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdByName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdByRole: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
  }, {
    tableName: 'alerts',
    timestamps: true,
    indexes: [
      { fields: ['alertId'] },
      { fields: ['alertType'] },
      { fields: ['severity'] },
      { fields: ['status'] },
    ],
  });

  return Alert;
};

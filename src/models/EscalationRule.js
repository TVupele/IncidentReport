const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EscalationRule = sequelize.define('EscalationRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    
    ruleId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `RULE-${Date.now().toString(36).toUpperCase()}`,
      allowNull: false,
    },
    
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
    },
    
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    
    // Trigger conditions
    conditionsIncidentTypes: {
      type: DataTypes.ARRAY(DataTypes.ENUM(
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
      )),
      defaultValue: [],
    },
    
    conditionsSeverities: {
      type: DataTypes.ARRAY(DataTypes.ENUM('low', 'medium', 'high', 'critical')),
      defaultValue: [],
    },
    
    conditionsStates: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    conditionsLgas: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    conditionsWards: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    conditionsVillages: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    conditionsGeohashPrefix: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    // Time-based conditions
    conditionsTimeRangeStart: {
      type: DataTypes.STRING, // HH:mm format
      allowNull: true,
    },
    conditionsTimeRangeEnd: {
      type: DataTypes.STRING, // HH:mm format
      allowNull: true,
    },
    conditionsDaysOfWeek: {
      type: DataTypes.ARRAY(DataTypes.INTEGER), // 0-6
      defaultValue: [],
    },
    
    // Confidence threshold
    conditionsMinConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    
    // Recency
    conditionsMaxRecencyMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    
    // Source channel
    conditionsChannels: {
      type: DataTypes.ARRAY(DataTypes.ENUM('ussd', 'web', 'mobile', 'api')),
      defaultValue: [],
    },
    
    // Escalation actions
    escalationLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    
    escalationAssigneeType: {
      type: DataTypes.ENUM('security_team', 'community_focal', 'agency_liaison', 'custom'),
      allowNull: true,
    },
    
    escalationAssigneeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationAssigneeName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationAssigneePhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    escalationAssigneeOrganization: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
    escalationNotificationMethod: {
      type: DataTypes.ENUM('sms', 'call', 'push', 'email', 'multiple'),
      defaultValue: 'sms',
    },
    
    escalationSlaMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    
    escalationNotificationMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    
    // Cooldown
    cooldownMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
    },
    
    // Last triggered
    lastTriggered: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    triggerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    
    // Audit
    createdBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
  }, {
    tableName: 'escalation_rules',
    timestamps: true,
    indexes: [
      { fields: ['ruleId'] },
      { fields: ['active', 'priority'] },
    ],
  });

  return EscalationRule;
};

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UssdSession = sequelize.define('UssdSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    
    sessionId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    
    language: {
      type: DataTypes.ENUM('hausa', 'english'),
      defaultValue: 'hausa',
    },
    
    state: {
      type: DataTypes.ENUM(
        'idle',
        'main_menu',
        'incident_type_selection',
        'incident_category',
        'severity_selection',
        'location_selection',
        'description',
        'callback_consent',
        'confirmation',
        'completed',
        'timeout'
      ),
      defaultValue: 'idle',
    },
    
    // Session data storage
    dataIncidentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataSeverity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataLocationCellTowerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataLocationState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataLocationLga: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataLocationVillage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataLocationLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    dataLocationLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    dataDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataCallbackConsent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    
    // Step tracking
    currentStep: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    
    // Timing
    startedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Result
    incidentCreated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    incidentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    
  }, {
    tableName: 'ussd_sessions',
    timestamps: true,
    indexes: [
      { fields: ['sessionId'] },
      { fields: ['phoneNumber'] },
      { fields: ['state'] },
      { fields: ['lastActivityAt'], expireAfterSeconds: 86400 }, // TTL-like behavior handled by query
    ],
    hooks: {
      beforeSave: (instance) => {
        instance.lastActivityAt = new Date();
      },
    },
  });

  // Class method to clean old sessions
  UssdSession.cleanOldSessions = async function(hoursOld = 24) {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    return this.destroy({
      where: {
        lastActivityAt: { [require('sequelize').Op.lt]: cutoff },
        state: { [require('sequelize').Op.notIn]: ['completed', 'timeout'] },
      },
    });
  };

  return UssdSession;
};

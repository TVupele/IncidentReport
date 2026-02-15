const { sequelize } = require('./database');

// Import models
const Incident = require('./Incident');
const Alert = require('./Alert');
const UssdSession = require('./UssdSession');
const EscalationRule = require('./EscalationRule');

// Initialize models with sequelize instance
const initModels = (sequelize) => {
  const models = {
    Incident: Incident(sequelize),
    Alert: Alert(sequelize),
    UssdSession: UssdSession(sequelize),
    EscalationRule: EscalationRule(sequelize),
  };

  // Set up associations if needed
  Object.keys(models).forEach((modelName) => {
    if (models[modelName].associate) {
      models[modelName].associate(models);
    }
  });

  return models;
};

// Export individual models and sequelize
module.exports = {
  sequelize,
  initModels,
  Incident,
  Alert,
  UssdSession,
  EscalationRule,
};

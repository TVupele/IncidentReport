/**
 * Database Initialization Script
 * Creates the PostgreSQL database and syncs models
 */

const { Sequelize, DataTypes } = require('sequelize');
const config = require('../src/config');

// Configuration for initial connection (without database)
const initialConfig = {
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  dialect: 'postgres',
  logging: false,
};

// Create sequelize instance without database
const sequelize = new Sequelize(
  `postgres://${initialConfig.username}:${initialConfig.password}@${initialConfig.host}:${initialConfig.port}`,
  initialConfig
);

async function createDatabase() {
  const dbName = config.database.name;
  
  console.log(`Setting up database "${dbName}"...`);
  
  try {
    // Check if database exists
    const [results] = await sequelize.query(`
      SELECT 1 FROM pg_database WHERE datname = '${dbName}'
    `);
    
    if (results.length > 0) {
      console.log(`Database "${dbName}" already exists. Dropping and recreating...`);
      // Terminate all connections and drop
      await sequelize.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`);
      await sequelize.query(`DROP DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" dropped.`);
    }
    
    // Create database
    await sequelize.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created successfully.`);
  } catch (error) {
    console.error('Error creating database:', error.message);
    throw error;
  }
}

// Define Incident model directly
function defineIncident(sequelize) {
  const { v4: uuidv4 } = require('uuid');
  const geolib = require('geolib');
  
  const Incident = sequelize.define('Incident', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    incidentId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `INC-${uuidv4().split('-')[0].toUpperCase()}`,
      allowNull: false,
    },
    channel: {
      type: DataTypes.ENUM('ussd', 'web', 'mobile', 'api'),
      allowNull: false,
    },
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
    locationCellTowerId: { type: DataTypes.STRING, allowNull: true },
    locationCellTowerLac: { type: DataTypes.STRING, allowNull: true },
    locationCellTowerMcc: { type: DataTypes.STRING, defaultValue: '621' },
    locationCellTowerMnc: { type: DataTypes.STRING, allowNull: true },
    locationLatitude: { type: DataTypes.FLOAT, allowNull: true },
    locationLongitude: { type: DataTypes.FLOAT, allowNull: true },
    locationAccuracy: { type: DataTypes.FLOAT, allowNull: true },
    locationGpsTimestamp: { type: DataTypes.DATE, allowNull: true },
    locationState: { type: DataTypes.STRING, allowNull: true },
    locationLga: { type: DataTypes.STRING, allowNull: true },
    locationWard: { type: DataTypes.STRING, allowNull: true },
    locationVillage: { type: DataTypes.STRING, allowNull: true },
    locationManual: { type: DataTypes.BOOLEAN, defaultValue: false },
    locationGeohash: { type: DataTypes.STRING, allowNull: true },
    descriptionText: { type: DataTypes.TEXT, allowNull: true },
    descriptionAudioUrl: { type: DataTypes.STRING, allowNull: true },
    descriptionPhotoUrls: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    descriptionLanguage: { type: DataTypes.STRING, defaultValue: 'hausa' },
    confidenceScore: { type: DataTypes.FLOAT, defaultValue: 50 },
    confidenceDeDuplicationScore: { type: DataTypes.FLOAT, allowNull: true },
    confidenceSourceReliability: { type: DataTypes.FLOAT, allowNull: true },
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
    escalationLevel: { type: DataTypes.INTEGER, defaultValue: 0 },
    escalationRulesTriggered: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    escalationAssignedToType: { type: DataTypes.ENUM('security_team', 'community_focal', 'agency_liaison'), allowNull: true },
    escalationAssignedToName: { type: DataTypes.STRING, allowNull: true },
    escalationAssignedToPhone: { type: DataTypes.STRING, allowNull: true },
    escalationAssignedToOrganization: { type: DataTypes.STRING, allowNull: true },
    escalationEscalatedAt: { type: DataTypes.DATE, allowNull: true },
    responseFirstResponder: { type: DataTypes.STRING, allowNull: true },
    responseTime: { type: DataTypes.INTEGER, allowNull: true },
    responseArrivalTime: { type: DataTypes.DATE, allowNull: true },
    responseResolution: { type: DataTypes.TEXT, allowNull: true },
    responseResolvedAt: { type: DataTypes.DATE, allowNull: true },
    sourceIp: { type: DataTypes.STRING, allowNull: true },
    sourceUserAgent: { type: DataTypes.STRING, allowNull: true },
    sourceDeviceInfo: { type: DataTypes.STRING, allowNull: true },
    metadataReportTimestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    metadataReceivedVia: { type: DataTypes.STRING, allowNull: true },
    metadataProcessingTime: { type: DataTypes.INTEGER, allowNull: true },
    metadataQueueTime: { type: DataTypes.INTEGER, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'incidents',
    timestamps: true,
  });
  
  return Incident;
}

// Define Alert model directly
function defineAlert(sequelize) {
  const { v4: uuidv4 } = require('uuid');
  
  const Alert = sequelize.define('Alert', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    alertId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `ALT-${uuidv4().split('-')[0].toUpperCase()}`,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('safety', 'weather', 'security', 'health', 'fire', 'flood', 'other'),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
    },
    title: { type: DataTypes.STRING, allowNull: true },
    content: { type: DataTypes.JSON, allowNull: true },
    language: { type: DataTypes.STRING, defaultValue: 'hausa' },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'expired', 'cancelled'),
      defaultValue: 'draft',
    },
    priority: { type: DataTypes.INTEGER, defaultValue: 0 },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.STRING, allowNull: true },
    targetRadius: { type: DataTypes.FLOAT, allowNull: true },
    targetLocationLat: { type: DataTypes.FLOAT, allowNull: true },
    targetLocationLng: { type: DataTypes.FLOAT, allowNull: true },
    targetGeohash: { type: DataTypes.STRING, allowNull: true },
    recipientCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    tableName: 'alerts',
    timestamps: true,
  });
  
  return Alert;
}

// Define EscalationRule model directly
function defineEscalationRule(sequelize) {
  const { v4: uuidv4 } = require('uuid');
  
  const EscalationRule = sequelize.define('EscalationRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ruleId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `RULE-${uuidv4().split('-')[0].toUpperCase()}`,
      allowNull: false,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    priority: { type: DataTypes.INTEGER, defaultValue: 100 },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    conditionsIncidentTypes: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    conditionsSeverities: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    conditionsChannels: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    conditionsLocations: { type: DataTypes.JSON, defaultValue: [] },
    escalationLevel: { type: DataTypes.INTEGER, defaultValue: 1 },
    escalationAssigneeType: { type: DataTypes.STRING, allowNull: true },
    escalationAssigneeName: { type: DataTypes.STRING, allowNull: true },
    escalationAssigneePhone: { type: DataTypes.STRING, allowNull: true },
    escalationAssigneeOrganization: { type: DataTypes.STRING, allowNull: true },
    escalationNotificationMethod: { type: DataTypes.STRING, defaultValue: 'sms' },
    escalationNotificationMessage: { type: DataTypes.TEXT, allowNull: true },
    escalationSlaMinutes: { type: DataTypes.INTEGER, allowNull: true },
    cooldownMinutes: { type: DataTypes.INTEGER, defaultValue: 60 },
    createdBy: { type: DataTypes.STRING, allowNull: true },
    lastTriggeredAt: { type: DataTypes.DATE, allowNull: true },
    triggerCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    tableName: 'escalation_rules',
    timestamps: true,
  });
  
  return EscalationRule;
}

// Define UssdSession model directly
function defineUssdSession(sequelize) {
  const { v4: uuidv4 } = require('uuid');
  
  const UssdSession = sequelize.define('UssdSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.STRING,
      unique: true,
      defaultValue: () => `USS-${uuidv4().split('-')[0].toUpperCase()}`,
      allowNull: false,
    },
    phoneNumber: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM('init', 'active', 'completed', 'timeout', 'aborted'),
      defaultValue: 'init',
    },
    currentMenu: { type: DataTypes.STRING, defaultValue: 'welcome' },
    language: { type: DataTypes.STRING, defaultValue: 'hausa' },
    sessionData: { type: DataTypes.JSON, defaultValue: {} },
    lastActivityAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    incidentId: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'ussd_sessions',
    timestamps: true,
  });
  
  return UssdSession;
}

async function syncModels() {
  console.log('Syncing database models...');
  
  try {
    const dbConfig = config.database;
    const dbSequelize = new Sequelize(
      dbConfig.name,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: 'postgres',
        logging: false,
      }
    );
    
    // Define models directly with this sequelize instance
    const Incident = defineIncident(dbSequelize);
    const Alert = defineAlert(dbSequelize);
    const EscalationRule = defineEscalationRule(dbSequelize);
    const UssdSession = defineUssdSession(dbSequelize);
    
    // Sync all models
    await dbSequelize.sync({ force: true });
    console.log('Database models synchronized successfully.');
    
    // Close connection
    await dbSequelize.close();
    
    console.log('Database initialization complete!');
  } catch (error) {
    console.error('Error syncing models:', error.message);
    throw error;
  }
}

async function seedEscalationRules() {
  console.log('Seeding default escalation rules...');
  
  try {
    const dbConfig = config.database;
    const dbSequelize = new Sequelize(
      dbConfig.name,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: 'postgres',
        logging: false,
      }
    );
    
    const EscalationRule = defineEscalationRule(dbSequelize);
    
    // Check if rules already exist
    const count = await EscalationRule.count();
    if (count > 0) {
      console.log('Escalation rules already exist, skipping seed.');
      await dbSequelize.close();
      return;
    }
    
    // Create default escalation rules
    const defaultRules = [
      {
        name: 'Critical Incident - All Channels',
        description: 'Automatically escalate all critical incidents',
        priority: 1,
        active: true,
        conditionsIncidentTypes: ['fire', 'explosion', 'kidnap'],
        conditionsSeverities: ['critical'],
        conditionsChannels: ['ussd', 'web', 'mobile', 'api'],
        escalationLevel: 3,
        escalationAssigneeType: 'agency_liaison',
        escalationAssigneeName: 'Police Emergency Response',
        escalationAssigneePhone: '+2348000000001',
        escalationAssigneeOrganization: 'Police',
        escalationNotificationMethod: 'multiple',
        escalationSlaMinutes: 15,
        escalationNotificationMessage: 'CRITICAL INCIDENT - Immediate response required',
        cooldownMinutes: 30,
      },
      {
        name: 'High Severity - USSD Reports',
        description: 'Escalate high severity incidents reported via USSD',
        priority: 10,
        active: true,
        conditionsIncidentTypes: ['fire', 'theft', 'violence', 'gunshot'],
        conditionsSeverities: ['high'],
        conditionsChannels: ['ussd'],
        escalationLevel: 2,
        escalationAssigneeType: 'community_focal',
        escalationAssigneeName: 'Community Focal Point',
        escalationAssigneePhone: '+2348000000002',
        escalationAssigneeOrganization: 'Community',
        escalationNotificationMethod: 'sms',
        escalationSlaMinutes: 30,
        cooldownMinutes: 60,
      },
      {
        name: 'Medium Severity - All Channels',
        description: 'Standard escalation for medium severity incidents',
        priority: 50,
        active: true,
        conditionsSeverities: ['medium'],
        conditionsChannels: ['ussd', 'web', 'mobile', 'api'],
        escalationLevel: 1,
        escalationAssigneeType: 'community_focal',
        escalationAssigneeName: 'Community Focal Point',
        escalationAssigneePhone: '+2348000000002',
        escalationAssigneeOrganization: 'Community',
        escalationNotificationMethod: 'sms',
        escalationSlaMinutes: 60,
        cooldownMinutes: 120,
      },
    ];
    
    for (const rule of defaultRules) {
      await EscalationRule.create(rule);
    }
    
    console.log(`Created ${defaultRules.length} default escalation rules.`);
    await dbSequelize.close();
  } catch (error) {
    console.error('Error seeding escalation rules:', error.message);
    // Continue even if seeding fails
  }
}

async function main() {
  console.log('Starting database initialization...\n');
  
  try {
    await createDatabase();
    await syncModels();
    await seedEscalationRules();
    
    console.log('\n✅ Database initialization completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  createDatabase,
  syncModels,
  seedEscalationRules,
};

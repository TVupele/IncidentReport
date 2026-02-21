require('dotenv').config();

// Validate required database environment variables
const requiredDbVars = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredDbVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
  env: process.env.NODE_ENV || 'production',
  host: process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiVersion: process.env.API_VERSION || 'v1',
  
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    dialect: 'postgres',
    dialectOptions: process.env.DB_SSL === 'true' ? {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Supabase uses self-signed certificates
      },
    } : {},
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    logging: process.env.DB_LOGGING === 'true',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  // Africa's Talking Configuration (replaces Twilio)
  africastalking: {
    apiKey: process.env.AFRICAS_TALKING_API_KEY,
    username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox',
    shortCode: process.env.AFRICAS_TALKING_SHORT_CODE,
    keyword: process.env.AFRICAS_TALKING_KEYWORD || 'INCIDENT',
    callbackUrl: process.env.AFRICAS_TALKING_CALLBACK_URL,
  },
  
  // Twilio (kept for fallback/SMS)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  
  ussd: {
    shortCode: process.env.USSD_SHORT_CODE || '*384*154011#',
    sessionTimeoutMs: parseInt(process.env.USSD_SESSION_TIMEOUT_MS, 10) || 120000,
    provider: process.env.USSD_PROVIDER || 'africastalking', // 'africastalking' or 'hub2'
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },
  
  location: {
    defaultCountry: process.env.DEFAULT_COUNTRY || 'Nigeria',
    defaultState: process.env.DEFAULT_STATE || 'Kano',
  },
  
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  
  ws: {
    port: parseInt(process.env.WS_PORT, 10) || 3001,
  },

  // Hausa USSD menu text (numeric prompts)
  ussdMenus: {
    hausa: {
      welcome: 'MATASA Incident Report\n1. Rahota Hatsari\n2. Rahota Ayyuka\n3. Neman Taimako\n4. Karanta Alerta\n5. Maimaita',
      suspiciousActivity: 'Ka gani wani abu?:\n1. Mace ta yi\n2. Bindiga\n3. Kwashe\n4. Satar dukiya\n5. Wani',
      incidentInProgress: 'Nau\'in ayyuka:\n1. Guba\n2. Fashe\n3. Satar\n4. Ladanci\n5. Wani',
      requestHelp: 'Taimako:\n1. Police\n2. Fire service\n3. Ambulance\n4. Community focal',
      alert: 'Alerta ya shiga\n{alert}',
      thankYou: 'Na gode! Rahotonka ya isa. ID: {incidentId}',
      timeout: 'Session ya ƙare. Don sake fara, sake duba *384*154011#',
      invalid: 'Shigarwa ba daidai ba. Gwada sake.',
    },
    english: {
      welcome: 'MATASA Incident Report\n1. Report Suspicious\n2. Report Incident\n3. Request Help\n4. Read Alerts\n5. Repeat',
      suspiciousActivity: 'What did you see?:\n1. Fight\n2. Gunshot\n3. Kidnap\n4. Theft\n5. Other',
      incidentInProgress: 'Incident type:\n1. Fire\n2. Explosion\n3. Theft\n4. Violence\n5. Other',
      requestHelp: 'Help needed:\n1. Police\n2. Fire service\n3. Ambulance\n4. Community focal',
      alert: 'New alert received\n{alert}',
      thankYou: 'Thank you! Your report submitted. ID: {incidentId}',
      timeout: 'Session timed out. To restart, dial *384*154011#',
      invalid: 'Invalid input. Try again.',
    }
  }
};
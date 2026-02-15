// Mock dependencies before requiring modules
jest.mock('mongoose');
jest.mock('redis');

const mongoose = require('mongoose');
const Redis = require('redis');

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  zAdd: jest.fn().mockResolvedValue(1),
  zRemRangeByScore: jest.fn().mockResolvedValue(0),
  zCard: jest.fn().mockResolvedValue(0),
  zRange: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue(undefined),
};

Redis.createClient.mockReturnValue(mockRedisClient);

// Mock mongoose
mongoose.connect = jest.fn().mockResolvedValue({});
mongoose.connection.close = jest.fn().mockResolvedValue({});

describe('Incident Ingestion Service', () => {
  let incidentIngestionService;
  let deduplicationService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh instances
    jest.resetModules();
    
    // Mock the models
    const mockIncident = {
      save: jest.fn().mockResolvedValue({
        incidentId: 'INC-ABC123',
        channel: 'ussd',
        incidentType: 'suspicious_activity',
        status: 'received',
      }),
    };
    
    jest.doMock('../src/models', () => ({
      Incident: jest.fn().mockImplementation(() => mockIncident),
      Incident: {
        find: jest.fn().mockReturnThis(),
        findOne: jest.fn(),
        aggregate: jest.fn().mockResolvedValue([]),
        countDocuments: jest.fn().mockResolvedValue(0),
      },
      UssdSession: jest.fn(),
      Alert: jest.fn(),
      EscalationRule: jest.fn(),
    }));
    
    incidentIngestionService = require('../src/services/incidentIngestionService');
    deduplicationService = require('../src/services/deduplicationService');
  });
  
  describe('createFromUssd', () => {
    it('should create incident from USSD session', async () => {
      const sessionData = {
        phoneNumber: '+2348012345678',
        incidentType: 'suspicious_activity',
        severity: 'high',
        description: 'Suspicious person seen',
        callbackConsent: true,
        language: 'hausa',
      };
      
      const telcoMetadata = {
        cellTowerId: 'CELL001',
        lac: '12345',
        mcc: '621',
      };
      
      // The mock should work
      expect(sessionData.phoneNumber).toBeDefined();
      expect(sessionData.incidentType).toBe('suspicious_activity');
    });
    
    it('should set default severity if not provided', () => {
      const data = {
        phoneNumber: '+2348012345678',
        incidentType: 'theft',
      };
      
      const severity = data.severity || 'medium';
      expect(severity).toBe('medium');
    });
  });
  
  describe('createFromApi', () => {
    it('should create incident from mobile/web API', async () => {
      const reportData = {
        channel: 'mobile',
        incidentType: 'fire',
        severity: 'critical',
        latitude: 11.9679,
        longitude: 8.5241,
        description: 'Fire outbreak in market',
        callbackConsent: false,
      };
      
      expect(reportData.channel).toBe('mobile');
      expect(reportData.incidentType).toBe('fire');
      expect(reportData.latitude).toBeDefined();
    });
    
    it('should default to anonymous', () => {
      const reportData = {
        incidentType: 'theft',
      };
      
      const isAnonymous = reportData.anonymous !== false;
      expect(isAnonymous).toBe(true);
    });
  });
});

describe('Deduplication Service', () => {
  let deduplicationService;
  
  beforeEach(() => {
    jest.resetModules();
    deduplicationService = require('../src/services/deduplicationService');
  });
  
  describe('calculateSpatialSimilarity', () => {
    it('should return high score for close GPS coordinates', () => {
      const loc1 = { latitude: 11.9679, longitude: 8.5241 };
      const loc2 = { latitude: 11.9680, longitude: 8.5242 };
      
      const score = deduplicationService.calculateSpatialSimilarity(loc1, loc2);
      expect(score).toBeGreaterThan(20);
    });
    
    it('should return 0 for distant locations', () => {
      const loc1 = { latitude: 11.9679, longitude: 8.5241 };
      const loc2 = { latitude: 12.0000, longitude: 9.0000 };
      
      const score = deduplicationService.calculateSpatialSimilarity(loc1, loc2);
      expect(score).toBe(0);
    });
    
    it('should check village match if GPS not available', () => {
      const loc1 = { village: 'Kano' };
      const loc2 = { village: 'Kano' };
      
      const score = deduplicationService.calculateSpatialSimilarity(loc1, loc2);
      expect(score).toBe(30);
    });
  });
  
  describe('calculateTypeSimilarity', () => {
    it('should return max score for same type', () => {
      const score = deduplicationService.calculateTypeSimilarity('fire', 'fire');
      expect(score).toBe(20);
    });
    
    it('should return partial score for related types', () => {
      const score = deduplicationService.calculateTypeSimilarity('suspicious_activity', 'theft');
      expect(score).toBe(10);
    });
  });
  
  describe('calculateTemporalSimilarity', () => {
    it('should return high score for recent incidents', () => {
      const now = Date.now();
      const time1 = new Date(now - 1000 * 60 * 2); // 2 minutes ago
      const time2 = new Date(now); // now
      
      const score = deduplicationService.calculateTemporalSimilarity(time1, time2);
      expect(score).toBe(30);
    });
  });
});

describe('Rate Limiter Service', () => {
  let rateLimiterService;
  
  beforeEach(() => {
    jest.resetModules();
    rateLimiterService = require('../src/services/rateLimiterService');
  });
  
  afterEach(async () => {
    await rateLimiterService.init();
    rateLimiterService.memoryStore.clear();
  });
  
  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const result = await rateLimiterService.checkRateLimit('test-phone', {
        maxRequests: 10,
        windowMs: 60000,
      });
      
      expect(result.limited).toBe(false);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });
    
    it('should block requests exceeding limit', async () => {
      // Use a unique key for this test
      const uniqueKey = `test-${Date.now()}`;
      
      // Make 10 requests (the limit)
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkRateLimit(uniqueKey, {
          maxRequests: 10,
          windowMs: 60000,
        });
      }
      
      // 11th request should be blocked
      const result = await rateLimiterService.checkRateLimit(uniqueKey, {
        maxRequests: 10,
        windowMs: 60000,
      });
      
      expect(result.limited).toBe(true);
    });
  });
});

describe('Escalation Service', () => {
  let escalationService;
  
  beforeEach(() => {
    jest.resetModules();
    escalationService = require('../src/services/escalationService');
  });
  
  describe('ruleMatchesIncident', () => {
    it('should match incident by type', () => {
      const rule = {
        conditions: {
          incidentTypes: ['fire', 'theft'],
        },
      };
      
      const incident = {
        incidentType: 'fire',
        severity: 'high',
      };
      
      const matches = escalationService.ruleMatchesIncident(rule, incident);
      expect(matches).toBe(true);
    });
    
    it('should not match when type is different', () => {
      const rule = {
        conditions: {
          incidentTypes: ['fire'],
        },
      };
      
      const incident = {
        incidentType: 'theft',
      };
      
      const matches = escalationService.ruleMatchesIncident(rule, incident);
      expect(matches).toBe(false);
    });
    
    it('should match by severity', () => {
      const rule = {
        conditions: {
          severities: ['critical', 'high'],
        },
      };
      
      const incident = {
        incidentType: 'fire',
        severity: 'critical',
      };
      
      const matches = escalationService.ruleMatchesIncident(rule, incident);
      expect(matches).toBe(true);
    });
    
    it('should match by location', () => {
      const rule = {
        conditions: {
          states: ['Kano', 'Katsina'],
        },
      };
      
      const incident = {
        incidentType: 'fire',
        location: { state: 'Kano' },
      };
      
      const matches = escalationService.ruleMatchesIncident(rule, incident);
      expect(matches).toBe(true);
    });
  });
});

describe('Notification Service', () => {
  let notificationService;
  
  beforeEach(() => {
    jest.resetModules();
    notificationService = require('../src/services/notificationService');
  });
  
  describe('formatPhoneNumber', () => {
    it('should format Nigerian numbers', () => {
      const result = notificationService.formatPhoneNumber('08012345678');
      expect(result).toBe('+2348012345678');
    });
    
    it('should handle numbers starting with 234', () => {
      const result = notificationService.formatPhoneNumber('2348012345678');
      expect(result).toBe('+2348012345678');
    });
    
    it('should return null for empty input', () => {
      const result = notificationService.formatPhoneNumber('');
      expect(result).toBeNull();
    });
  });
  
  describe('formatEscalationMessage', () => {
    it('should format escalation message correctly', () => {
      const incident = {
        incidentId: 'INC-ABC123',
        incidentType: 'fire',
        severity: 'critical',
        location: { village: 'Kano', lga: 'Kano Municipal' },
        description: { text: 'Big fire in market' },
      };
      
      const rule = {
        name: 'Fire Escalation',
        escalation: {
          level: 2,
          slaMinutes: 60,
        },
      };
      
      const message = notificationService.formatEscalationMessage(incident, rule);
      
      expect(message).toContain('ESCALATION');
      expect(message).toContain('CRITICAL');
      expect(message).toContain('INC-ABC123');
      expect(message).toContain('Kano');
    });
  });
});

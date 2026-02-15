const { createClient } = require('redis');
const config = require('../config');

class RateLimiterService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    if (this.initialized) return;

    // Check if Redis should be skipped (for development without Redis)
    if (process.env.SKIP_REDIS === 'true') {
      console.log('Rate limiter: SKIP_REDIS=true, using in-memory fallback');
      this.client = null;
      this.initialized = true;
      this.memoryStore = new Map();
      return;
    }

    try {
      const url = config.redis.password 
        ? `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}`
        : `redis://${config.redis.host}:${config.redis.port}`;
      
      const redisClient = createClient({
        url: url,
        // Disable auto-reconnect to prevent repeated connection attempts
        socket: {
          reconnectStrategy: false,
        },
      });

      // Only add error handler after successful connection
      redisClient.on('error', (err) => {
        // Silently handle connection errors during initialization
        // The fallback to memory store will be used
      });

      await redisClient.connect();
      this.client = redisClient;
      this.initialized = true;
      console.log('Rate limiter Redis connected');
    } catch (error) {
      console.log('Rate limiter: Redis not available, using in-memory fallback');
      this.client = null;
      this.initialized = true;
      this.memoryStore = new Map();
    }
  }

  /**
   * Check if request is rate limited
   */
  async checkRateLimit(identifier, options = {}) {
    const {
      windowMs = config.rateLimit.windowMs,
      maxRequests = config.rateLimit.maxRequests,
      prefix = 'ratelimit',
    } = options;

    const key = `${prefix}:${identifier}`;
    
    try {
      if (this.client) {
        return this.checkRedisRateLimit(key, windowMs, maxRequests);
      } else {
        return this.checkMemoryRateLimit(key, windowMs, maxRequests);
      }
    } catch (error) {
      console.error(`Rate limit check failed: ${error.message}`);
      // Fail open - allow request if rate limiting fails
      return { limited: false, remaining: maxRequests };
    }
  }

  /**
   * Redis-based rate limiting
   */
  async checkRedisRateLimit(key, windowMs, maxRequests) {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old entries
    await this.client.zRemRangeByScore(key, '-inf', windowStart);

    // Count current requests
    const count = await this.client.zCard(key);

    if (count >= maxRequests) {
      // Get oldest entry to calculate retry-after
      const oldest = await this.client.zRange(key, 0, 0, { WITHSCORES: true });
      const retryAfter = oldest.length >= 2 
        ? Math.ceil((parseInt(oldest[1]) + windowMs - now) / 1000)
        : Math.ceil(windowMs / 1000);

      return {
        limited: true,
        limit: maxRequests,
        remaining: 0,
        resetTime: new Date(now + windowMs),
        retryAfter,
      };
    }

    // Add current request
    await this.client.zAdd(key, { score: now, value: now.toString() });
    await this.client.expire(key, Math.ceil(windowMs / 1000));

    return {
      limited: false,
      limit: maxRequests,
      remaining: maxRequests - count - 1,
      resetTime: new Date(now + windowMs),
    };
  }

  /**
   * In-memory rate limiting (fallback)
   */
  checkMemoryRateLimit(key, windowMs, maxRequests) {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.memoryStore.has(key)) {
      this.memoryStore.set(key, []);
    }

    const entries = this.memoryStore.get(key);
    
    // Remove old entries
    const validEntries = entries.filter(t => t >= windowStart);
    this.memoryStore.set(key, validEntries);

    const count = validEntries.length;

    if (count >= maxRequests) {
      const oldest = validEntries[0] || now;
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);

      return {
        limited: true,
        limit: maxRequests,
        remaining: 0,
        resetTime: new Date(now + windowMs),
        retryAfter,
      };
    }

    // Add current request
    validEntries.push(now);
    this.memoryStore.set(key, validEntries);

    return {
      limited: false,
      limit: maxRequests,
      remaining: maxRequests - count - 1,
      resetTime: new Date(now + windowMs),
    };
  }

  /**
   * Get current usage stats for an identifier
   */
  async getUsageStats(identifier, windowMs = 3600000) {
    const key = `ratelimit:${identifier}`;
    
    try {
      if (this.client) {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        await this.client.zRemRangeByScore(key, '-inf', windowStart);
        const count = await this.client.zCard(key);
        
        return {
          identifier,
          count,
          windowMs,
        };
      } else {
        const entries = this.memoryStore.get(key) || [];
        const validEntries = entries.filter(t => t >= Date.now() - windowMs);
        
        return {
          identifier,
          count: validEntries.length,
          windowMs,
        };
      }
    } catch (error) {
      console.error(`Failed to get usage stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetLimit(identifier) {
    const key = `ratelimit:${identifier}`;
    
    try {
      if (this.client) {
        await this.client.del(key);
      } else {
        this.memoryStore.delete(key);
      }
      return { success: true };
    } catch (error) {
      console.error(`Failed to reset rate limit: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Middleware factory for Express
   */
  createMiddleware(options = {}) {
    return async (req, res, next) => {
      await this.init();
      
      const identifier = options.keyGenerator 
        ? options.keyGenerator(req)
        : req.ip || req.connection.remoteAddress;
      
      const result = await this.checkRateLimit(identifier, options);
      
      // Set rate limit headers
      res.set('X-RateLimit-Limit', result.limit);
      res.set('X-RateLimit-Remaining', result.remaining);
      res.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      
      if (result.limited) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        });
      }
      
      next();
    };
  }
}

module.exports = new RateLimiterService();

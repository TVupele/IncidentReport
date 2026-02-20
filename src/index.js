require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

const config = require('./config');
const { rateLimiterService } = require('./services');
const { sequelize, initModels, syncDatabase } = require('./models');

// Configure Winston logger
const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Add file transport in production
    ...(config.env === 'production'
      ? [new winston.transports.File({ filename: 'logs/error.log', level: 'error' })]
      : []),
  ],
});

const app = express();

// Trust proxy (for rate limiting behind load balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Set to true and configure if needed
}));

// CORS – allow specific origins or default to * in development only
const corsOptions = {
  origin: config.env === 'production'
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    : '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Info'],
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging with Morgan + Winston
const morganStream = {
  write: (message) => logger.info(message.trim()),
};
app.use(morgan('combined', { stream: morganStream, skip: (req, res) => config.env === 'test' }));

// Static files with caching
app.use(express.static('public', { maxAge: '1d' }));

// Redirect root to mobile app
app.get('/', (req, res) => {
  res.redirect('/mobile/index.html');
});

// Global rate limiter for API routes
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1', apiLimiter);

// Routes
app.use('/api/v1/incidents', require('./routes/incidents'));
app.use('/api/v1/ussd', require('./routes/ussd'));
app.use('/api/v1/admin', require('./routes/admin'));

// Health check with simple caching
let dbStatus = 'unknown';
let lastCheck = 0;
const healthCheckCacheMs = 5000; // 5 seconds

app.get('/health', async (req, res) => {
  const now = Date.now();
  if (now - lastCheck > healthCheckCacheMs) {
    try {
      await sequelize.authenticate();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'disconnected';
      logger.error('Health check DB error', { error: error.message });
    }
    lastCheck = now;
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    database: dbStatus,
  });
});

// API documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'MATASA Incident Report Platform API',
    version: config.apiVersion,
    endpoints: {
      incidents: {
        'POST /api/v1/incidents': 'Submit incident report',
        'GET /api/v1/incidents': 'List incidents',
        'GET /api/v1/incidents/:id': 'Get incident details',
        'PATCH /api/v1/incidents/:id/status': 'Update incident status',
      },
      ussd: {
        'POST /api/v1/ussd': 'USSD webhook endpoint',
        'POST /api/v1/ussd/simulate': 'Simulate USSD request',
      },
      admin: {
        'GET /api/v1/admin/dashboard': 'Dashboard data',
        'GET /api/v1/admin/incidents': 'List all incidents',
        'POST /api/v1/admin/alerts': 'Create alert',
        'GET /api/v1/admin/analytics': 'Analytics data',
      },
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  const status = err.status || 500;
  const message = config.env === 'production' && status === 500
    ? 'Internal Server Error'
    : err.message;

  res.status(status).json({
    error: err.name || 'InternalServerError',
    message,
  });
});

// Initialisation and server start
async function start() {
  let dbConnected = false;
  const skipDb = process.env.SKIP_DATABASE === 'true';

  // Database connection (unless skipped)
  if (!skipDb) {
    try {
      logger.info('Connecting to PostgreSQL...');

      // Define models first
      initModels(sequelize);

      // Authenticate and sync (use { force: false } in production)
      await sequelize.authenticate();
      logger.info('PostgreSQL connected');

      if (config.env !== 'production') {
        // In dev/test, sync (alter may be safer than force)
        await syncDatabase({ alter: true });
        logger.info('Database synced');
      }

      dbConnected = true;
    } catch (error) {
      logger.error('Database connection failed', { error: error.message });

      if (config.env === 'production') {
        logger.error('Exiting due to database failure in production');
        process.exit(1);
      } else {
        logger.warn('Running in development without database (limited functionality)');
      }
    }
  } else {
    logger.warn('SKIP_DATABASE=true – running without database (limited functionality)');
  }

  // Initialise rate limiter (may attempt Redis, fallback to in-memory)
  try {
    await rateLimiterService.init();
    logger.info('Rate limiter initialised');
  } catch (error) {
    logger.warn('Rate limiter init failed, using in-memory fallback', { error: error.message });
  }

  // Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`USSD Short Code: ${config.ussd.shortCode}`);
    logger.info(`API Documentation: http://localhost:${config.port}/api/v1`);
    logger.info(`Database: ${dbConnected ? 'Connected' : 'Not connected'}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      if (dbConnected) {
        try {
          await sequelize.close();
          logger.info('PostgreSQL connection closed');
        } catch (error) {
          logger.error('Error closing PostgreSQL', { error: error.message });
        }
      }

      // Close other connections (e.g., Redis)
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  // Optionally exit in production
  if (config.env === 'production') process.exit(1);
});

// Start the application
start();

module.exports = app;
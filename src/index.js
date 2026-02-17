require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { rateLimiterService } = require('./services');
const { initializeDatabase, sequelize } = require('./models/database');
const { initModels } = require('./models');

// Import routes
const incidentRoutes = require('./routes/incidents');
const ussdRoutes = require('./routes/ussd');
const adminRoutes = require('./routes/admin');

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Info'],
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (config.env !== 'test') {
  app.use(morgan('combined'));
}

// Static file serving
app.use(express.static('public'));

// Redirect root to mobile app
app.get('/', (req, res) => {
  res.redirect('/mobile/index.html');
});

// Rate limiting for API routes
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
app.use('/api/v1/incidents', incidentRoutes);
app.use('/api/v1/ussd', ussdRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
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

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: config.env === 'production' ? 'An error occurred' : err.message,
  });
});

// Initialize services and start server
async function start() {
  let dbConnected = false;
  
  // Check if we should skip database for development
  const skipDb = process.env.SKIP_DATABASE === 'true';
  
  if (skipDb) {
    console.log('⚠️  SKIP_DATABASE=true, running without database (limited functionality)');
    dbConnected = false;
  } else {
    try {
      // Initialize database connection and sync models
      console.log('Connecting to PostgreSQL...');
      await initializeDatabase();
      
      // Initialize models
      const models = initModels(sequelize);
      global.models = models; // Make models available globally
      
      console.log('PostgreSQL connected and models synchronized');
      dbConnected = true;
      
    } catch (error) {
      console.error('Database connection failed:', error.message);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  Running in development mode without database');
        console.log('⚠️  Some features will not work without a database');
        dbConnected = false;
      } else {
        console.error('========================================');
        console.error('Could not connect to PostgreSQL database.');
        console.error('To run without database, set SKIP_DATABASE=true');
        console.error('========================================');
        process.exit(1);
      }
    }
  }
  
  try {
    // Initialize rate limiter (works without Redis)
    await rateLimiterService.init();
    
    // Start server
    const server = app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.env}`);
      console.log(`USSD Short Code: ${config.ussd.shortCode}`);
      console.log(`API Documentation: http://localhost:${config.port}/api/v1`);
      console.log(`Database: ${dbConnected ? 'Connected (PostgreSQL)' : 'Not connected (limited functionality)'}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server, dbConnected));
    process.on('SIGINT', () => gracefulShutdown(server, dbConnected));
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

function gracefulShutdown(server, dbConnected = false) {
  console.log('Graceful shutdown initiated...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    if (dbConnected) {
      try {
        await sequelize.close();
        console.log('PostgreSQL connection closed');
      } catch (error) {
        console.error('Error closing PostgreSQL:', error);
      }
    }
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
}

// Start the application
start();

module.exports = app;

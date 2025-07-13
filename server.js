// Product Hunt Analyzer - Main server file
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');

// Import services
const authService = require('./services/authService');
const productHuntService = require('./services/productHuntService');
const chatGPTService = require('./services/chatGPTService');

// Import utilities and middleware
const logger = require('./utils/logger');
const ErrorHandler = require('./middleware/errorHandler');
const InternalAuth = require('./middleware/internalAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Heroku deployment
app.set('trust proxy', 1);

// Initialize global error handlers
ErrorHandler.init();

// Security middleware with relaxed CSP for internal tool
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors());

// Rate limiting with enhanced error handling
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});
app.use(limiter);

// Enhanced logging
app.use(morgan('combined'));
app.use(logger.logRequest.bind(logger));

// Internal authentication middleware
app.use(InternalAuth.checkInternalAccess);
app.use(InternalAuth.addInternalWarning);
app.use(InternalAuth.checkEnvironment);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/results.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

// OAuth setup routes (for initial configuration only)
app.get('/auth/setup', InternalAuth.restrictOAuthAccess, authService.initiateAuth);
app.get('/callback', InternalAuth.restrictOAuthAccess, authService.handleCallback);
app.get('/api/auth/status', authService.checkAuthStatus);

// API routes
app.get('/api/status', ErrorHandler.asyncHandler(async (req, res) => {
  const authStatus = await authService.getTokenInfo();

  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    authentication: {
      hasToken: authStatus.hasToken,
      isExpired: authStatus.isExpired
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
}));

// Health check endpoint for Heroku
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  res.json({
    hasPHToken: !!process.env.PH_DEVELOPER_TOKEN,
    tokenLength: process.env.PH_DEVELOPER_TOKEN ? process.env.PH_DEVELOPER_TOKEN.length : 0,
    tokenPreview: process.env.PH_DEVELOPER_TOKEN ? process.env.PH_DEVELOPER_TOKEN.substring(0, 10) + '...' : 'not set',
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    nodeEnv: process.env.NODE_ENV
  });
});

// Server-Sent Events endpoint for real-time analysis
app.get('/api/analyze-stream', ErrorHandler.asyncHandler(async (req, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    logger.info('Starting streaming analysis');
    sendEvent('status', { message: 'Starting analysis...', step: 'init' });

    // Check authentication (simplified for internal use)
    const accessToken = await authService.getStoredToken();
    if (!accessToken) {
      sendEvent('error', { message: 'Authentication required. Please set up API credentials.' });
      return res.end();
    }

    sendEvent('status', { message: 'Fetching trending products...', step: 'fetch' });

    // Fetch products with timeout
    const products = await Promise.race([
      productHuntService.getTrendingProducts(accessToken, 10), // Limit to 10 products
      new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 15000))
    ]);

    if (!products || products.length === 0) {
      sendEvent('error', { message: 'No trending products found' });
      return res.end();
    }

    sendEvent('status', {
      message: `Found ${products.length} products. Starting analysis...`,
      step: 'analyze',
      total: products.length
    });

    const analyzedProducts = [];
    let successCount = 0;
    let errorCount = 0;

    // Process products in smaller batches to avoid timeout
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        sendEvent('progress', {
          current: i + 1,
          total: products.length,
          product: product.name,
          message: `Analyzing ${product.name}...`
        });

        const analysis = await Promise.race([
          chatGPTService.analyzeProduct(product),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Analysis timeout')), 8000))
        ]);

        const analyzedProduct = { ...product, analysis };
        analyzedProducts.push(analyzedProduct);
        successCount++;

        // Send individual product result
        sendEvent('product', analyzedProduct);

      } catch (error) {
        logger.error(`Error analyzing product ${product.name}`, { error: error.message });
        const errorProduct = {
          ...product,
          analysis: { error: error.message }
        };
        analyzedProducts.push(errorProduct);
        errorCount++;

        sendEvent('product', errorProduct);
      }

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Send final results
    const finalData = {
      totalProducts: analyzedProducts.length,
      successCount,
      errorCount,
      timestamp: new Date().toISOString(),
      products: analyzedProducts
    };

    sendEvent('complete', finalData);
    logger.info('Streaming analysis completed', { successCount, errorCount });

  } catch (error) {
    logger.error('Streaming analysis error', { error: error.message });
    sendEvent('error', { message: error.message });
  } finally {
    res.end();
  }
}));

// Quick analysis endpoint (for testing without streaming)
app.post('/api/quick-analyze', ErrorHandler.asyncHandler(async (req, res) => {
  const accessToken = await authService.getStoredToken();
  if (!accessToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Get just 3 products for quick testing
    const products = await productHuntService.getTrendingProducts(accessToken, 3);

    if (!products || products.length === 0) {
      return res.status(404).json({ error: 'No products found' });
    }

    const analyzedProducts = [];
    for (const product of products) {
      const analysis = await chatGPTService.analyzeProduct(product);
      analyzedProducts.push({ ...product, analysis });
    }

    res.json({
      success: true,
      data: {
        totalProducts: analyzedProducts.length,
        timestamp: new Date().toISOString(),
        products: analyzedProducts
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

// Error handling middleware
app.use(ErrorHandler.handle404);
app.use(ErrorHandler.handleError);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Product Hunt Analyzer server started on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });

  console.log(`🚀 Product Hunt Analyzer server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);

  // Check if credentials are configured
  const hasCredentials = process.env.PH_CLIENT_ID &&
                        process.env.PH_CLIENT_SECRET &&
                        process.env.PH_CLIENT_ID !== 'your_product_hunt_client_id' &&
                        process.env.PH_CLIENT_SECRET !== 'your_product_hunt_client_secret';

  if (hasCredentials) {
    console.log(`✅ API credentials configured`);
  } else {
    console.log(`⚠️  API setup required: http://localhost:${PORT}/auth/setup`);
    console.log(`   Configure PH_CLIENT_ID and PH_CLIENT_SECRET in .env file first`);
  }

  console.log(`📡 API status: http://localhost:${PORT}/api/status`);

  // Clean up old logs on startup
  logger.cleanupLogs().catch(err => {
    logger.error('Failed to cleanup old logs', { error: err.message });
  });
});

module.exports = app;

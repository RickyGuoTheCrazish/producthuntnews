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

// In-memory storage for analysis results (in production, use a database)
let latestAnalysisResults = null;

// Function to generate dynamic results page
function generateResultsPage(data) {
  const totalVotes = data.products.reduce((sum, product) => sum + (product.votesCount || 0), 0);

  const productsHtml = data.products.map(product => {
    const hasAnalysis = product.analysis && !product.analysis.error;
    const thumbnailUrl = product.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" fill="%23f0f0f0"/><text x="30" y="35" text-anchor="middle" fill="%23999" font-size="12">No Image</text></svg>';

    return `
      <div class="product-card">
        <div class="product-header">
          <img src="${thumbnailUrl}" alt="${product.name}" class="product-thumbnail" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"60\\" height=\\"60\\" viewBox=\\"0 0 60 60\\"><rect width=\\"60\\" height=\\"60\\" fill=\\"%23f0f0f0\\"/><text x=\\"30\\" y=\\"35\\" text-anchor=\\"middle\\" fill=\\"%23999\\" font-size=\\"12\\">No Image</text></svg>'">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.tagline || 'No tagline available'}</p>
          </div>
        </div>

        <div class="product-stats">
          <div class="stat">
            <strong>${product.votesCount || 0}</strong> votes
          </div>
          <div class="stat">
            <strong>${product.commentsCount || 0}</strong> comments
          </div>
          ${product.website ? `<div class="stat"><a href="${product.website}" target="_blank">🌐 Website</a></div>` : ''}
        </div>

        ${hasAnalysis ? `
          <div class="analysis-section">
            <h4>🎯 Target Users</h4>
            <div class="target-users">
              ${product.analysis.targetUsers ? product.analysis.targetUsers.map(user =>
                `<span class="user-tag">${user.demographic}</span>`
              ).join('') : '<span class="user-tag">No target users identified</span>'}
            </div>

            ${product.analysis.successProbability ? `
              <div class="success-probability success-${product.analysis.successProbability}">
                Success Probability: ${product.analysis.successProbability.toUpperCase()}
              </div>
            ` : ''}

            ${product.analysis.summary ? `
              <div class="analysis-summary">
                ${product.analysis.summary}
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="error-card">
            <strong>Analysis Failed:</strong> ${product.analysis?.error || 'Unknown error occurred'}
          </div>
        `}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analysis Results - Product Hunt Analyzer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: white; margin-bottom: 30px; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
        .summary-card { background: white; border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-item { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .stat-item h3 { color: #667eea; font-size: 2rem; margin-bottom: 5px; }
        .stat-item p { color: #666; font-size: 0.9rem; }
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; margin-top: 20px; }
        .product-card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); transition: transform 0.3s ease; }
        .product-card:hover { transform: translateY(-5px); }
        .product-header { display: flex; align-items: center; margin-bottom: 15px; }
        .product-thumbnail { width: 60px; height: 60px; border-radius: 8px; margin-right: 15px; object-fit: cover; background: #f0f0f0; }
        .product-info h3 { color: #333; margin-bottom: 5px; font-size: 1.2rem; }
        .product-info p { color: #666; font-size: 0.9rem; }
        .product-stats { display: flex; gap: 15px; margin: 15px 0; }
        .stat { background: #f8f9fa; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
        .stat strong { color: #667eea; }
        .analysis-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
        .analysis-section h4 { color: #333; margin-bottom: 10px; font-size: 1rem; }
        .target-users { margin-bottom: 15px; }
        .user-tag { display: inline-block; background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; margin: 2px; }
        .success-probability { padding: 8px 12px; border-radius: 6px; font-weight: bold; text-align: center; margin: 10px 0; }
        .success-high { background: #d4edda; color: #155724; }
        .success-medium { background: #fff3cd; color: #856404; }
        .success-low { background: #f8d7da; color: #721c24; }
        .analysis-summary { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px; font-style: italic; color: #555; }
        .error-card { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 8px; margin-top: 15px; }
        .btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: all 0.3s ease; text-decoration: none; display: inline-block; margin: 10px; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .btn-secondary { background: #6c757d; }
        .btn-success { background: #28a745; }
        .actions { text-align: center; margin: 30px 0; }
        @media (max-width: 768px) { .container { padding: 10px; } .products-grid { grid-template-columns: 1fr; } .summary-stats { grid-template-columns: repeat(2, 1fr); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Product Hunt Analysis Results</h1>
            <p>AI-powered insights into trending products and their target users</p>
            <p><small>Analysis completed: ${new Date(data.timestamp).toLocaleString()}</small></p>
        </div>

        <div class="summary-card">
            <h2>📊 Analysis Summary</h2>
            <div class="summary-stats">
                <div class="stat-item">
                    <h3>${data.totalProducts}</h3>
                    <p>Total Products</p>
                </div>
                <div class="stat-item">
                    <h3>${data.successCount}</h3>
                    <p>Successful Analyses</p>
                </div>
                <div class="stat-item">
                    <h3>${data.errorCount}</h3>
                    <p>Failed Analyses</p>
                </div>
                <div class="stat-item">
                    <h3>${totalVotes.toLocaleString()}</h3>
                    <p>Total Votes</p>
                </div>
            </div>

            <div class="actions">
                <button class="btn btn-success" onclick="exportResultsCSV()">📊 导出CSV</button>
                <button class="btn btn-success" onclick="exportResults()">📥 Export JSON</button>
                <a href="/" class="btn btn-secondary">🏠 Back to Home</a>
                <a href="/results.html" class="btn">🔄 Run New Analysis</a>
            </div>
        </div>

        <div>
            <h2 style="color: white; margin-bottom: 20px;">🎯 Product Analysis Details</h2>
            <div class="products-grid">
                ${productsHtml}
            </div>
        </div>
    </div>

    <script>
        const analysisData = ${JSON.stringify(data)};

        function exportResults() {
            const dataStr = JSON.stringify(analysisData, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = \`product_analysis_\${new Date().toISOString().split('T')[0]}.json\`;
            link.click();
            URL.revokeObjectURL(url);
        }

        function exportResultsCSV() {
            const headers = ['产品名称', '标语', '投票数', '评论数', '成功概率', '目标用户群体', '市场洞察', '用户画像', '分析摘要', '产品链接', '主题标签', '创建时间'];
            const csvData = analysisData.products.map(product => {
                const analysis = product.analysis || {};
                return [
                    \`"\${product.name || ''}"\`,
                    \`"\${product.tagline || ''}"\`,
                    product.votesCount || 0,
                    product.commentsCount || 0,
                    \`"\${analysis.successProbability || '未知'}"\`,
                    \`"\${analysis.targetUsers ? analysis.targetUsers.map(u => \`\${u.demographic}(\${u.likelihood})\`).join('; ') : '未分析'}"\`,
                    \`"\${analysis.marketInsights || '无'}"\`,
                    \`"\${analysis.userPersonas ? analysis.userPersonas.join('; ') : '无'}"\`,
                    \`"\${analysis.summary || '无分析'}"\`,
                    \`"\${product.url || ''}"\`,
                    \`"\${product.topics ? product.topics.map(t => t.name).join(', ') : '无'}"\`,
                    \`"\${product.createdAt ? new Date(product.createdAt).toLocaleDateString('zh-CN') : '未知'}"\`
                ].join(',');
            });
            const csvContent = [headers.join(','), ...csvData].join('\\n');
            const BOM = '\\uFEFF';
            const csvBlob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(csvBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = \`产品分析报告_\${new Date().toISOString().split('T')[0]}.csv\`;
            link.click();
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>
  `;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dynamic results page that shows the latest analysis results
app.get('/results', (req, res) => {
  if (!latestAnalysisResults) {
    return res.redirect('/?error=no-results');
  }

  // Serve a dynamic results page with the stored results
  const resultsHtml = generateResultsPage(latestAnalysisResults);
  res.send(resultsHtml);
});

// API endpoint to get latest results as JSON
app.get('/api/latest-results', (req, res) => {
  if (!latestAnalysisResults) {
    return res.status(404).json({ error: 'No analysis results available' });
  }
  res.json(latestAnalysisResults);
});

// Static results page (for direct access to start new analysis)
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

    // Store results for the /results page
    latestAnalysisResults = finalData;

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

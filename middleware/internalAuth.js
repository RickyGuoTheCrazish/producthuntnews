// Internal Authentication Middleware
const logger = require('../utils/logger');

class InternalAuthMiddleware {
  // Check if request is from internal network (basic security)
  static checkInternalAccess(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    
    // Log all access attempts
    logger.info('Internal tool access attempt', {
      ip: clientIP,
      userAgent: userAgent,
      url: req.url,
      method: req.method
    });

    // Add security headers for internal use
    res.setHeader('X-Internal-Tool', 'true');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    
    next();
  }

  // Add warning banner for internal use
  static addInternalWarning(req, res, next) {
    // Add warning to HTML responses
    const originalSend = res.send;
    res.send = function(data) {
      if (res.get('Content-Type') && res.get('Content-Type').includes('text/html')) {
        // Add internal use warning to HTML
        const warningBanner = `
          <!-- INTERNAL TOOL WARNING -->
          <div style="background: #dc3545; color: white; padding: 10px; text-align: center; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 9999;">
            ⚠️ INTERNAL TEAM TOOL - NOT FOR PUBLIC USE ⚠️
          </div>
          <style>body { margin-top: 50px !important; }</style>
        `;
        
        if (typeof data === 'string' && data.includes('<body>')) {
          data = data.replace('<body>', '<body>' + warningBanner);
        }
      }
      originalSend.call(this, data);
    };
    
    next();
  }

  // Restrict OAuth to internal use only
  static restrictOAuthAccess(req, res, next) {
    const referer = req.get('Referer');
    const userAgent = req.get('User-Agent') || '';
    
    // Log OAuth access attempts
    logger.info('OAuth access attempt', {
      ip: req.ip,
      userAgent: userAgent,
      referer: referer,
      url: req.url
    });

    // Add additional security for OAuth endpoints
    if (req.url.includes('/auth') || req.url.includes('/callback')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  }

  // Environment-based access control
  static checkEnvironment(req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedDomains = process.env.ALLOWED_DOMAINS ? 
      process.env.ALLOWED_DOMAINS.split(',') : [];
    
    if (isProduction && allowedDomains.length > 0) {
      const host = req.get('Host');
      if (!allowedDomains.includes(host)) {
        logger.warn('Access denied - unauthorized domain', {
          host: host,
          ip: req.ip,
          allowedDomains: allowedDomains
        });
        
        return res.status(403).json({
          error: 'Access denied',
          message: 'This internal tool is not accessible from this domain'
        });
      }
    }
    
    next();
  }
}

module.exports = InternalAuthMiddleware;

// Comprehensive logging system
const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDirectory();
  }

  async ensureLogDirectory() {
    try {
      await fs.access(this.logDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.logDir, { recursive: true });
      }
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };
    
    return JSON.stringify(logEntry);
  }

  async writeLog(level, message, meta = {}) {
    try {
      await this.ensureLogDirectory();
      
      const logMessage = this.formatMessage(level, message, meta);
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `app-${date}.log`);
      
      await fs.appendFile(logFile, logMessage + '\n');
      
      // Also log to console in development
      if (process.env.NODE_ENV !== 'production') {
        const consoleMessage = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`;
        if (Object.keys(meta).length > 0) {
          console.log(consoleMessage, meta);
        } else {
          console.log(consoleMessage);
        }
      }
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  info(message, meta = {}) {
    return this.writeLog('info', message, meta);
  }

  error(message, meta = {}) {
    return this.writeLog('error', message, meta);
  }

  warn(message, meta = {}) {
    return this.writeLog('warn', message, meta);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      return this.writeLog('debug', message, meta);
    }
  }

  // Log API requests
  logRequest(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    });
    
    next();
  }

  // Log errors with stack trace
  logError(error, context = {}) {
    this.error(error.message, {
      stack: error.stack,
      name: error.name,
      ...context
    });
  }

  // Clean up old log files (keep last 30 days)
  async cleanupLogs(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      for (const file of files) {
        if (file.startsWith('app-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            this.info(`Deleted old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      this.error('Failed to cleanup logs', { error: error.message });
    }
  }
}

module.exports = new Logger();

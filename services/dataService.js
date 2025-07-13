// Data Storage Service - Local file-based storage for analyzed product data
const fs = require('fs').promises;
const path = require('path');

class DataService {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.ensureDataDirectory();
  }

  // Ensure data directory exists
  async ensureDataDirectory() {
    try {
      await fs.access(this.dataDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.dataDir, { recursive: true });
        console.log('Created data directory');
      }
    }
  }

  // Generate filename with timestamp
  generateFilename(prefix = 'product_analysis') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${timestamp}.json`;
  }

  // Save analyzed product data
  async saveAnalyzedData(analyzedProducts) {
    try {
      await this.ensureDataDirectory();
      
      const filename = this.generateFilename('product_analysis');
      const filepath = path.join(this.dataDir, filename);
      
      const dataToSave = {
        metadata: {
          timestamp: new Date().toISOString(),
          totalProducts: analyzedProducts.length,
          version: '1.0.0',
          source: 'Product Hunt API',
          analyzer: 'ChatGPT-4o'
        },
        summary: {
          successfulAnalyses: analyzedProducts.filter(p => !p.error).length,
          failedAnalyses: analyzedProducts.filter(p => p.error).length,
          totalVotes: analyzedProducts.reduce((sum, p) => sum + (p.votesCount || 0), 0),
          averageVotes: analyzedProducts.length > 0 ? 
            Math.round(analyzedProducts.reduce((sum, p) => sum + (p.votesCount || 0), 0) / analyzedProducts.length) : 0,
          topCategories: this.extractTopCategories(analyzedProducts),
          commonTargetUsers: this.extractCommonTargetUsers(analyzedProducts)
        },
        products: analyzedProducts
      };

      await fs.writeFile(filepath, JSON.stringify(dataToSave, null, 2));
      
      console.log(`Data saved successfully to: ${filename}`);
      
      // Also save a latest.json file for easy access
      const latestPath = path.join(this.dataDir, 'latest.json');
      await fs.writeFile(latestPath, JSON.stringify(dataToSave, null, 2));
      
      return {
        success: true,
        filename: filename,
        filepath: filepath,
        timestamp: dataToSave.metadata.timestamp,
        totalProducts: analyzedProducts.length
      };
      
    } catch (error) {
      console.error('Error saving analyzed data:', error);
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }

  // Extract top categories from products
  extractTopCategories(products) {
    const categoryCount = {};
    
    products.forEach(product => {
      if (product.topics && Array.isArray(product.topics)) {
        product.topics.forEach(topic => {
          const categoryName = topic.name || topic;
          categoryCount[categoryName] = (categoryCount[categoryName] || 0) + 1;
        });
      }
    });
    
    return Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));
  }

  // Extract common target users from analyses
  extractCommonTargetUsers(products) {
    const userDemographics = {};
    
    products.forEach(product => {
      if (product.analysis && product.analysis.targetUsers && Array.isArray(product.analysis.targetUsers)) {
        product.analysis.targetUsers.forEach(user => {
          const demographic = user.demographic;
          if (demographic) {
            userDemographics[demographic] = (userDemographics[demographic] || 0) + 1;
          }
        });
      }
    });
    
    return Object.entries(userDemographics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([demographic, count]) => ({ demographic, count }));
  }

  // Get all stored data files
  async getStoredData(req, res) {
    try {
      const files = await fs.readdir(this.dataDir);
      const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'access_token.json');
      
      const fileDetails = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filepath = path.join(this.dataDir, filename);
            const stats = await fs.stat(filepath);
            const content = await fs.readFile(filepath, 'utf8');
            const data = JSON.parse(content);
            
            return {
              filename,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              totalProducts: data.metadata?.totalProducts || 0,
              timestamp: data.metadata?.timestamp,
              summary: data.summary || {}
            };
          } catch (error) {
            console.error(`Error reading file ${filename}:`, error);
            return {
              filename,
              error: error.message
            };
          }
        })
      );
      
      // Sort by creation date, newest first
      fileDetails.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      res.json({
        success: true,
        totalFiles: fileDetails.length,
        files: fileDetails
      });
      
    } catch (error) {
      console.error('Error getting stored data:', error);
      res.status(500).json({
        error: 'Failed to retrieve stored data',
        message: error.message
      });
    }
  }

  // Get specific data file by filename
  async getDataByFilename(req, res) {
    try {
      const { filename } = req.params;
      
      // Security check: ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      
      const filepath = path.join(this.dataDir, filename);
      
      try {
        await fs.access(filepath);
      } catch (error) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const content = await fs.readFile(filepath, 'utf8');
      const data = JSON.parse(content);
      
      res.json({
        success: true,
        filename,
        data
      });
      
    } catch (error) {
      console.error(`Error reading file ${req.params.filename}:`, error);
      res.status(500).json({
        error: 'Failed to read file',
        message: error.message
      });
    }
  }

  // Get latest analysis data
  async getLatestData() {
    try {
      const latestPath = path.join(this.dataDir, 'latest.json');
      const content = await fs.readFile(latestPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // No data available
      }
      throw error;
    }
  }

  // Export data to CSV format
  async exportToCSV(filename) {
    try {
      const filepath = path.join(this.dataDir, filename);
      const content = await fs.readFile(filepath, 'utf8');
      const data = JSON.parse(content);
      
      if (!data.products || !Array.isArray(data.products)) {
        throw new Error('Invalid data format');
      }
      
      // Create CSV headers
      const headers = [
        'Product Name',
        'Tagline',
        'Votes Count',
        'Comments Count',
        'Website',
        'Topics',
        'Target Users',
        'Success Probability',
        'Market Fit',
        'Analysis Summary'
      ];
      
      // Create CSV rows
      const rows = data.products.map(product => [
        product.name || '',
        product.tagline || '',
        product.votesCount || 0,
        product.commentsCount || 0,
        product.website || '',
        product.topics?.map(t => t.name).join('; ') || '',
        product.analysis?.targetUsers?.map(u => u.demographic).join('; ') || '',
        product.analysis?.successProbability || '',
        product.analysis?.productAnalysis?.marketFit || '',
        product.analysis?.summary || ''
      ]);
      
      // Combine headers and rows
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      
      const csvFilename = filename.replace('.json', '.csv');
      const csvPath = path.join(this.dataDir, csvFilename);
      
      await fs.writeFile(csvPath, csvContent);
      
      return {
        success: true,
        csvFilename,
        csvPath
      };
      
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw error;
    }
  }

  // Clean up old data files (keep only last N files)
  async cleanupOldFiles(keepCount = 10) {
    try {
      const files = await fs.readdir(this.dataDir);
      const jsonFiles = files
        .filter(file => file.endsWith('.json') && file !== 'access_token.json' && file !== 'latest.json')
        .map(filename => ({
          filename,
          path: path.join(this.dataDir, filename)
        }));
      
      // Get file stats and sort by creation date
      const filesWithStats = await Promise.all(
        jsonFiles.map(async (file) => {
          const stats = await fs.stat(file.path);
          return { ...file, created: stats.birthtime };
        })
      );
      
      filesWithStats.sort((a, b) => b.created - a.created);
      
      // Delete files beyond the keep count
      const filesToDelete = filesWithStats.slice(keepCount);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        console.log(`Deleted old file: ${file.filename}`);
      }
      
      return {
        success: true,
        deletedCount: filesToDelete.length,
        remainingCount: filesWithStats.length - filesToDelete.length
      };
      
    } catch (error) {
      console.error('Error cleaning up old files:', error);
      throw error;
    }
  }
}

module.exports = new DataService();

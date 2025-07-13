// Product Hunt OAuth Authentication Service (Internal Use)
const { AuthorizationCode } = require('simple-oauth2');
const fs = require('fs').promises;
const path = require('path');

class AuthService {
  constructor() {
    // Check for developer token first (simpler approach)
    if (process.env.PH_DEVELOPER_TOKEN && process.env.PH_DEVELOPER_TOKEN !== 'your_developer_token') {
      console.log('Product Hunt Developer Token configured for internal use');
      this.developerToken = process.env.PH_DEVELOPER_TOKEN;
      this.client = null; // Don't need OAuth client with developer token
    } else if (process.env.PH_CLIENT_ID && process.env.PH_CLIENT_SECRET &&
        process.env.PH_CLIENT_ID !== 'your_product_hunt_client_id' &&
        process.env.PH_CLIENT_SECRET !== 'your_product_hunt_client_secret') {
      console.log('Product Hunt OAuth configured for internal use');
      this.client = new AuthorizationCode({
        client: {
          id: process.env.PH_CLIENT_ID,
          secret: process.env.PH_CLIENT_SECRET,
        },
        auth: {
          tokenHost: 'https://api.producthunt.com',
          tokenPath: '/v2/oauth/token',
          authorizePath: '/v2/oauth/authorize',
        },
      });
      this.developerToken = null;
    } else {
      console.warn('Product Hunt credentials not configured. Set PH_DEVELOPER_TOKEN or PH_CLIENT_ID/PH_CLIENT_SECRET environment variables.');
      this.client = null;
      this.developerToken = null;
    }

    this.tokenFile = path.join(__dirname, '..', 'data', 'access_token.json');
    this.redirectUri = process.env.REDIRECT_URL || 'http://localhost:3000/callback';
  }

  // Background authentication check (for internal monitoring)
  checkAuthStatus = async (req, res) => {
    try {
      // Check if we have any form of authentication
      const hasAuth = this.developerToken || this.client;

      if (!hasAuth) {
        return res.status(500).json({
          error: 'Product Hunt credentials not configured. Set PH_DEVELOPER_TOKEN or PH_CLIENT_ID/PH_CLIENT_SECRET environment variables.',
          configured: false,
          requiresSetup: true
        });
      }

      const isAuth = await this.isAuthenticated();
      const tokenInfo = await this.getTokenInfo();

      res.json({
        configured: true,
        authenticated: isAuth,
        tokenInfo: tokenInfo,
        authMethod: this.developerToken ? 'developer_token' : 'oauth',
        message: isAuth ? 'Authentication active' : 'Authentication required'
      });
    } catch (error) {
      console.error('Error checking auth status:', error);
      res.status(500).json({ error: 'Failed to check authentication status' });
    }
  };

  // Manual OAuth initiation (only for initial setup)
  initiateAuth = (req, res) => {
    try {
      if (!this.client) {
        return res.status(500).json({
          error: 'Product Hunt OAuth not configured.',
          configured: false
        });
      }

      const authorizationUri = this.client.authorizeURL({
        redirect_uri: this.redirectUri,
        scope: 'public private',
        state: 'internal-setup-' + Date.now(),
      });

      console.log('🔧 Initial OAuth setup - redirecting to Product Hunt...');
      res.redirect(authorizationUri);
    } catch (error) {
      console.error('Error in OAuth setup:', error);
      res.status(500).json({ error: 'Failed to initiate OAuth setup' });
    }
  };

  // Handle OAuth callback (internal team authentication)
  handleCallback = async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code) {
        return res.status(400).json({ error: 'Authorization code not provided' });
      }

      // Verify this is a legitimate setup request
      if (!state || !state.startsWith('internal-setup-')) {
        console.warn('⚠️  Unauthorized OAuth callback attempt');
        return res.status(403).json({
          error: 'Unauthorized access attempt'
        });
      }

      console.log('🔐 Processing internal team OAuth callback...');

      const tokenParams = {
        code,
        redirect_uri: this.redirectUri,
      };

      const accessToken = await this.client.getToken(tokenParams);

      // Store the token securely
      await this.storeToken(accessToken);

      console.log('✅ Internal team access token configured successfully');

      // Redirect to main app - authentication now works in background
      res.redirect('/?setup=complete');

    } catch (error) {
      console.error('Internal authentication error:', error.message);
      res.status(500).json({
        error: 'Internal authentication failed',
        message: error.message
      });
    }
  };

  // Store access token securely
  async storeToken(accessToken) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.tokenFile);
      try {
        await fs.access(dataDir);
      } catch (error) {
        await fs.mkdir(dataDir, { recursive: true });
      }

      const tokenData = {
        access_token: accessToken.token.access_token,
        refresh_token: accessToken.token.refresh_token,
        expires_at: accessToken.token.expires_at,
        token_type: accessToken.token.token_type,
        scope: accessToken.token.scope,
        created_at: new Date().toISOString()
      };

      await fs.writeFile(this.tokenFile, JSON.stringify(tokenData, null, 2));
      console.log('OAuth token stored successfully');
    } catch (error) {
      console.error('Error storing token:', error);
      throw error;
    }
  }

  // Get stored access token or developer token
  async getStoredToken() {
    // If we have a developer token, use it directly
    if (this.developerToken) {
      return this.developerToken;
    }

    // Otherwise, try to get OAuth token from file
    try {
      const tokenData = await fs.readFile(this.tokenFile, 'utf8');
      const token = JSON.parse(tokenData);

      // Check if token is expired
      if (token.expires_at && new Date(token.expires_at) <= new Date()) {
        console.log('Token expired, attempting to refresh...');
        return await this.refreshToken(token);
      }

      return token.access_token;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No stored OAuth token found');
        return null;
      }
      console.error('Error reading stored token:', error);
      return null;
    }
  }

  // Refresh access token
  async refreshToken(tokenData) {
    try {
      if (!this.client) {
        return null;
      }

      const accessToken = this.client.createToken({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at
      });

      if (accessToken.expired()) {
        const refreshedToken = await accessToken.refresh();
        await this.storeToken(refreshedToken);
        return refreshedToken.token.access_token;
      }

      return tokenData.access_token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }

  // Check if user is authenticated
  async isAuthenticated() {
    const token = await this.getStoredToken();
    return !!token;
  }

  // Get token info for status endpoint
  async getTokenInfo() {
    // If using developer token, return simple status
    if (this.developerToken) {
      return {
        hasToken: true,
        authMethod: 'developer_token',
        isExpired: false,
        configured: true
      };
    }

    // Otherwise check OAuth token file
    try {
      const tokenData = await fs.readFile(this.tokenFile, 'utf8');
      const token = JSON.parse(tokenData);

      return {
        hasToken: true,
        authMethod: 'oauth',
        scope: token.scope,
        expires_at: token.expires_at,
        created_at: token.created_at,
        isExpired: token.expires_at ? new Date(token.expires_at) <= new Date() : false,
        configured: !!this.client
      };
    } catch (error) {
      return {
        hasToken: false,
        authMethod: 'oauth',
        configured: !!this.client,
        error: error.code === 'ENOENT' ? 'No token stored' : error.message
      };
    }
  }
}

module.exports = new AuthService();

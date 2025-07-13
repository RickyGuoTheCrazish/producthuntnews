# Product Hunt Analyzer

**🔒 INTERNAL TEAM TOOL**

A Node.js + Express application for internal team use that fetches trending products from Product Hunt API, analyzes them with ChatGPT 4o for target user demographics, and displays results in real-time.

> ⚠️ **Important**: This tool is designed for internal team use only. It requires OAuth authentication and should not be deployed as a public service.

## Features

- 🔐 **Internal Team Authentication** with Product Hunt OAuth (team access only)
- 📊 **GraphQL Integration** to fetch trending products with vote counts
- 🤖 **Smart AI Analysis** with ChatGPT 4o-mini and fallback strategies
- ⚡ **Real-time Streaming** with Server-Sent Events (SSE)
- ⏱️ **Heroku Optimized** for 30-second timeout limits
- 🌐 **Progressive Web Interface** with live progress updates
- 🛡️ **Security Controls** for internal use only
- 📈 **Comprehensive Logging** and error handling
- 🚀 **Memory Efficient** - no persistent storage required

## Prerequisites

Before running this application, you need:

1. **Product Hunt OAuth Credentials**
   - Go to [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications)
   - Create a new application to get your Client ID and Secret
   - Set redirect URL to: `http://localhost:3000/callback` (or your domain + `/callback`)
   - This is for internal team use only

2. **OpenAI API Key**
   - Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Uses GPT-4o-mini for cost efficiency

3. **Node.js** (version 18 or higher)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd producthuntnews
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your credentials:
   ```env
   # Product Hunt OAuth Credentials (Internal Use)
   PH_CLIENT_ID=your_product_hunt_client_id
   PH_CLIENT_SECRET=your_product_hunt_client_secret

   # OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key

   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # OAuth Redirect URL (change for production)
   REDIRECT_URL=http://localhost:3000/callback

   # Session Secret (generate a random string for production)
   SESSION_SECRET=your_session_secret_here
   ```

## Usage

1. **Start the development server**
   ```bash
   npm run dev
   ```

2. **Access the application**
   - Open your browser and go to `http://localhost:3000`
   - Click "🔗 Connect to Product Hunt" to authenticate via OAuth
   - Once authenticated, click "🚀 Start Analysis" to begin processing

3. **View results**
   - Results stream in real-time on a dedicated results page
   - See live progress as each product is analyzed
   - Each analysis includes product details, vote counts, and AI-generated insights
   - No data is stored - everything is processed and displayed in real-time

## API Endpoints

- `GET /` - Web dashboard
- `GET /results.html` - Analysis results page with real-time streaming
- `GET /auth` - Check API configuration
- `GET /api/analyze-stream` - Server-Sent Events endpoint for real-time analysis
- `POST /api/quick-analyze` - Quick analysis endpoint (3 products for testing)
- `GET /api/status` - Server status with configuration info
- `GET /health` - Health check endpoint

## Data Structure

The application returns analysis results in the following structure:

```json
{
  "success": true,
  "message": "Successfully analyzed 20 products",
  "data": {
    "totalProducts": 20,
    "successCount": 18,
    "errorCount": 2,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "products": [
      {
        "id": "product_id",
        "name": "Product Name",
        "tagline": "Product tagline",
        "votesCount": 150,
        "commentsCount": 25,
        "website": "https://example.com",
        "topics": [...],
        "analysis": {
          "targetUsers": [
            {
              "demographic": "Tech Entrepreneurs",
              "description": "...",
              "characteristics": [...],
              "likelihood": "high"
            }
          ],
          "marketInsights": {...},
          "recommendations": {...},
          "successProbability": "high",
          "summary": "..."
        }
      }
    ]
  }
}
```

## Deployment to Heroku

1. **Create a Heroku app**
   ```bash
   heroku create your-app-name
   ```

2. **Set environment variables**
   ```bash
   heroku config:set PH_CLIENT_ID=your_client_id
   heroku config:set PH_CLIENT_SECRET=your_client_secret
   heroku config:set OPENAI_API_KEY=your_openai_key
   heroku config:set NODE_ENV=production
   heroku config:set REDIRECT_URL=https://your-app-name.herokuapp.com/callback
   heroku config:set SESSION_SECRET=your_random_session_secret
   ```

3. **Deploy**
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push heroku main
   ```

4. **Open your app**
   ```bash
   heroku open
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PH_CLIENT_ID` | Product Hunt API Client ID | Yes |
| `PH_CLIENT_SECRET` | Product Hunt API Client Secret | Yes |
| `OPENAI_API_KEY` | OpenAI API Key for ChatGPT | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `REDIRECT_URL` | OAuth redirect URL | Yes |
| `SESSION_SECRET` | Session secret for security | Yes |

## Rate Limits

- **Product Hunt API**: Respects API rate limits with retry logic
- **OpenAI API**: 1-second delay between requests to avoid rate limits
- **Server**: 100 requests per 15 minutes per IP

## Logging

- All requests and errors are logged
- Log files are stored in `logs/` directory
- Automatic cleanup of logs older than 30 days
- Console logging in development mode

## Error Handling

- Comprehensive error handling for all API calls
- Graceful degradation when services are unavailable
- Detailed error logging for debugging
- User-friendly error messages in the web interface

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the logs in the `logs/` directory
2. Verify your API credentials are correct
3. Ensure all environment variables are set
4. Check the console for error messages

## Troubleshooting

**Authentication Issues:**
- Verify your Product Hunt API credentials
- Check that the redirect URL matches your environment
- Ensure you have the correct scopes (public, private)

**Analysis Failures:**
- Verify your OpenAI API key is valid
- Check your OpenAI account has sufficient credits
- Monitor rate limits in the logs

**Deployment Issues:**
- Ensure all environment variables are set on Heroku
- Check Heroku logs: `heroku logs --tail`
- Verify your Procfile is correct

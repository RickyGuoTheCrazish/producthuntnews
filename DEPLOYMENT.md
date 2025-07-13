# Deployment Guide

This guide will help you deploy the Product Hunt Analyzer to Heroku.

## Prerequisites

1. **Heroku CLI** installed on your machine
2. **Git** repository initialized
3. **API Credentials** ready:
   - Product Hunt OAuth Client ID and Secret (for internal use)
   - OpenAI API Key

## Step-by-Step Deployment

### 1. Prepare Your Local Environment

```bash
# Ensure you're in the project directory
cd producthuntnews

# Install dependencies
npm install

# Test locally first
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### 2. Login to Heroku

```bash
heroku login
```

### 3. Create Heroku Application

```bash
# Create a new Heroku app (replace 'your-app-name' with your desired name)
heroku create your-app-name

# Or if you want Heroku to generate a name
heroku create
```

### 4. Set Environment Variables

```bash
# Required variables
heroku config:set PH_CLIENT_ID=your_product_hunt_client_id
heroku config:set PH_CLIENT_SECRET=your_product_hunt_client_secret
heroku config:set OPENAI_API_KEY=your_openai_api_key

# Production configuration
heroku config:set NODE_ENV=production
heroku config:set REDIRECT_URL=https://your-app-name.herokuapp.com/callback

# Generate a random session secret (use a password generator)
heroku config:set SESSION_SECRET=your_random_session_secret_here
```

### 5. Configure Product Hunt OAuth

1. Go to [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications)
2. Edit your application
3. Update the redirect URL to: `https://your-app-name.herokuapp.com/callback`
4. Ensure the scopes include: `public` and `private`
5. Save the changes

**Important**: The redirect URL must exactly match what you set in `REDIRECT_URL` environment variable.

### 6. Deploy to Heroku

```bash
# Add all files to git
git add .

# Commit changes
git commit -m "Initial deployment to Heroku"

# Deploy to Heroku
git push heroku main
```

### 7. Open Your Application

```bash
heroku open
```

## Post-Deployment Steps

### 1. Test the Application

1. Visit your Heroku app URL
2. Click "Authenticate with Product Hunt"
3. Complete the OAuth flow
4. Try running an analysis

### 2. Monitor Logs

```bash
# View real-time logs
heroku logs --tail

# View recent logs
heroku logs

# View logs for specific component
heroku logs --source app
```

### 3. Check Application Status

```bash
# Check dyno status
heroku ps

# Check configuration
heroku config
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `PH_CLIENT_ID` | Product Hunt API Client ID | `abc123def456` |
| `PH_CLIENT_SECRET` | Product Hunt API Client Secret | `secret123` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `NODE_ENV` | Environment mode | `production` |
| `REDIRECT_URL` | OAuth redirect URL | `https://yourapp.herokuapp.com/callback` |
| `SESSION_SECRET` | Session security secret | `random-string-here` |

## Troubleshooting

### Common Issues

**1. Application Error (H10)**
- Check that all environment variables are set
- Verify your Procfile is correct
- Check logs: `heroku logs --tail`

**2. OAuth Redirect Mismatch**
- Ensure REDIRECT_URL matches your Heroku app URL
- Update Product Hunt app settings with correct callback URL

**3. API Rate Limits**
- Monitor logs for rate limit errors
- Consider implementing longer delays between requests

**4. Memory Issues**
- Monitor memory usage in logs
- Consider upgrading to a larger dyno if needed

### Useful Commands

```bash
# Restart the application
heroku restart

# Scale dynos
heroku ps:scale web=1

# Access Heroku bash
heroku run bash

# View environment variables
heroku config

# Set a new environment variable
heroku config:set VARIABLE_NAME=value

# Remove an environment variable
heroku config:unset VARIABLE_NAME
```

### Logs and Monitoring

```bash
# View application logs
heroku logs --tail

# View only error logs
heroku logs --tail | grep ERROR

# View logs from specific time
heroku logs --since="2024-01-01 00:00"
```

## Updating the Application

```bash
# Make your changes locally
git add .
git commit -m "Your update message"

# Deploy updates
git push heroku main

# Check deployment status
heroku ps
```

## Scaling

```bash
# Scale to multiple dynos (requires paid plan)
heroku ps:scale web=2

# Scale back to one dyno
heroku ps:scale web=1
```

## Database (Optional)

If you want to add a database later:

```bash
# Add Heroku Postgres
heroku addons:create heroku-postgresql:hobby-dev

# Get database URL
heroku config:get DATABASE_URL
```

## Custom Domain (Optional)

```bash
# Add custom domain
heroku domains:add yourdomain.com

# Get DNS target
heroku domains
```

## Backup and Recovery

```bash
# Create a backup of your app
heroku apps:create your-app-backup
git push heroku-backup main

# Download application files
heroku run tar -czf backup.tar.gz data/ logs/
```

## Security Considerations

1. **Environment Variables**: Never commit API keys to git
2. **HTTPS**: Heroku provides HTTPS by default
3. **Rate Limiting**: Built-in rate limiting protects against abuse
4. **Session Security**: Use a strong, random session secret
5. **CORS**: Configure CORS appropriately for your use case

## Performance Optimization

1. **Caching**: Consider adding Redis for caching
2. **CDN**: Use Heroku's CDN for static assets
3. **Monitoring**: Add application monitoring (New Relic, etc.)
4. **Logging**: Use structured logging for better debugging

## Support

If you encounter issues:

1. Check the application logs: `heroku logs --tail`
2. Verify all environment variables are set correctly
3. Test the OAuth flow manually
4. Check Product Hunt API status
5. Verify OpenAI API key and credits

For Heroku-specific issues, consult the [Heroku Dev Center](https://devcenter.heroku.com/).

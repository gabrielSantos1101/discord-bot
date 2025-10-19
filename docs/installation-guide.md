# Installation and Configuration Guide

## Prerequisites

Before installing the Discord Bot API, ensure you have the following:

- **Node.js**: Version 18.0.0 or higher
- **npm**: Comes with Node.js
- **Discord Bot Token**: From Discord Developer Portal
- **Redis** (optional): For caching functionality
- **Git**: For cloning the repository

## System Requirements

### Minimum Requirements
- **RAM**: 512MB
- **CPU**: 1 core
- **Storage**: 1GB free space
- **Network**: Stable internet connection

### Recommended Requirements
- **RAM**: 2GB or more
- **CPU**: 2 cores or more
- **Storage**: 5GB free space
- **Redis**: Dedicated Redis instance

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/discord-bot-api.git
cd discord-bot-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give your application a name
4. Go to "Bot" section
5. Click "Add Bot"
6. Copy the bot token (keep it secure!)
7. Enable necessary intents:
   - **Presence Intent**: Required for user status/activity
   - **Server Members Intent**: Required for user data access
   - **Message Content Intent**: Required for commands

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# API Configuration
API_PORT=3000
API_HOST=localhost
CORS_ORIGIN=http://localhost:3000

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
CACHE_TTL=60

# Database Configuration
DATABASE_PATH=./data/discord-bot.db

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/discord-bot.log

# Auto Channel Configuration
AUTO_CHANNEL_EMPTY_TIMEOUT=5
AUTO_CHANNEL_MAX_PER_TEMPLATE=10

# Environment
NODE_ENV=production
```

### 5. Set Up Redis (Optional but Recommended)

#### Using Docker:
```bash
docker run -d --name redis-discord-bot -p 6379:6379 redis:alpine
```

#### Using Package Manager:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Windows:**
Download and install from [Redis Windows releases](https://github.com/microsoftarchive/redis/releases)

### 6. Build the Project

```bash
npm run build
```

### 7. Start the Application

```bash
npm start
```

For development with hot reload:
```bash
npm run dev
```

## Configuration Details

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | - | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | - | Discord application client ID |
| `API_PORT` | No | 3000 | Port for REST API |
| `API_HOST` | No | localhost | Host for REST API |
| `CORS_ORIGIN` | No | * | CORS allowed origins |
| `REDIS_URL` | No | - | Redis connection URL |
| `REDIS_HOST` | No | localhost | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password |
| `REDIS_DB` | No | 0 | Redis database number |
| `CACHE_ENABLED` | No | true | Enable/disable caching |
| `CACHE_TTL` | No | 60 | Default cache TTL in seconds |
| `SKIP_REDIS` | No | false | Skip Redis connection entirely |
| `DATABASE_PATH` | No | ./data/discord-bot.db | SQLite database path |
| `RATE_LIMIT_WINDOW_MS` | No | 60000 | Rate limit window in ms |
| `RATE_LIMIT_MAX_REQUESTS` | No | 100 | Max requests per window |
| `LOG_LEVEL` | No | info | Logging level |
| `LOG_FILE` | No | ./logs/discord-bot.log | Log file path |
| `AUTO_CHANNEL_EMPTY_TIMEOUT` | No | 5 | Minutes before deleting empty channels |
| `AUTO_CHANNEL_MAX_PER_TEMPLATE` | No | 10 | Max auto channels per template |
| `NODE_ENV` | No | development | Environment mode |

### Discord Bot Permissions

Your bot needs the following permissions in Discord servers:

#### Required Permissions:
- **View Channels**: To see channels
- **Connect**: To join voice channels
- **Manage Channels**: To create/delete auto channels
- **Move Members**: To move users to auto channels
- **Read Message History**: For command processing

#### Permission Integer: `17179869184`

#### Invite URL Template:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=17179869184&scope=bot
```

Replace `YOUR_CLIENT_ID` with your actual Discord application client ID.

### Redis Configuration Options

#### Basic Configuration:
```bash
# Simple Redis URL
REDIS_URL=redis://localhost:6379

# With password
REDIS_URL=redis://:password@localhost:6379

# With database selection
REDIS_URL=redis://localhost:6379/1
```

#### Advanced Configuration:
```bash
# Individual settings (takes precedence over REDIS_URL)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# Connection options
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_RETRY_DELAY_ON_FAILURE=100
```

#### Disable Redis:
```bash
# Disable caching entirely
CACHE_ENABLED=false

# Or skip Redis connection (for development)
SKIP_REDIS=true
```

## Deployment Options

### 1. Traditional Server Deployment

#### Using PM2 (Recommended):

Install PM2:
```bash
npm install -g pm2
```

Create ecosystem file (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'discord-bot-api',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

Deploy:
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Using systemd:

Create service file (`/etc/systemd/system/discord-bot-api.service`):
```ini
[Unit]
Description=Discord Bot API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/discord-bot-api
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable discord-bot-api
sudo systemctl start discord-bot-api
```

### 2. Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  discord-bot:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    env_file:
      - .env
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

Deploy:
```bash
docker-compose up -d
```

### 3. Cloud Deployment

#### Heroku:

1. Install Heroku CLI
2. Create Heroku app:
   ```bash
   heroku create your-app-name
   ```
3. Add Redis addon:
   ```bash
   heroku addons:create heroku-redis:hobby-dev
   ```
4. Set environment variables:
   ```bash
   heroku config:set DISCORD_BOT_TOKEN=your_token
   heroku config:set NODE_ENV=production
   ```
5. Deploy:
   ```bash
   git push heroku main
   ```

#### Railway:

1. Connect your GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

#### DigitalOcean App Platform:

1. Create new app from GitHub repository
2. Configure environment variables
3. Add Redis database component
4. Deploy

## Verification

### 1. Check Application Status

```bash
# Check if the application is running
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "services": {
    "discord": "connected",
    "cache": "available",
    "database": "connected"
  }
}
```

### 2. Test API Endpoints

```bash
# Test user status endpoint (replace with actual user ID)
curl http://localhost:3000/api/users/123456789012345678/status
```

### 3. Check Logs

```bash
# View application logs
tail -f logs/discord-bot.log

# Or if using PM2
pm2 logs discord-bot-api
```

### 4. Verify Discord Bot

1. Invite bot to your Discord server
2. Check if bot appears online
3. Test auto channel functionality by joining a template channel

## Troubleshooting

### Common Issues

#### Bot Not Connecting to Discord:
- Verify `DISCORD_BOT_TOKEN` is correct
- Check if bot has necessary intents enabled
- Ensure bot is invited to the server with correct permissions

#### Redis Connection Failed:
- Verify Redis is running: `redis-cli ping`
- Check Redis connection settings in `.env`
- Set `SKIP_REDIS=true` for development without Redis

#### API Not Responding:
- Check if port is available: `netstat -tulpn | grep 3000`
- Verify firewall settings
- Check application logs for errors

#### Permission Errors:
- Ensure bot has required permissions in Discord server
- Check file system permissions for log and data directories
- Verify user permissions for the application process

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

### Health Monitoring

The application provides several monitoring endpoints:

```bash
# Overall health
curl http://localhost:3000/health

# Detailed metrics
curl http://localhost:3000/metrics

# Cache statistics
curl http://localhost:3000/cache/stats
```

## Security Considerations

### Environment Variables
- Never commit `.env` file to version control
- Use secure methods to store production secrets
- Rotate bot tokens regularly

### Network Security
- Use HTTPS in production
- Configure proper CORS origins
- Implement rate limiting
- Use firewall to restrict access

### Bot Security
- Use minimal required permissions
- Monitor bot activity logs
- Implement proper error handling to avoid information leakage

## Performance Optimization

### Caching Strategy
- Enable Redis for better performance
- Adjust TTL values based on your needs
- Monitor cache hit rates

### Resource Management
- Set appropriate memory limits
- Monitor CPU usage
- Use clustering for high-traffic scenarios

### Database Optimization
- Regular database maintenance
- Monitor database size
- Implement proper indexing

## Support

For issues and questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review application logs
3. Check Discord API status
4. Create an issue on GitHub repository

## Next Steps

After successful installation:

1. Read the [API Documentation](./api-documentation.md)
2. Check [Configuration Examples](./configuration-examples.md)
3. Set up monitoring and logging
4. Configure auto channels for your server
5. Test all API endpoints
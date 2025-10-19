# Configuration Examples

This document provides configuration examples for different deployment scenarios and use cases.

## Basic Configurations

### Development Environment

Perfect for local development and testing:

```bash
# .env for development
NODE_ENV=development
DISCORD_BOT_TOKEN=your_dev_bot_token
DISCORD_CLIENT_ID=your_client_id

# API Configuration
API_PORT=3000
API_HOST=localhost
CORS_ORIGIN=*

# Skip Redis for simple development
SKIP_REDIS=true
CACHE_ENABLED=false

# Database
DATABASE_PATH=./data/dev-bot-config.db

# Logging
LOG_LEVEL=debug
LOG_FILE=./logs/dev.log

# Relaxed rate limiting for testing
RATE_LIMIT_MAX_REQUESTS=1000
```

### Production Environment

Optimized for production deployment:

```bash
# .env for production
NODE_ENV=production
DISCORD_BOT_TOKEN=your_production_bot_token
DISCORD_CLIENT_ID=your_client_id

# API Configuration
API_PORT=3000
API_HOST=0.0.0.0
CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com

# Redis Configuration
REDIS_URL=redis://redis-server:6379
CACHE_ENABLED=true
CACHE_TTL=60

# Database
DATABASE_PATH=/app/data/bot-config.db

# Security
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/production.log

# Auto Channel Settings
AUTO_CHANNEL_EMPTY_TIMEOUT=5
AUTO_CHANNEL_MAX_PER_TEMPLATE=10
```

## Deployment-Specific Configurations

### Docker Configuration

#### docker-compose.yml
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
      - DATABASE_PATH=/app/data/bot-config.db
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    depends_on:
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  redis_data:
```

#### .env.production for Docker
```bash
NODE_ENV=production
DISCORD_BOT_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id

# Docker-specific settings
API_HOST=0.0.0.0
REDIS_HOST=redis
REDIS_PORT=6379

# Production settings
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

### Heroku Configuration

#### Procfile
```
web: npm start
```

#### Heroku Environment Variables
```bash
# Set via Heroku CLI or Dashboard
heroku config:set NODE_ENV=production
heroku config:set DISCORD_BOT_TOKEN=your_token
heroku config:set DISCORD_CLIENT_ID=your_client_id
heroku config:set API_PORT=$PORT
heroku config:set API_HOST=0.0.0.0
heroku config:set CORS_ORIGIN=*
heroku config:set LOG_LEVEL=info

# Redis addon provides REDIS_URL automatically
# heroku addons:create heroku-redis:hobby-dev
```

### Railway Configuration

#### railway.toml
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[environments.production.variables]
NODE_ENV = "production"
LOG_LEVEL = "info"
API_HOST = "0.0.0.0"
```

## Server-Specific Configurations

### Gaming Community Server

Configuration for a gaming-focused Discord server:

```json
{
  "serverId": "123456789012345678",
  "autoChannels": [
    {
      "templateChannelId": "111111111111111111",
      "namePattern": "🎮 Gaming-{number}",
      "maxChannels": 15,
      "emptyTimeout": 3,
      "permissions": [
        {
          "id": "222222222222222222",
          "type": "role",
          "allow": ["VIEW_CHANNEL", "CONNECT", "SPEAK"]
        }
      ]
    },
    {
      "templateChannelId": "333333333333333333",
      "namePattern": "🎵 Music-{number}",
      "maxChannels": 5,
      "emptyTimeout": 10,
      "permissions": [
        {
          "id": "444444444444444444",
          "type": "role",
          "allow": ["VIEW_CHANNEL", "CONNECT"]
        }
      ]
    }
  ],
  "commandPrefix": "!",
  "apiAccess": {
    "enabled": true,
    "allowedEndpoints": ["status", "activity", "presence"],
    "rateLimit": 200
  },
  "logging": {
    "level": "info",
    "channels": ["555555555555555555"]
  }
}
```

### Development/Study Server

Configuration for a coding/study community:

```json
{
  "serverId": "987654321098765432",
  "autoChannels": [
    {
      "templateChannelId": "666666666666666666",
      "namePattern": "💻 Code-{number}",
      "maxChannels": 8,
      "emptyTimeout": 15,
      "permissions": [
        {
          "id": "777777777777777777",
          "type": "role",
          "allow": ["VIEW_CHANNEL", "CONNECT", "SPEAK", "USE_VAD"]
        }
      ]
    },
    {
      "templateChannelId": "888888888888888888",
      "namePattern": "📚 Study-{number}",
      "maxChannels": 12,
      "emptyTimeout": 30,
      "permissions": [
        {
          "id": "@everyone",
          "type": "role",
          "allow": ["VIEW_CHANNEL", "CONNECT"]
        }
      ]
    }
  ],
  "commandPrefix": ".",
  "apiAccess": {
    "enabled": true,
    "allowedEndpoints": ["status", "activity", "presence"],
    "rateLimit": 150
  }
}
```

### Small Private Server

Configuration for a small friend group:

```json
{
  "serverId": "456789012345678901",
  "autoChannels": [
    {
      "templateChannelId": "999999999999999999",
      "namePattern": "Hangout-{number}",
      "maxChannels": 3,
      "emptyTimeout": 5,
      "permissions": [
        {
          "id": "@everyone",
          "type": "role",
          "allow": ["VIEW_CHANNEL", "CONNECT", "SPEAK", "USE_VAD"]
        }
      ]
    }
  ],
  "commandPrefix": "?",
  "apiAccess": {
    "enabled": false,
    "allowedEndpoints": [],
    "rateLimit": 50
  }
}
```

## High-Availability Configurations

### Load Balanced Setup

#### nginx.conf
```nginx
upstream discord_bot_api {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://discord_bot_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
    
    location /health {
        proxy_pass http://discord_bot_api;
        access_log off;
    }
}

# Rate limiting zone
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
```

#### PM2 Cluster Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'discord-bot-api',
    script: 'dist/index.js',
    instances: 3,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      API_PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      API_PORT: 3000,
      REDIS_URL: 'redis://redis-cluster:6379'
    }
  }]
};
```

### Redis Cluster Configuration

#### Redis Sentinel Setup
```bash
# redis-sentinel.conf
port 26379
sentinel monitor discord-bot-redis 127.0.0.1 6379 2
sentinel down-after-milliseconds discord-bot-redis 5000
sentinel failover-timeout discord-bot-redis 10000
sentinel parallel-syncs discord-bot-redis 1
```

#### Application Configuration for Sentinel
```bash
# .env for Redis Sentinel
REDIS_SENTINELS=127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381
REDIS_MASTER_NAME=discord-bot-redis
REDIS_PASSWORD=your_redis_password
```

## Monitoring Configurations

### Prometheus Metrics

#### prometheus.yml
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'discord-bot-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "Discord Bot API Metrics",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "http_request_duration_seconds{job=\"discord-bot-api\"}",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "cache_hit_rate{job=\"discord-bot-api\"}",
            "legendFormat": "Hit Rate %"
          }
        ]
      },
      {
        "title": "Active Auto Channels",
        "type": "graph",
        "targets": [
          {
            "expr": "auto_channels_active{job=\"discord-bot-api\"}",
            "legendFormat": "Active Channels"
          }
        ]
      }
    ]
  }
}
```

## Security Configurations

### Reverse Proxy with SSL

#### nginx SSL Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### Environment-Specific Security

#### Production Security Settings
```bash
# Enhanced security for production
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Disable debug features
LOG_LEVEL=warn
DEBUG_MODE=false

# Secure headers
HELMET_ENABLED=true
TRUST_PROXY=true
```

## Performance Tuning

### High-Traffic Configuration

```bash
# .env for high-traffic scenarios
NODE_ENV=production

# Increased limits
RATE_LIMIT_MAX_REQUESTS=500
RATE_LIMIT_WINDOW_MS=60000

# Optimized caching
CACHE_ENABLED=true
CACHE_TTL=30
REDIS_POOL_SIZE=20

# Database optimization
DATABASE_POOL_SIZE=10
DATABASE_TIMEOUT=5000

# Auto channel optimization
AUTO_CHANNEL_MAX_PER_TEMPLATE=20
AUTO_CHANNEL_EMPTY_TIMEOUT=2

# Logging optimization
LOG_LEVEL=error
LOG_ROTATION=daily
```

### Memory-Constrained Environment

```bash
# .env for limited memory environments
NODE_ENV=production

# Reduced caching
CACHE_TTL=30
REDIS_MAX_MEMORY=100mb

# Limited auto channels
AUTO_CHANNEL_MAX_PER_TEMPLATE=5

# Minimal logging
LOG_LEVEL=error
LOG_FILE_MAX_SIZE=10mb
LOG_MAX_FILES=3

# Reduced rate limits
RATE_LIMIT_MAX_REQUESTS=50
```

## Testing Configurations

### Unit Testing Environment

```bash
# .env.test
NODE_ENV=test
DISCORD_BOT_TOKEN=test_token
DISCORD_CLIENT_ID=test_client_id

# Test database
DATABASE_PATH=:memory:

# Disable external services
SKIP_REDIS=true
CACHE_ENABLED=false

# Test-specific settings
LOG_LEVEL=silent
API_PORT=0
```

### Integration Testing

```bash
# .env.integration
NODE_ENV=test
DISCORD_BOT_TOKEN=integration_test_token
DISCORD_CLIENT_ID=integration_test_client_id

# Test Redis instance
REDIS_URL=redis://localhost:6380
REDIS_DB=15

# Test database
DATABASE_PATH=./data/integration-test.db

# Integration test settings
LOG_LEVEL=debug
API_PORT=3001
RATE_LIMIT_MAX_REQUESTS=1000
```

## Backup and Recovery

### Database Backup Configuration

```bash
#!/bin/bash
# backup-script.sh

# Environment variables
DB_PATH="./data/bot-config.db"
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
mkdir -p $BACKUP_DIR
cp $DB_PATH "$BACKUP_DIR/bot-config_$DATE.db"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "bot-config_*.db" -mtime +7 -delete

echo "Backup completed: bot-config_$DATE.db"
```

### Redis Backup Configuration

```bash
# redis.conf additions for backup
save 900 1
save 300 10
save 60 10000

# Enable AOF for better durability
appendonly yes
appendfsync everysec
```

This comprehensive configuration guide covers various deployment scenarios and use cases. Choose the configuration that best matches your environment and requirements.
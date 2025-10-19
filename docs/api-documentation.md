# API Documentation

## Overview

The Discord Bot API provides REST endpoints to access Discord user information in real-time, including status, activities, and Rich Presence data. The API features intelligent caching for optimal performance and comprehensive monitoring capabilities. Data is sourced from Discord's official API with cache-first optimization.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API does not require authentication. Rate limiting is applied per IP address.

## Rate Limiting

- **Limit**: 100 requests per minute per IP address
- **Headers**: Rate limit information is included in response headers:
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Time when the rate limit resets

## Performance Features

### Intelligent Caching
- **Cache-First Strategy**: All endpoints prioritize cached data for faster responses
- **Automatic Fallback**: Seamless fallback to Discord API when cache is unavailable
- **Real-time Updates**: Cache is updated in real-time via Discord presence events
- **Cache Indicators**: API responses include `fromCache` field to indicate data source

### Monitoring & Metrics
- **Real-time Metrics**: Comprehensive performance monitoring
- **Alert System**: Configurable alerts for system health
- **Performance Tracking**: Response times, cache hit rates, error rates
- **Health Monitoring**: System resource usage and connection status

## Endpoints

### User Status

#### GET /api/users/{userId}/status

Returns the current online status of a Discord user.

**Parameters:**
- `userId` (string, required): Discord user ID

**Response:**
```json
{
  "data": {
    "userId": "123456789012345678",
    "status": "online",
    "activities": [
      {
        "type": "playing",
        "name": "Visual Studio Code"
      }
    ],
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "inVoiceChannel": false,
    "fromCache": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_123456789",
  "success": true
}
```

**Status Values:**
- `online`: User is online
- `idle`: User is away/idle
- `dnd`: User is in Do Not Disturb mode
- `offline`: User is offline or invisible

**Example:**
```bash
curl -X GET "http://localhost:3000/api/users/123456789012345678/status"
```

### User Activity

#### GET /api/users/{userId}/activity

Returns current activities of a Discord user (games, music, etc.).

**Parameters:**
- `userId` (string, required): Discord user ID

**Response:**
```json
{
  "data": {
    "userId": "123456789012345678",
    "activities": [
      {
        "type": "playing",
        "name": "Visual Studio Code",
        "details": "Editing discord-bot.ts",
        "state": "Working on Discord Bot",
        "timestamps": {
          "start": 1642248600000
        }
      },
      {
        "type": "listening",
        "name": "Spotify",
        "details": "Song Title",
        "state": "by Artist Name",
        "timestamps": {
          "start": 1642248600000,
          "end": 1642248900000
        }
      }
    ],
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "fromCache": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_123456789",
  "success": true
}
```

**Activity Types:**
- `playing`: Playing a game or using an application
- `listening`: Listening to music (Spotify, etc.)
- `watching`: Watching something
- `custom`: Custom status message

**Example:**
```bash
curl -X GET "http://localhost:3000/api/users/123456789012345678/activity"
```

### User Presence

#### GET /api/users/{userId}/presence

Returns complete presence information including Rich Presence data.

**Parameters:**
- `userId` (string, required): Discord user ID

**Response:**
```json
{
  "data": {
    "userId": "123456789012345678",
    "currentActivity": {
      "type": "playing",
      "name": "Visual Studio Code",
      "details": "Editing discord-bot.ts",
      "state": "Working on Discord Bot",
      "timestamps": {
        "start": 1642248600000
      }
    },
    "richPresence": {
      "details": "Editing discord-bot.ts",
      "state": "Working on Discord Bot"
    },
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "fromCache": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_123456789",
  "success": true
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/users/123456789012345678/presence"
```

### Auto Channels

#### GET /api/channels/auto/{templateId}

Returns information about auto-generated channels for a template.

**Parameters:**
- `templateId` (string, required): Template channel ID

**Response:**
```json
{
  "templateId": "987654321098765432",
  "activeChannels": [
    {
      "id": "111111111111111111",
      "name": "Gaming-1",
      "userCount": 3,
      "createdAt": "2024-01-15T10:25:00.000Z"
    },
    {
      "id": "222222222222222222",
      "name": "Gaming-2",
      "userCount": 1,
      "createdAt": "2024-01-15T10:28:00.000Z"
    }
  ],
  "maxChannels": 10,
  "emptyTimeout": 5
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/channels/auto/987654321098765432"
```

### Server Configuration

#### POST /api/config/server/{serverId}

Updates server configuration for auto channels.

**Parameters:**
- `serverId` (string, required): Discord server ID

**Request Body:**
```json
{
  "autoChannels": [
    {
      "templateChannelId": "987654321098765432",
      "namePattern": "Gaming-{number}",
      "maxChannels": 10,
      "emptyTimeout": 5,
      "permissions": [
        {
          "id": "123456789012345678",
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
    "rateLimit": 100
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server configuration updated successfully",
  "serverId": "555555555555555555"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/config/server/555555555555555555" \
  -H "Content-Type: application/json" \
  -d '{"autoChannels": [{"templateChannelId": "987654321098765432", "namePattern": "Gaming-{number}", "maxChannels": 10, "emptyTimeout": 5}]}'
```

### Metrics & Monitoring

#### GET /api/metrics

Returns comprehensive metrics dashboard with performance data.

**Response:**
```json
{
  "success": true,
  "data": {
    "presence": {
      "eventsProcessed": 1250,
      "eventsPerMinute": 15,
      "cacheHits": 980,
      "cacheMisses": 270,
      "cacheHitRate": 78,
      "errorCount": 5,
      "errorRate": 0.4,
      "averageProcessingTime": 45,
      "lastEventTime": "2024-01-15T10:30:00.000Z",
      "activeUsers": 150,
      "debounceQueueSize": 3
    },
    "api": {
      "totalRequests": 5420,
      "requestsPerMinute": 25,
      "successfulRequests": 5380,
      "failedRequests": 40,
      "successRate": 99.3,
      "averageResponseTime": 180,
      "cacheServedRequests": 4200,
      "apiServedRequests": 1220,
      "cacheUtilizationRate": 77.5
    },
    "system": {
      "uptime": 86400,
      "memoryUsage": {
        "heapUsed": 45678912,
        "heapTotal": 67108864,
        "external": 1234567
      },
      "discordConnected": true,
      "cacheConnected": true,
      "databaseConnected": true,
      "guildsCount": 5,
      "usersCount": 1250
    },
    "alerts": [],
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### GET /api/metrics/presence

Returns presence-specific metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "eventsProcessed": 1250,
    "eventsPerMinute": 15,
    "cacheHits": 980,
    "cacheMisses": 270,
    "cacheHitRate": 78,
    "errorCount": 5,
    "errorRate": 0.4,
    "averageProcessingTime": 45,
    "lastEventTime": "2024-01-15T10:30:00.000Z",
    "activeUsers": 150,
    "debounceQueueSize": 3
  }
}
```

#### GET /api/metrics/api

Returns API performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRequests": 5420,
    "requestsPerMinute": 25,
    "successfulRequests": 5380,
    "failedRequests": 40,
    "successRate": 99.3,
    "averageResponseTime": 180,
    "cacheServedRequests": 4200,
    "apiServedRequests": 1220,
    "cacheUtilizationRate": 77.5
  }
}
```

#### GET /api/metrics/system

Returns system health metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "uptime": 86400,
    "memoryUsage": {
      "heapUsed": 45678912,
      "heapTotal": 67108864,
      "external": 1234567
    },
    "cpuUsage": {
      "user": 123456,
      "system": 78901
    },
    "discordConnected": true,
    "cacheConnected": true,
    "databaseConnected": true,
    "guildsCount": 5,
    "usersCount": 1250
  }
}
```

#### GET /api/metrics/health

Returns health status based on metrics analysis.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "issues": [],
    "metrics": {
      "presence": { /* presence metrics */ },
      "api": { /* api metrics */ },
      "system": { /* system metrics */ }
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Health Status Values:**
- `healthy`: All systems operating normally
- `degraded`: Some performance issues detected
- `unhealthy`: Critical issues requiring attention

#### POST /api/metrics/reset

Resets all metrics counters (admin operation).

**Response:**
```json
{
  "success": true,
  "message": "Metrics reset successfully"
}
```

#### PUT /api/metrics/alerts

Updates alert configuration thresholds.

**Request Body:**
```json
{
  "errorRateThreshold": 5,
  "responseTimeThreshold": 2000,
  "cacheHitRateThreshold": 80,
  "memoryUsageThreshold": 85,
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Alert configuration updated successfully",
  "data": {
    "errorRateThreshold": 5,
    "responseTimeThreshold": 2000,
    "cacheHitRateThreshold": 80,
    "memoryUsageThreshold": 85,
    "enabled": true
  }
}
```

### Diagnostics

#### GET /api/diagnostics

Runs comprehensive diagnostic checks and returns detailed report.

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "checks": [
      {
        "name": "Discord Connection",
        "status": "pass",
        "details": "Connected to Discord Gateway"
      },
      {
        "name": "Cache Service",
        "status": "pass",
        "details": "Redis cache operational"
      },
      {
        "name": "Presence Events",
        "status": "pass",
        "details": "Processing events normally"
      }
    ],
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/metrics"
curl -X GET "http://localhost:3000/api/metrics/health"
curl -X GET "http://localhost:3000/api/diagnostics"
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found or not accessible",
    "details": "The specified user ID does not exist or the bot cannot access this user",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_123456789"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `USER_NOT_FOUND` | 404 | User ID not found or not accessible |
| `INVALID_USER_ID` | 400 | Invalid user ID format |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `DISCORD_API_ERROR` | 502 | Discord API is unavailable |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `INVALID_REQUEST` | 400 | Invalid request format |
| `CHANNEL_NOT_FOUND` | 404 | Channel not found |
| `INSUFFICIENT_PERMISSIONS` | 403 | Bot lacks required permissions |
| `CACHE_UNAVAILABLE` | 503 | Cache service temporarily unavailable |
| `SERVICE_UNAVAILABLE` | 503 | Required service is unavailable |
| `INVALID_RESPONSE_DATA` | 500 | Invalid data received from Discord API |

## Response Times

- **Target**: < 2 seconds for all endpoints
- **Cache Hit**: 50-200ms (typical performance)
- **Cache Miss**: 500ms-2 seconds (Discord API fallback)
- **Monitoring**: Real-time response time tracking available via `/api/metrics`

## Data Freshness

- **Presence Events**: Real-time updates via Discord Gateway
- **Cache TTL**: 5 minutes for presence data
- **Memory Cache**: 10 minutes fallback when Redis unavailable
- **Auto Channels**: Real-time updates
- **Metrics**: Updated every 30 seconds

## Cache Performance

- **Cache Hit Rate**: Typically 75-85% for active users
- **Cache Strategy**: Cache-first with intelligent fallback
- **Cache Indicators**: All responses include `fromCache` field
- **Monitoring**: Cache performance metrics available via `/api/metrics/api`

## Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

async function getUserStatus(userId) {
  try {
    const response = await axios.get(`http://localhost:3000/api/users/${userId}/status`);
    const { data } = response.data;
    
    console.log(`Status: ${data.status}`);
    console.log(`From cache: ${data.fromCache}`);
    console.log(`Activities: ${data.activities.length}`);
    
    return data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('User not found');
    } else if (error.response?.status === 429) {
      console.log('Rate limit exceeded');
    } else {
      console.error('API Error:', error.message);
    }
  }
}

async function getMetrics() {
  try {
    const response = await axios.get('http://localhost:3000/api/metrics');
    const { data } = response.data;
    
    console.log('API Performance:');
    console.log(`- Success Rate: ${data.api.successRate}%`);
    console.log(`- Cache Hit Rate: ${data.api.cacheUtilizationRate}%`);
    console.log(`- Avg Response Time: ${data.api.averageResponseTime}ms`);
    
    return data;
  } catch (error) {
    console.error('Metrics Error:', error.message);
  }
}

// Usage
getUserStatus('123456789012345678').then(status => {
  console.log('User status:', status);
});

getMetrics().then(metrics => {
  console.log('System metrics:', metrics);
});
```

### Python

```python
import requests
import json

def get_user_activity(user_id):
    try:
        response = requests.get(f'http://localhost:3000/api/users/{user_id}/activity')
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print('User not found')
        elif e.response.status_code == 429:
            print('Rate limit exceeded')
        else:
            print(f'API Error: {e}')
    except requests.exceptions.RequestException as e:
        print(f'Request Error: {e}')

# Usage
activity = get_user_activity('123456789012345678')
if activity:
    print(json.dumps(activity, indent=2))
```

### cURL Examples

```bash
# Get user status
curl -X GET "http://localhost:3000/api/users/123456789012345678/status"

# Get user activity with error handling
curl -X GET "http://localhost:3000/api/users/123456789012345678/activity" \
  -w "HTTP Status: %{http_code}\n" \
  -s

# Get presence with headers
curl -X GET "http://localhost:3000/api/users/123456789012345678/presence" \
  -H "Accept: application/json" \
  -i

# Get comprehensive metrics dashboard
curl -X GET "http://localhost:3000/api/metrics"

# Get system health status
curl -X GET "http://localhost:3000/api/metrics/health"

# Get presence-specific metrics
curl -X GET "http://localhost:3000/api/metrics/presence"

# Run diagnostics
curl -X GET "http://localhost:3000/api/diagnostics"

# Reset metrics (admin operation)
curl -X POST "http://localhost:3000/api/metrics/reset"

# Update alert thresholds
curl -X PUT "http://localhost:3000/api/metrics/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "errorRateThreshold": 5,
    "responseTimeThreshold": 2000,
    "cacheHitRateThreshold": 80,
    "memoryUsageThreshold": 85,
    "enabled": true
  }'

# Configure server (requires proper permissions)
curl -X POST "http://localhost:3000/api/config/server/555555555555555555" \
  -H "Content-Type: application/json" \
  -d '{
    "autoChannels": [{
      "templateChannelId": "987654321098765432",
      "namePattern": "Gaming-{number}",
      "maxChannels": 10,
      "emptyTimeout": 5
    }]
  }'
```

## Health Check & Monitoring

The API provides multiple health check and monitoring endpoints:

#### GET /health

Basic health check endpoint:

```bash
curl -X GET "http://localhost:3000/health"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "discord": "connected",
    "cache": "available",
    "database": "connected"
  },
  "uptime": 3600
}
```

#### GET /api/metrics/health

Advanced health check with metrics analysis:

```bash
curl -X GET "http://localhost:3000/api/metrics/health"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "issues": [],
    "metrics": {
      "presence": {
        "errorRate": 0.4,
        "cacheHitRate": 78,
        "averageProcessingTime": 45
      },
      "api": {
        "successRate": 99.3,
        "averageResponseTime": 180,
        "cacheUtilizationRate": 77.5
      },
      "system": {
        "memoryUsage": { "heapUsed": 45678912, "heapTotal": 67108864 },
        "discordConnected": true,
        "cacheConnected": true
      }
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Monitoring Features

- **Real-time Metrics**: Performance data updated every 30 seconds
- **Alert System**: Configurable thresholds with automatic notifications
- **Cache Monitoring**: Hit rates, performance, and availability tracking
- **Error Tracking**: Comprehensive error rate and type monitoring
- **Resource Monitoring**: Memory usage, CPU usage, and connection status

#### Alert Thresholds (Default)

- **Error Rate**: > 5% triggers warning, > 10% triggers critical
- **Response Time**: > 2000ms triggers warning, > 4000ms triggers critical  
- **Cache Hit Rate**: < 80% triggers warning, < 70% triggers critical
- **Memory Usage**: > 85% triggers warning, > 95% triggers critical

All thresholds are configurable via the `/api/metrics/alerts` endpoint.
# API Documentation

## Overview

The Discord Bot API provides REST endpoints to access Discord user information in real-time, including status, activities, and Rich Presence data. All data is fetched directly from Discord's official API.

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

## Endpoints

### User Status

#### GET /api/users/{userId}/status

Returns the current online status of a Discord user.

**Parameters:**
- `userId` (string, required): Discord user ID

**Response:**
```json
{
  "userId": "123456789012345678",
  "status": "online",
  "lastUpdated": "2024-01-15T10:30:00.000Z"
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
  "lastUpdated": "2024-01-15T10:30:00.000Z"
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
  "userId": "123456789012345678",
  "status": "online",
  "activities": [
    {
      "type": "playing",
      "name": "Visual Studio Code",
      "details": "Editing discord-bot.ts",
      "state": "Working on Discord Bot",
      "timestamps": {
        "start": 1642248600000
      },
      "assets": {
        "largeImage": "vscode-logo",
        "largeText": "Visual Studio Code",
        "smallImage": "typescript-logo",
        "smallText": "TypeScript"
      }
    }
  ],
  "clientStatus": {
    "desktop": "online",
    "mobile": "offline",
    "web": "offline"
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z"
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

## Response Times

- **Target**: < 2 seconds for all endpoints
- **Typical**: 200-500ms when cache is available
- **Fallback**: 1-2 seconds when querying Discord API directly

## Data Freshness

- User status: Updated every 30 seconds
- User activities: Updated every 60 seconds
- Rich Presence: Updated every 45 seconds
- Auto channels: Real-time updates

## Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

async function getUserStatus(userId) {
  try {
    const response = await axios.get(`http://localhost:3000/api/users/${userId}/status`);
    return response.data;
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

// Usage
getUserStatus('123456789012345678').then(status => {
  console.log('User status:', status);
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

## Health Check

The API provides a health check endpoint:

#### GET /health

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
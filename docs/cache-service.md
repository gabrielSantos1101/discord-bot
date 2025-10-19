# Cache Service Documentation

## Overview

The Cache Service provides Redis-based caching for Discord user data and configurations with automatic fallback to direct Discord API calls when cache is unavailable.

## Features

- **Optional Redis Integration**: Can be enabled/disabled via configuration
- **Automatic Fallback**: Falls back to Discord API when Redis is unavailable
- **TTL Management**: Different TTL values for different data types
- **Error Resilience**: Graceful error handling with logging
- **Connection Management**: Automatic reconnection with exponential backoff

## Configuration

### Environment Variables

```bash
# Enable/disable cache
CACHE_ENABLED=true

# Redis connection (use either URL or individual settings)
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# Default TTL in seconds
CACHE_TTL=60
```

### TTL Values by Data Type

| Data Type | TTL | Description |
|-----------|-----|-------------|
| User Status | 30s | Online/offline status |
| User Activity | 60s | Current activities/games |
| User Presence | 45s | Rich Presence data |
| Auto Channels | 5min | Channel management data |
| Server Config | 24h | Server configuration |

## Usage

### Basic Usage

```typescript
import { CacheServiceFactory } from './services';
import { loadConfig } from './utils/config';

// Initialize cache service
const config = loadConfig();
const cacheService = await CacheServiceFactory.create(config.cache);

// Check if cache is available
if (cacheService.isAvailable()) {
  console.log('Cache is ready');
}
```

### With Fallback Pattern

```typescript
import { CacheWithFallback } from './utils/CacheWithFallback';

const cacheWithFallback = new CacheWithFallback(cacheService);

// Get user status with automatic fallback
const userStatus = await cacheWithFallback.getUserStatus(userId, async () => {
  // This function is called only if cache miss or error
  return await fetchFromDiscordAPI(userId);
});
```

### Direct Cache Operations

```typescript
// Get from cache
const cached = await cacheService.getUserStatus(userId);

// Set in cache
await cacheService.setUserStatus(userId, statusData);

// Invalidate cache
await cacheService.invalidateUser(userId);

// Get cache statistics
const stats = await cacheService.getStats();
```

## Cache Keys Structure

The service uses a structured key naming convention:

- `user:{userId}:status` - User online status
- `user:{userId}:activity` - User activities
- `user:{userId}:presence` - Rich Presence data
- `channel:{templateId}:auto` - Auto channel data
- `server:{serverId}:config` - Server configuration

## Error Handling

The cache service is designed to be resilient:

1. **Cache Disabled**: All operations return null/undefined, fallback is used
2. **Redis Connection Failed**: Operations return null, errors are logged
3. **Redis Errors**: Individual operations fail gracefully, don't crash the app
4. **Network Issues**: Automatic reconnection with exponential backoff

## Monitoring

### Cache Statistics

```typescript
const stats = await cacheService.getStats();
console.log(stats);
// Output: { connected: true, keyCount: 42, memory: "1.2M" }
```

### Health Check

```typescript
const isHealthy = cacheService.isAvailable();
```

## Best Practices

1. **Always Use Fallback**: Never rely solely on cache, always provide fallback
2. **Handle Errors Gracefully**: Cache errors should not break your application
3. **Monitor Performance**: Keep an eye on cache hit rates and Redis memory usage
4. **Use Appropriate TTLs**: Balance between data freshness and API rate limits
5. **Invalidate When Needed**: Clear cache when data changes

## Examples

See `src/examples/cache-usage.ts` for complete usage examples.

## Testing

The cache service includes comprehensive tests covering:

- Initialization scenarios
- Cache operations (get/set/delete)
- Error handling
- Availability checks
- TTL functionality

Run tests with:
```bash
npm test -- --testPathPattern=CacheService.test.ts
```
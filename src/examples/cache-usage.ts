import type { UserStatusResponse } from '../models/ApiResponses';
import { CacheServiceFactory } from '../services';
import { CacheWithFallback } from '../utils/CacheWithFallback';
import { loadConfig } from '../utils/config';

/**
 * Example usage of the CacheService with fallback functionality
 */
async function demonstrateCacheUsage() {
  console.log('=== Cache Service Usage Example ===\n');

  // Load configuration
  const config = loadConfig();
  
  // Initialize cache service
  console.log('1. Initializing cache service...');
  const cacheService = await CacheServiceFactory.create(config.cache);
  
  if (cacheService.isAvailable()) {
    console.log('✓ Cache service is available and connected');
  } else {
    console.log('⚠ Cache service is not available (disabled or connection failed)');
  }

  // Create cache with fallback utility
  const cacheWithFallback = new CacheWithFallback(cacheService);

  // Example: Get user status with fallback
  console.log('\n2. Getting user status with cache fallback...');
  
  const userId = 'example-user-123';
  
  try {
    const userStatus = await cacheWithFallback.getUserStatus(userId, async () => {
      console.log('   → Cache miss, fetching from Discord API...');
      
      // Simulate Discord API call
      const mockStatus: UserStatusResponse = {
        userId,
        status: 'online',
        activities: [
          {
            type: 'playing',
            name: 'Visual Studio Code',
            details: 'Editing cache-usage.ts',
            state: 'Working on Discord Bot',
            timestamps: {
              start: Date.now() - 3600000 // 1 hour ago
            }
          }
        ],
        lastUpdated: new Date().toISOString(),
        inVoiceChannel: false
      };
      
      return mockStatus;
    });

    console.log('✓ User status retrieved:', {
      status: userStatus.status,
      activityCount: userStatus.activities.length,
      lastUpdated: userStatus.lastUpdated
    });

    // Second call should hit cache
    console.log('\n3. Getting same user status again (should hit cache)...');
    const cachedStatus = await cacheWithFallback.getUserStatus(userId, async () => {
      console.log('   → This should not be called if cache is working');
      throw new Error('Fallback should not be called');
    });

    console.log('✓ Status from cache:', {
      status: cachedStatus.status,
      fromCache: cachedStatus.lastUpdated === userStatus.lastUpdated
    });

  } catch (error) {
    console.error('✗ Error during cache operations:', error);
  }

  // Example: Cache statistics
  console.log('\n4. Cache statistics...');
  const stats = await cacheService.getStats();
  if (stats) {
    console.log('✓ Cache stats:', stats);
  } else {
    console.log('⚠ Could not retrieve cache stats');
  }

  // Example: Cache invalidation
  console.log('\n5. Invalidating user cache...');
  cacheWithFallback.invalidateUser(userId);
  console.log('✓ User cache invalidated');

  // Example: Auto channels cache
  console.log('\n6. Working with auto channels cache...');
  const templateId = 'template-channel-456';
  
  try {
    const channels = await cacheWithFallback.getAutoChannels(templateId, async () => {
      console.log('   → Fetching auto channels from database...');
      return ['channel-1', 'channel-2', 'channel-3'];
    });

    console.log('✓ Auto channels:', channels);
  } catch (error) {
    console.error('✗ Error with auto channels cache:', error);
  }

  // Cleanup
  console.log('\n7. Cleaning up...');
  await CacheServiceFactory.close();
  console.log('✓ Cache service closed');
  
  console.log('\n=== Cache Usage Example Complete ===');
}

/**
 * Example of cache configuration options
 */
function showCacheConfiguration() {
  console.log('\n=== Cache Configuration Options ===\n');
  
  console.log('Environment variables for Redis cache:');
  console.log('- CACHE_ENABLED=true/false     # Enable/disable cache');
  console.log('- REDIS_URL=redis://host:port  # Full Redis connection URL');
  console.log('- REDIS_HOST=localhost         # Redis host');
  console.log('- REDIS_PORT=6379              # Redis port');
  console.log('- REDIS_PASSWORD=secret        # Redis password (optional)');
  console.log('- REDIS_DB=0                   # Redis database number');
  console.log('- CACHE_TTL=60                 # Default TTL in seconds');
  
  console.log('\nCache TTL values by data type:');
  console.log('- User Status: 30 seconds');
  console.log('- User Activity: 60 seconds');
  console.log('- User Presence: 45 seconds');
  console.log('- Auto Channels: 5 minutes');
  console.log('- Server Config: 24 hours');
  
  console.log('\nFallback behavior:');
  console.log('- Cache disabled → Direct Discord API calls');
  console.log('- Redis connection failed → Direct Discord API calls');
  console.log('- Cache miss → Fetch from Discord API + cache result');
  console.log('- Cache error → Log warning + fallback to Discord API');
}

// Run examples if this file is executed directly
if (require.main === module) {
  showCacheConfiguration();
  
  demonstrateCacheUsage().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { demonstrateCacheUsage, showCacheConfiguration };

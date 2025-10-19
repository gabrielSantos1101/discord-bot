import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Discord client configuration
 */
export interface DiscordConfig {
  /** Bot token for authentication */
  botToken: string;
  /** Client ID for the bot */
  clientId: string | undefined;
  /** Guild ID for testing (optional) */
  testGuildId: string | undefined;
}

/**
 * API configuration
 */
export interface ApiConfig {
  /** Port for the REST API server */
  port: number;
  /** Rate limit for API requests (requests per minute) */
  rateLimit: number;
  /** CORS origins */
  corsOrigins: string[];
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Redis connection URL */
  redisUrl: string | undefined;
  /** Redis host */
  redisHost: string;
  /** Redis port */
  redisPort: number;
  /** Redis password (optional) */
  redisPassword: string | undefined;
  /** Redis database number */
  redisDb: number;
  /** Default TTL for cached data (seconds) */
  defaultTtl: number;
  /** Whether cache is enabled */
  enabled: boolean;
}

/**
 * Application configuration
 */
export interface AppConfig {
  discord: DiscordConfig;
  api: ApiConfig;
  cache: CacheConfig;
  /** Environment (development, production, test) */
  environment: string;
  /** Log level */
  logLevel: string;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const requiredEnvVars = ['DISCORD_BOT_TOKEN'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return {
    discord: {
      botToken: process.env['DISCORD_BOT_TOKEN']!,
      clientId: process.env['DISCORD_CLIENT_ID'],
      testGuildId: process.env['DISCORD_TEST_GUILD_ID']
    },
    api: {
      port: parseInt(process.env['API_PORT'] || '3000'),
      rateLimit: parseInt(process.env['API_RATE_LIMIT'] || '100'),
      corsOrigins: process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000']
    },
    cache: {
      redisUrl: process.env['REDIS_URL'],
      redisHost: process.env['REDIS_HOST'] || 'localhost',
      redisPort: parseInt(process.env['REDIS_PORT'] || '6379'),
      redisPassword: process.env['REDIS_PASSWORD'],
      redisDb: parseInt(process.env['REDIS_DB'] || '0'),
      defaultTtl: parseInt(process.env['CACHE_TTL'] || '60'),
      enabled: process.env['CACHE_ENABLED'] !== 'false' && process.env['SKIP_REDIS'] !== 'true'
    },
    environment: process.env['NODE_ENV'] || 'development',
    logLevel: process.env['LOG_LEVEL'] || 'info'
  };
}

/**
 * Get Discord client configuration
 */
export function getDiscordConfig(): DiscordConfig {
  return loadConfig().discord;
}

/**
 * Validate Discord bot token format
 */
export function validateBotToken(token: string): boolean {
  // Discord bot tokens have a specific format
  // They typically start with the bot's user ID followed by a dot and then the token
  const tokenRegex = /^[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}$/;
  return tokenRegex.test(token);
}

/**
 * Create a Discord client instance with proper configuration
 */
export function createDiscordClientConfig(): DiscordConfig {
  const config = getDiscordConfig();
  
  if (!validateBotToken(config.botToken)) {
    throw new Error('Invalid Discord bot token format');
  }
  
  return config;
}
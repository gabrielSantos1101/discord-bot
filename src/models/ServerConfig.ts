import { ChannelConfig } from './ChannelConfig';

/**
 * Log level configuration
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * API access configuration for a server
 */
export interface ApiAccessConfig {
  /** Whether API access is enabled for this server */
  enabled: boolean;
  
  /** List of allowed API endpoints */
  allowedEndpoints: string[];
  
  /** Rate limit (requests per minute) */
  rateLimit: number;
  
  /** Allowed IP addresses (empty = all allowed) */
  allowedIPs: string[];
}

/**
 * Logging configuration for a server
 */
export interface LoggingConfig {
  /** Log level threshold */
  level: LogLevel;
  
  /** Channel IDs where logs should be sent */
  channels: string[];
  
  /** Whether to log user activities */
  logUserActivities: boolean;
  
  /** Whether to log channel operations */
  logChannelOperations: boolean;
}

/**
 * Complete server configuration
 */
export interface ServerConfig {
  /** Discord server ID */
  serverId: string;
  
  /** Command prefix for bot commands */
  commandPrefix: string;
  
  /** Auto-channel configurations */
  autoChannels: ChannelConfig[];
  
  /** API access configuration */
  apiAccess: ApiAccessConfig;
  
  /** Logging configuration */
  logging: LoggingConfig;
  
  /** Roles that have admin access to bot configuration */
  adminRoles: string[];
  
  /** Whether the bot is enabled in this server */
  enabled: boolean;
  
  /** Timezone for this server (for logging timestamps) */
  timezone: string;
  
  /** When this configuration was last updated */
  lastUpdated: Date;
}
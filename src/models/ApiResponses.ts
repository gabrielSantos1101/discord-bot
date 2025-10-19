import type { Activity } from './Activity';
import type { RichPresence } from './RichPresence';

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Response data */
  data: T;
  
  /** Response timestamp */
  timestamp: string;
  
  /** Request ID for tracking */
  requestId: string;
  
  /** Success status */
  success: boolean;
}

/**
 * User status API response
 */
export interface UserStatusResponse {
  /** User ID */
  userId: string;
  
  /** Current status */
  status: "online" | "idle" | "dnd" | "offline";
  
  /** List of current activities */
  activities: Activity[];
  
  /** When this data was last updated */
  lastUpdated: string;
  
  /** Whether user is currently in a voice channel */
  inVoiceChannel: boolean;
}

/**
 * User activity API response
 */
export interface UserActivityResponse {
  /** User ID */
  userId: string;
  
  /** Current activities */
  activities: Activity[];
  
  /** When activities were last updated */
  lastUpdated: string;
}

/**
 * User presence API response (includes Rich Presence data)
 */
export interface UserPresenceResponse {
  /** User ID */
  userId: string;
  
  /** Current activity details */
  currentActivity: Activity | null;
  
  /** Rich Presence data if available */
  richPresence: RichPresence | null;
  
  /** When presence was last updated */
  lastUpdated: string;
}

/**
 * Auto channel status response
 */
export interface AutoChannelStatusResponse {
  /** Template channel ID */
  templateId: string;
  
  /** List of currently active auto-channels */
  activeChannels: Array<{
    /** Channel ID */
    id: string;
    /** Channel name */
    name: string;
    /** Number of users in channel */
    userCount: number;
    /** When channel was created */
    createdAt: string;
  }>;
  
  /** Maximum channels allowed */
  maxChannels: number;
  
  /** Whether new channels can be created */
  canCreateNew: boolean;
}

/**
 * Server configuration response
 */
export interface ServerConfigResponse {
  /** Server ID */
  serverId: string;
  
  /** Whether configuration was updated successfully */
  updated: boolean;
  
  /** Configuration that was applied */
  config: {
    /** Command prefix */
    commandPrefix: string;
    /** Number of auto-channel templates configured */
    autoChannelCount: number;
    /** Whether API access is enabled */
    apiEnabled: boolean;
  };
}
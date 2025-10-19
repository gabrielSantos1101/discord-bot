import type { Activity } from './Activity';
import type { RichPresence } from './RichPresence';

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
  requestId: string;
  success: boolean;
}

/**
 * User status API response
 */
export interface UserStatusResponse {
  userId: string;
  status: "online" | "idle" | "dnd" | "offline";
  activities: Activity[];
  lastUpdated: string;
  inVoiceChannel: boolean;
  fromCache?: boolean;
}

/**
 * User activity API response
 */
export interface UserActivityResponse {
  userId: string;
  activities: Activity[];
  lastUpdated: string;
  fromCache?: boolean;
}

/**
 * User presence API response (includes Rich Presence data)
 */
export interface UserPresenceResponse {
  userId: string;
  currentActivity: Activity | null;
  richPresence: RichPresence | null;
  lastUpdated: string;
  fromCache?: boolean;
}

/**
 * Auto channel status response
 */
export interface AutoChannelStatusResponse {
  templateId: string;
  activeChannels: Array<{
    id: string;
    name: string;
    userCount: number;
    createdAt: string;
  }>;
  maxChannels: number;
  canCreateNew: boolean;
}

/**
 * Server configuration response
 */
export interface ServerConfigResponse {
  serverId: string;
  updated: boolean;
  config: {
    commandPrefix: string;
    autoChannelCount: number;
    apiEnabled: boolean;
  };
}
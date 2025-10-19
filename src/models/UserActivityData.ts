import type { Activity } from './Activity';

/**
 * User status type from Discord
 */
export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

/**
 * Client status information showing which platforms user is active on
 */
export interface ClientStatus {
  desktop?: 'online' | 'idle' | 'dnd';
  mobile?: 'online' | 'idle' | 'dnd';
  web?: 'online' | 'idle' | 'dnd';
}

/**
 * Comprehensive user activity data for caching presence information
 */
export interface UserActivityData {
  /** User ID */
  userId: string;
  
  /** Current user status */
  status: UserStatus;
  
  /** List of current activities */
  activities: Activity[];
  
  /** When this data was last updated */
  lastUpdated: Date;
  
  /** Client status showing which platforms user is active on */
  clientStatus?: ClientStatus;
}

/**
 * Batch operation result for multiple user presences
 */
export interface BatchPresenceResult {
  /** Successfully processed user IDs */
  success: string[];
  
  /** Failed user IDs with error messages */
  failed: Array<{
    userId: string;
    error: string;
  }>;
}
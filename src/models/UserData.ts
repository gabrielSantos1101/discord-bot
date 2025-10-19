import { Activity } from './Activity';
import { RichPresence } from './RichPresence';

/**
 * Discord user status types
 */
export type UserStatus = "online" | "idle" | "dnd" | "offline";

/**
 * Represents complete user data from Discord API
 */
export interface UserData {
  /** Discord user ID */
  id: string;
  
  /** Username */
  username: string;
  
  /** User discriminator (legacy, may be "0" for new usernames) */
  discriminator: string;
  
  /** Avatar hash */
  avatar?: string;
  
  /** Current user status */
  status: UserStatus;
  
  /** List of current user activities */
  activities: Activity[];
  
  /** Rich Presence data if available */
  presence?: RichPresence;
  
  /** Timestamp of when user was last seen */
  lastSeen: Date;
  
  /** Global display name (new Discord feature) */
  globalName?: string;
  
  /** Whether user is a bot */
  bot?: boolean;
}
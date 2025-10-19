/**
 * Represents a Discord user activity (game, music, custom status, etc.)
 * Simplified version focusing on basic activity data
 */
export interface Activity {
  /** Type of activity */
  type: "playing" | "listening" | "watching" | "custom" | "competing";
  
  /** Name of the activity */
  name: string;
  
  /** Details about the activity (e.g., song name, game details) */
  details?: string;
  
  /** State of the activity (e.g., artist name, game status) */
  state?: string;
  
  /** Timestamps for activity duration */
  timestamps?: {
    /** Unix timestamp when activity started */
    start?: number;
    /** Unix timestamp when activity will end */
    end?: number;
  };
  
  /** URL for streaming activities */
  url?: string;
}
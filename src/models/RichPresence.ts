/**
 * Discord Rich Presence data structure
 * Represents detailed activity information that users can configure in their applications
 */
export interface RichPresence {
  /** Application ID that is providing the Rich Presence */
  applicationId?: string;
  
  /** What the player is currently doing */
  details?: string;
  
  /** The user's current party status */
  state?: string;
  
  /** Large image key for the Rich Presence */
  largeImageKey?: string;
  
  /** Text displayed when hovering over the large image */
  largeImageText?: string;
  
  /** Small image key for the Rich Presence */
  smallImageKey?: string;
  
  /** Text displayed when hovering over the small image */
  smallImageText?: string;
  
  /** Information about the player's party */
  party?: {
    /** ID of the party */
    id?: string;
    /** Current party size */
    size?: [number, number]; // [current, max]
  };
  
  /** Secrets for Rich Presence joining and spectating */
  secrets?: {
    /** Secret for joining a game */
    join?: string;
    /** Secret for spectating a game */
    spectate?: string;
    /** Secret for a specific instanced match */
    match?: string;
  };
  
  /** Whether or not the activity is an instanced game session */
  instance?: boolean;
  
  /** Activity flags describing what the payload includes */
  flags?: number;
}
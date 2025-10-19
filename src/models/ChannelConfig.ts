/**
 * Permission configuration for auto-created channels
 */
export interface ChannelPermission {
  /** Role or user ID */
  id: string;
  
  /** Whether this is a role (true) or user (false) permission */
  type: "role" | "member";
  
  /** Allowed permissions bitfield */
  allow: string;
  
  /** Denied permissions bitfield */
  deny: string;
}

/**
 * Configuration for automatic channel creation
 */
export interface ChannelConfig {
  /** ID of the template channel that triggers auto-creation */
  templateChannelId: string;
  
  /** Server ID where this configuration applies */
  serverId: string;
  
  /** Pattern for naming auto-created channels (e.g., "jogando-{number}") */
  namePattern: string;
  
  /** Maximum number of auto-channels allowed simultaneously */
  maxChannels: number;
  
  /** Time in minutes before empty channels are deleted */
  emptyTimeout: number;
  
  /** Permission overrides for auto-created channels */
  permissions: ChannelPermission[];
  
  /** Category ID where auto-channels should be created */
  categoryId?: string;
  
  /** Whether this configuration is currently active */
  enabled: boolean;
  
  /** User limit for auto-created channels (0 = no limit) */
  userLimit: number;
}
import { Activity } from '../models/Activity';
import { DiscordApiError, ErrorCode } from '../models/ErrorTypes';
import { RichPresence } from '../models/RichPresence';
import { UserData, UserStatus } from '../models/UserData';

/**
 * Rate limiting configuration for Discord API
 */
interface RateLimitConfig {
  /** Maximum requests per second */
  maxRequestsPerSecond: number;
  /** Current request count in the current second */
  currentRequests: number;
  /** Timestamp of the current second window */
  windowStart: number;
  /** Queue of pending requests */
  requestQueue: Array<() => void>;
  /** Whether we're currently rate limited */
  isRateLimited: boolean;
  /** When the rate limit will reset */
  rateLimitResetAt: number | null;
}

/**
 * Discord API response for user data
 */
interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
  bot?: boolean;
}

/**
 * Discord API response for guild member data
 */
interface DiscordGuildMember {
  user: DiscordUser;
  nick?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
  deaf: boolean;
  mute: boolean;
  pending?: boolean;
  permissions?: string;
}

/**
 * Discord API response for presence data
 */
interface DiscordPresence {
  user: {
    id: string;
  };
  guild_id: string;
  status: UserStatus;
  activities: DiscordActivity[];
  client_status: {
    desktop?: string;
    mobile?: string;
    web?: string;
  };
}

/**
 * Discord API activity structure
 */
interface DiscordActivity {
  name: string;
  type: number;
  url?: string;
  created_at: number;
  timestamps?: {
    start?: number;
    end?: number;
  };
  application_id?: string;
  details?: string;
  state?: string;
  emoji?: {
    name: string;
    id?: string;
    animated?: boolean;
  };
  party?: {
    id?: string;
    size?: [number, number];
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  secrets?: {
    join?: string;
    spectate?: string;
    match?: string;
  };
  instance?: boolean;
  flags?: number;
}

/**
 * Client for making direct HTTP requests to Discord API
 * Handles authentication, rate limiting, and data transformation
 */
export class DiscordClient {
  private readonly baseUrl = 'https://discord.com/api/v10';
  private readonly botToken: string;
  private readonly rateLimitConfig: RateLimitConfig;

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error('Bot token is required');
    }
    
    this.botToken = botToken;
    this.rateLimitConfig = {
      maxRequestsPerSecond: 50, // Discord allows 50 requests per second
      currentRequests: 0,
      windowStart: Date.now(),
      requestQueue: [],
      isRateLimited: false,
      rateLimitResetAt: null
    };
  }

  /**
   * Get user data by user ID
   * Makes direct HTTP request to Discord API
   */
  async getUserData(userId: string, guildId?: string): Promise<UserData> {
    if (!userId) {
      throw this.createError(ErrorCode.INVALID_REQUEST, 'User ID is required');
    }

    try {
      // Get basic user info
      const user = await this.makeRequest<DiscordUser>(`/users/${userId}`);
      
      // Get guild member info if guild ID is provided
      let guildMember: DiscordGuildMember | null = null;
      if (guildId) {
        try {
          guildMember = await this.makeRequest<DiscordGuildMember>(`/guilds/${guildId}/members/${userId}`);
        } catch (error) {
          // User might not be in the guild, continue with basic user data
          console.warn(`User ${userId} not found in guild ${guildId}`);
        }
      }

      // Get presence data if guild ID is provided
      let presence: DiscordPresence | null = null;
      if (guildId) {
        try {
          // Note: Getting presence requires special permissions and may not always be available
          // This is a simplified approach - in practice, presence data is usually received via gateway
          presence = await this.getPresenceData(userId, guildId);
        } catch (error) {
          // Presence data might not be available, continue without it
          console.warn(`Presence data not available for user ${userId}`);
        }
      }

      return this.transformUserData(user, guildMember, presence);
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a Discord API error with 404 status
        const errorDetails = (error as any).details;
        if (errorDetails && errorDetails.status === 404) {
          throw this.createError(ErrorCode.USER_NOT_FOUND, `User with ID ${userId} not found`);
        }
        // Check if error message contains 404 (fallback)
        if (error.message.includes('404')) {
          throw this.createError(ErrorCode.USER_NOT_FOUND, `User with ID ${userId} not found`);
        }
      }
      throw error;
    }
  }

  /**
   * Get user activities by user ID
   */
  async getUserActivities(userId: string, guildId?: string): Promise<Activity[]> {
    const userData = await this.getUserData(userId, guildId);
    return userData.activities;
  }

  /**
   * Get user status by user ID
   */
  async getUserStatus(userId: string, guildId?: string): Promise<UserStatus> {
    const userData = await this.getUserData(userId, guildId);
    return userData.status;
  }

  /**
   * Get Rich Presence data for a user
   */
  async getUserRichPresence(userId: string, guildId?: string): Promise<RichPresence | null> {
    const userData = await this.getUserData(userId, guildId);
    return userData.presence || null;
  }

  /**
   * Make authenticated HTTP request to Discord API with rate limiting
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    await this.waitForRateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bot ${this.botToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (discord-bot-api, 1.0.0)'
    };

    try {
      const response = await fetch(url, { headers });
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '1');
        await this.handleRateLimit(retryAfter);
        return this.makeRequest<T>(endpoint); // Retry the request
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createDiscordApiError(response.status, errorData);
      }

      // Update rate limit tracking
      this.updateRateLimitTracking(response);

      return await response.json() as T;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw this.createError(ErrorCode.SERVICE_UNAVAILABLE, 'Unable to connect to Discord API');
      }
      throw error;
    }
  }

  /**
   * Get presence data (simplified - in real implementation this would come from gateway)
   */
  private async getPresenceData(_userId: string, _guildId: string): Promise<DiscordPresence | null> {
    // Note: Discord API doesn't provide a direct endpoint for presence data via REST
    // This would typically come from the gateway connection
    // For now, we'll return null and rely on cached data or gateway events
    return null;
  }

  /**
   * Wait for rate limit if necessary
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset window if a second has passed
    if (now - this.rateLimitConfig.windowStart >= 1000) {
      this.rateLimitConfig.currentRequests = 0;
      this.rateLimitConfig.windowStart = now;
    }

    // Check if we're rate limited
    if (this.rateLimitConfig.isRateLimited && this.rateLimitConfig.rateLimitResetAt) {
      const waitTime = this.rateLimitConfig.rateLimitResetAt - now;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.rateLimitConfig.isRateLimited = false;
        this.rateLimitConfig.rateLimitResetAt = null;
      }
    }

    // Check if we've hit the per-second limit
    if (this.rateLimitConfig.currentRequests >= this.rateLimitConfig.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.rateLimitConfig.windowStart);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.rateLimitConfig.currentRequests = 0;
        this.rateLimitConfig.windowStart = Date.now();
      }
    }

    this.rateLimitConfig.currentRequests++;
  }

  /**
   * Handle rate limit response from Discord
   */
  private async handleRateLimit(retryAfter: number): Promise<void> {
    this.rateLimitConfig.isRateLimited = true;
    this.rateLimitConfig.rateLimitResetAt = Date.now() + (retryAfter * 1000);
    
    console.warn(`Discord API rate limited. Waiting ${retryAfter} seconds.`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    
    this.rateLimitConfig.isRateLimited = false;
    this.rateLimitConfig.rateLimitResetAt = null;
  }

  /**
   * Update rate limit tracking based on response headers
   */
  private updateRateLimitTracking(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = response.headers.get('x-ratelimit-reset-after');
    
    if (remaining && parseInt(remaining) === 0 && resetAfter) {
      const resetTime = parseFloat(resetAfter) * 1000;
      this.rateLimitConfig.isRateLimited = true;
      this.rateLimitConfig.rateLimitResetAt = Date.now() + resetTime;
    }
  }

  /**
   * Transform Discord API user data to internal format
   */
  private transformUserData(
    user: DiscordUser, 
    _guildMember: DiscordGuildMember | null, 
    presence: DiscordPresence | null
  ): UserData {
    const activities = presence?.activities ? this.transformActivities(presence.activities) : [];
    const richPresence = this.extractRichPresence(activities);

    const result: UserData = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      status: presence?.status || 'offline',
      activities,
      lastSeen: new Date(),
      bot: user.bot || false
    };

    if (user.avatar) result.avatar = user.avatar;
    if (user.global_name) result.globalName = user.global_name;
    if (richPresence) result.presence = richPresence;

    return result;
  }

  /**
   * Transform Discord activities to internal format
   */
  private transformActivities(discordActivities: DiscordActivity[]): Activity[] {
    return discordActivities.map(activity => {
      // Map Discord activity types to our internal types
      let type: Activity['type'];
      switch (activity.type) {
        case 0: type = 'playing'; break;
        case 1: type = 'listening'; break;
        case 2: type = 'watching'; break;
        case 3: type = 'custom'; break;
        case 5: type = 'competing'; break;
        default: type = 'custom';
      }

      const result: Activity = {
        type,
        name: activity.name
      };

      if (activity.details) result.details = activity.details;
      if (activity.state) result.state = activity.state;
      if (activity.timestamps) result.timestamps = activity.timestamps;
      if (activity.url) result.url = activity.url;

      return result;
    });
  }

  /**
   * Extract Rich Presence data from activities
   */
  private extractRichPresence(activities: Activity[]): RichPresence | null {
    // Find the first activity that has Rich Presence data
    const richActivity = activities.find(activity => 
      activity.details || activity.state || activity.type === 'playing'
    );

    if (!richActivity) {
      return null;
    }

    // This is a simplified extraction - in a real implementation,
    // Rich Presence data would come directly from Discord's activity structure
    const result: RichPresence = {};
    
    if (richActivity.details) result.details = richActivity.details;
    if (richActivity.state) result.state = richActivity.state;
    // Note: Image keys and other Rich Presence fields would need to be extracted
    // from the original Discord activity structure if available
    
    return result;
  }

  /**
   * Create standardized error
   */
  private createError(code: ErrorCode, message: string, details?: any): Error {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).details = details;
    return error;
  }

  /**
   * Create Discord API specific error
   */
  private createDiscordApiError(status: number, errorData: any): Error {
    const discordError: DiscordApiError = {
      code: errorData.code || 0,
      message: errorData.message || 'Unknown Discord API error',
      status,
      isRateLimit: status === 429,
      retryAfter: errorData.retry_after
    };

    const error = new Error(`Discord API Error: ${discordError.message}`);
    (error as any).code = ErrorCode.DISCORD_API_ERROR;
    (error as any).details = discordError;
    return error;
  }
}
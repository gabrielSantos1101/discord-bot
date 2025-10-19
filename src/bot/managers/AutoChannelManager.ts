import { ChannelType, Client, GuildChannel, OverwriteResolvable, VoiceState } from 'discord.js';
import { ChannelConfig, ChannelPermission } from '../../models/ChannelConfig';
import { CacheService } from '../../services/CacheService';

/**
 * Interface for active auto channel tracking
 */
interface ActiveAutoChannel {
  channelId: string;
  templateId: string;
  createdAt: Date;
  lastActivity: Date;
  userCount: number;
  number: number;
}

/**
 * Interface for channel queue entry
 */
interface ChannelQueueEntry {
  userId: string;
  templateId: string;
  timestamp: Date;
}

/**
 * Manager for automatic channel creation and cleanup
 * Handles detection of template channel entry and creates numbered channels
 */
export class AutoChannelManager {
  private client: Client;
  private cacheService: CacheService;
  private activeChannels: Map<string, ActiveAutoChannel> = new Map();
  private channelQueue: ChannelQueueEntry[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private channelConfigs: Map<string, ChannelConfig> = new Map();

  constructor(client: Client, cacheService: CacheService) {
    this.client = client;
    this.cacheService = cacheService;
    this.setupEventListeners();
    this.startCleanupTimer();
  }

  /**
   * Setup Discord event listeners for voice state changes
   */
  private setupEventListeners(): void {
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));
  }

  /**
   * Handle voice state updates to detect template channel entry
   */
  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
      // User joined a channel
      if (!oldState.channelId && newState.channelId) {
        await this.handleChannelJoin(newState);
      }
      
      // User left a channel
      if (oldState.channelId && !newState.channelId) {
        await this.handleChannelLeave(oldState);
      }
      
      // User moved between channels
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await this.handleChannelLeave(oldState);
        await this.handleChannelJoin(newState);
      }
    } catch (error) {
      console.error('Error handling voice state update:', error);
    }
  }

  /**
   * Handle user joining a channel
   */
  private async handleChannelJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.channelId || !voiceState.member) return;

    const channelId = voiceState.channelId;
    const userId = voiceState.member.id;

    // Check if this is a template channel
    const config = this.getChannelConfig(channelId);
    if (config && config.enabled) {
      await this.handleTemplateChannelEntry(userId, channelId, config);
      return;
    }

    // Check if this is an active auto channel
    const activeChannel = this.activeChannels.get(channelId);
    if (activeChannel) {
      activeChannel.userCount++;
      activeChannel.lastActivity = new Date();
      await this.updateChannelCache(activeChannel.templateId);
    }
  }

  /**
   * Handle user leaving a channel
   */
  private async handleChannelLeave(voiceState: VoiceState): Promise<void> {
    if (!voiceState.channelId) return;

    const channelId = voiceState.channelId;
    const activeChannel = this.activeChannels.get(channelId);
    
    if (activeChannel) {
      activeChannel.userCount = Math.max(0, activeChannel.userCount - 1);
      activeChannel.lastActivity = new Date();
      await this.updateChannelCache(activeChannel.templateId);
    }
  }

  /**
   * Handle entry into a template channel
   */
  private async handleTemplateChannelEntry(userId: string, templateId: string, config: ChannelConfig): Promise<void> {
    try {
      // Check if we can create a new channel
      const activeChannelsForTemplate = this.getActiveChannelsForTemplate(templateId);
      
      if (activeChannelsForTemplate.length >= config.maxChannels) {
        // Add to queue if limit reached
        this.addToQueue(userId, templateId);
        return;
      }

      // Create new auto channel
      const newChannel = await this.createAutoChannel(templateId, config);
      if (newChannel) {
        // Move user to the new channel
        const guild = newChannel.guild;
        const member = await guild.members.fetch(userId);
        if (member.voice.channelId === templateId) {
          await member.voice.setChannel(newChannel.id);
        }
      }
    } catch (error) {
      console.error('Error handling template channel entry:', error);
    }
  }

  /**
   * Create a new auto channel based on template configuration
   */
  private async createAutoChannel(templateId: string, config: ChannelConfig): Promise<GuildChannel | null> {
    try {
      const templateChannel = await this.client.channels.fetch(templateId);
      if (!templateChannel || !templateChannel.isVoiceBased() || !templateChannel.guild) {
        console.error('Template channel not found, not voice-based, or not in a guild:', templateId);
        return null;
      }

      const guild = templateChannel.guild;
      const channelNumber = this.getNextChannelNumber(templateId);
      const channelName = this.generateChannelName(config.namePattern, channelNumber);

      // Prepare permission overwrites
      const permissionOverwrites: OverwriteResolvable[] = [];
      
      // Copy template channel permissions
      templateChannel.permissionOverwrites.cache.forEach((overwrite) => {
        permissionOverwrites.push({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow,
          deny: overwrite.deny
        });
      });

      // Add custom permissions from config
      config.permissions.forEach((perm: ChannelPermission) => {
        permissionOverwrites.push({
          id: perm.id,
          type: perm.type === 'role' ? 0 : 1,
          allow: BigInt(perm.allow),
          deny: BigInt(perm.deny)
        });
      });

      // Create the channel
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: config.categoryId || templateChannel.parentId,
        userLimit: config.userLimit || (templateChannel.isVoiceBased() ? templateChannel.userLimit : 0) || 0,
        permissionOverwrites
      });

      // Track the new channel
      const activeChannel: ActiveAutoChannel = {
        channelId: newChannel.id,
        templateId,
        createdAt: new Date(),
        lastActivity: new Date(),
        userCount: 0,
        number: channelNumber
      };

      this.activeChannels.set(newChannel.id, activeChannel);
      await this.updateChannelCache(templateId);

      console.log(`Created auto channel: ${channelName} (${newChannel.id})`);
      return newChannel;
    } catch (error) {
      console.error('Error creating auto channel:', error);
      return null;
    }
  }

  /**
   * Generate channel name from pattern and number
   */
  private generateChannelName(pattern: string, number: number): string {
    return pattern.replace('{number}', number.toString());
  }

  /**
   * Get the next available channel number for a template
   */
  private getNextChannelNumber(templateId: string): number {
    const activeChannels = this.getActiveChannelsForTemplate(templateId);
    const usedNumbers = activeChannels.map(ch => ch.number).sort((a, b) => a - b);
    
    // Find the first available number starting from 1
    for (let i = 1; i <= usedNumbers.length + 1; i++) {
      if (!usedNumbers.includes(i)) {
        return i;
      }
    }
    
    return 1; // Fallback
  }

  /**
   * Get active channels for a specific template
   */
  private getActiveChannelsForTemplate(templateId: string): ActiveAutoChannel[] {
    return Array.from(this.activeChannels.values()).filter(ch => ch.templateId === templateId);
  }

  /**
   * Add user to queue when channel limit is reached
   */
  private addToQueue(userId: string, templateId: string): void {
    // Remove existing queue entry for this user
    this.channelQueue = this.channelQueue.filter(entry => entry.userId !== userId);
    
    // Add new entry
    this.channelQueue.push({
      userId,
      templateId,
      timestamp: new Date()
    });

    console.log(`Added user ${userId} to queue for template ${templateId}`);
  }

  /**
   * Process queue when a channel becomes available
   */
  private async processQueue(templateId: string): Promise<void> {
    const queueEntry = this.channelQueue.find(entry => entry.templateId === templateId);
    if (!queueEntry) return;

    // Remove from queue
    this.channelQueue = this.channelQueue.filter(entry => entry !== queueEntry);

    // Check if user is still in the template channel
    try {
      const guild = this.client.guilds.cache.find(g => 
        g.channels.cache.has(templateId)
      );
      
      if (guild) {
        const member = await guild.members.fetch(queueEntry.userId);
        if (member.voice.channelId === templateId) {
          const config = this.getChannelConfig(templateId);
          if (config) {
            await this.handleTemplateChannelEntry(queueEntry.userId, templateId, config);
          }
        }
      }
    } catch (error) {
      console.error('Error processing queue entry:', error);
    }
  }

  /**
   * Get channel configuration for a template channel
   */
  private getChannelConfig(channelId: string): ChannelConfig | null {
    return this.channelConfigs.get(channelId) || null;
  }

  /**
   * Load channel configurations (to be called by external service)
   */
  public loadChannelConfigs(configs: ChannelConfig[]): void {
    this.channelConfigs.clear();
    configs.forEach(config => {
      this.channelConfigs.set(config.templateChannelId, config);
    });
    console.log(`Loaded ${configs.length} channel configurations`);
  }

  /**
   * Update cache with current active channels
   */
  private async updateChannelCache(templateId: string): Promise<void> {
    try {
      const activeChannels = this.getActiveChannelsForTemplate(templateId);
      const channelIds = activeChannels.map(ch => ch.channelId);
      await this.cacheService.setAutoChannels(templateId, channelIds);
    } catch (error) {
      console.error('Error updating channel cache:', error);
    }
  }

  /**
   * Start cleanup timer for empty channels
   */
  private startCleanupTimer(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupEmptyChannels();
    }, 60000);
  }

  /**
   * Cleanup empty channels that have exceeded timeout
   */
  private async cleanupEmptyChannels(): Promise<void> {
    const now = new Date();
    const channelsToDelete: string[] = [];

    for (const [channelId, activeChannel] of this.activeChannels.entries()) {
      // Check if channel is empty and has exceeded timeout
      if (activeChannel.userCount === 0) {
        const config = this.getChannelConfig(activeChannel.templateId);
        if (config) {
          const timeoutMs = config.emptyTimeout * 60 * 1000; // Convert minutes to milliseconds
          const timeSinceLastActivity = now.getTime() - activeChannel.lastActivity.getTime();
          
          if (timeSinceLastActivity >= timeoutMs) {
            channelsToDelete.push(channelId);
          }
        }
      }
    }

    // Delete empty channels
    for (const channelId of channelsToDelete) {
      await this.deleteAutoChannel(channelId);
    }
  }

  /**
   * Delete an auto channel and update tracking
   */
  private async deleteAutoChannel(channelId: string): Promise<void> {
    try {
      const activeChannel = this.activeChannels.get(channelId);
      if (!activeChannel) return;

      // Delete the Discord channel
      const channel = await this.client.channels.fetch(channelId);
      if (channel && 'delete' in channel && typeof channel.delete === 'function') {
        await channel.delete('Auto channel cleanup - empty timeout');
        console.log(`Deleted empty auto channel: ${channelId}`);
      }

      // Remove from tracking
      this.activeChannels.delete(channelId);
      await this.updateChannelCache(activeChannel.templateId);

      // Process queue for this template
      await this.processQueue(activeChannel.templateId);
    } catch (error) {
      console.error('Error deleting auto channel:', error);
      // Remove from tracking even if deletion failed
      const activeChannel = this.activeChannels.get(channelId);
      if (activeChannel) {
        this.activeChannels.delete(channelId);
        await this.updateChannelCache(activeChannel.templateId);
      }
    }
  }

  /**
   * Get statistics about active channels
   */
  public getStats(): { totalChannels: number; channelsByTemplate: Record<string, number>; queueSize: number } {
    const channelsByTemplate: Record<string, number> = {};
    
    for (const activeChannel of this.activeChannels.values()) {
      channelsByTemplate[activeChannel.templateId] = (channelsByTemplate[activeChannel.templateId] || 0) + 1;
    }

    return {
      totalChannels: this.activeChannels.size,
      channelsByTemplate,
      queueSize: this.channelQueue.length
    };
  }

  /**
   * Manually trigger cleanup (for testing or admin commands)
   */
  public async forceCleanup(): Promise<void> {
    await this.cleanupEmptyChannels();
  }

  /**
   * Stop the manager and cleanup resources
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.activeChannels.clear();
    this.channelQueue.length = 0;
    this.channelConfigs.clear();
  }
}
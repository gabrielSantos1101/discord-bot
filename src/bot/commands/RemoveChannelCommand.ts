import { PermissionsBitField } from 'discord.js';
import { DatabaseService } from '../../services/DatabaseService';
import { CommandContext, CommandHandler, CommandResult } from './CommandHandler';

/**
 * Command to remove auto-channel configuration
 * Usage: !remove channel <template_channel_id>
 */
export class RemoveChannelCommand extends CommandHandler {
  readonly name = 'remove channel';
  readonly description = 'Remove auto-channel template configuration';
  readonly requiredPermissions = [PermissionsBitField.Flags.ManageChannels];
  readonly requiresAdmin = true;

  constructor(private databaseService: DatabaseService) {
    super();
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, message, serverConfig } = context;

    if (args.length < 3) {
      return {
        success: false,
        message: `**Usage:** \`${serverConfig.commandPrefix}remove channel <channel_id>\`\n\n` +
                `**Example:** \`${serverConfig.commandPrefix}remove channel 123456789\``
      };
    }

    const [, , templateChannelId] = args;

    if (!templateChannelId) {
      return {
        success: false,
        message: `**Usage:** \`${serverConfig.commandPrefix}remove channel <channel_id>\`\n\n` +
                `**Example:** \`${serverConfig.commandPrefix}remove channel 123456789\``
      };
    }

    try {
      // Check if configuration exists
      const existingConfig = await this.databaseService.getChannelConfig(
        serverConfig.serverId, 
        templateChannelId
      );

      if (!existingConfig) {
        return {
          success: false,
          message: '❌ No auto-channel configuration found for that channel ID.'
        };
      }

      // Get channel name for confirmation message
      const channel = message.guild ? await message.guild.channels.fetch(templateChannelId).catch(() => null) : null;
      const channelName = channel ? `#${channel.name}` : templateChannelId;

      // Remove configuration
      await this.databaseService.deleteChannelConfig(serverConfig.serverId, templateChannelId);

      return {
        success: true,
        message: `✅ Auto-channel configuration removed for ${channelName}.\n\n` +
                `The template channel will no longer create auto-channels when users join it.`
      };
    } catch (error) {
      console.error('Error removing channel config:', error);
      return {
        success: false,
        message: '❌ Failed to remove channel configuration. Please try again.'
      };
    }
  }

  override getUsage(prefix: string): string {
    return `${prefix}remove channel <channel_id>`;
  }
}
import { ChannelType, PermissionsBitField } from 'discord.js';
import { ChannelConfig } from '../../models/ChannelConfig';
import { DatabaseService } from '../../services/DatabaseService';
import { CommandContext, CommandHandler, CommandResult } from './CommandHandler';

/**
 * Command to configure auto-channel templates
 * Usage: !config channel <template_channel_id> <name_pattern> [options]
 */
export class ConfigChannelCommand extends CommandHandler {
  readonly name = 'config channel';
  readonly description = 'Configure auto-channel template settings';
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
        message: this.getUsageMessage(serverConfig.commandPrefix)
      };
    }

    const [, , templateChannelId, namePattern, ...options] = args;

    if (!templateChannelId || !namePattern) {
      return {
        success: false,
        message: this.getUsageMessage(serverConfig.commandPrefix)
      };
    }

    try {
      if (!message.guild) {
        return {
          success: false,
          message: '❌ This command can only be used in a server.'
        };
      }

      const templateChannel = await message.guild.channels.fetch(templateChannelId);
      if (!templateChannel) {
        return {
          success: false,
          message: '❌ Template channel not found. Please provide a valid channel ID.'
        };
      }

      if (templateChannel.type !== ChannelType.GuildVoice) {
        return {
          success: false,
          message: '❌ Template channel must be a voice channel.'
        };
      }

      const config = await this.parseChannelConfig(
        templateChannelId,
        namePattern,
        options,
        serverConfig.serverId,
        message
      );

      const existingConfigs = await this.databaseService.getChannelConfigs(serverConfig.serverId);
      const configIndex = existingConfigs.findIndex(c => c.templateChannelId === templateChannelId);
      
      if (configIndex >= 0) {
        existingConfigs[configIndex] = config;
      } else {
        existingConfigs.push(config);
      }

      await this.databaseService.saveChannelConfigs(serverConfig.serverId, existingConfigs);

      return {
        success: true,
        message: `✅ Auto-channel configuration saved for <#${templateChannelId}>!\n` +
                `**Pattern:** ${namePattern}\n` +
                `**Max Channels:** ${config.maxChannels}\n` +
                `**Empty Timeout:** ${config.emptyTimeout} minutes\n` +
                `**User Limit:** ${config.userLimit || 'No limit'}\n` +
                `**Status:** ${config.enabled ? 'Enabled' : 'Disabled'}`
      };
    } catch (error) {
      console.error('Error configuring channel:', error);
      return {
        success: false,
        message: '❌ Failed to save channel configuration. Please check the parameters and try again.'
      };
    }
  }

  private async parseChannelConfig(
    templateChannelId: string,
    namePattern: string,
    options: string[],
    serverId: string,
    message: any
  ): Promise<ChannelConfig> {
    const config: ChannelConfig = {
      templateChannelId,
      serverId,
      namePattern,
      maxChannels: 10,
      emptyTimeout: 5,
      permissions: [],
      enabled: true,
      userLimit: 0
    };

    for (let i = 0; i < options.length; i += 2) {
      const option = options[i]?.toLowerCase();
      const value = options[i + 1];

      switch (option) {
        case '--max-channels':
        case '-m':
          if (!value) throw new Error('Max channels value is required');
          const maxChannels = parseInt(value);
          if (isNaN(maxChannels) || maxChannels < 1 || maxChannels > 50) {
            throw new Error('Max channels must be between 1 and 50');
          }
          config.maxChannels = maxChannels;
          break;

        case '--timeout':
        case '-t':
          if (!value) throw new Error('Timeout value is required');
          const timeout = parseInt(value);
          if (isNaN(timeout) || timeout < 1 || timeout > 1440) {
            throw new Error('Timeout must be between 1 and 1440 minutes');
          }
          config.emptyTimeout = timeout;
          break;

        case '--user-limit':
        case '-u':
          if (!value) throw new Error('User limit value is required');
          const userLimit = parseInt(value);
          if (isNaN(userLimit) || userLimit < 0 || userLimit > 99) {
            throw new Error('User limit must be between 0 and 99');
          }
          config.userLimit = userLimit;
          break;

        case '--category':
        case '-c':
          if (!value) throw new Error('Category ID is required');
          const category = await message.guild.channels.fetch(value);
          if (!category || category.type !== ChannelType.GuildCategory) {
            throw new Error('Invalid category ID');
          }
          config.categoryId = value;
          break;

        case '--disabled':
        case '-d':
          config.enabled = false;
          i--;
          break;
      }
    }

    if (!namePattern.includes('{number}')) {
      throw new Error('Name pattern must contain {number} placeholder');
    }

    return config;
  }

  private getUsageMessage(prefix: string): string {
    return `**Usage:** \`${prefix}config channel <channel_id> <name_pattern> [options]\`\n\n` +
           `**Parameters:**\n` +
           `• \`channel_id\` - ID of the template voice channel\n` +
           `• \`name_pattern\` - Pattern for auto-created channels (must include {number})\n\n` +
           `**Options:**\n` +
           `• \`--max-channels -m <number>\` - Maximum channels (1-50, default: 10)\n` +
           `• \`--timeout -t <minutes>\` - Empty timeout (1-1440, default: 5)\n` +
           `• \`--user-limit -u <number>\` - User limit per channel (0-99, default: 0)\n` +
           `• \`--category -c <category_id>\` - Category for auto-channels\n` +
           `• \`--disabled -d\` - Create configuration as disabled\n\n` +
           `**Example:**\n` +
           `\`${prefix}config channel 123456789 "Gaming-{number}" --max-channels 5 --timeout 10\``;
  }

  override getUsage(prefix: string): string {
    return `${prefix}config channel <channel_id> <name_pattern> [options]`;
  }
}
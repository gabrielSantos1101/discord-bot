import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { DatabaseService } from '../../services/DatabaseService';
import { CommandContext, CommandHandler, CommandResult } from './CommandHandler';

/**
 * Command to list configured auto-channels
 * Usage: !list channels
 */
export class ListChannelsCommand extends CommandHandler {
  readonly name = 'list channels';
  readonly description = 'List all configured auto-channel templates';
  readonly requiredPermissions = [PermissionsBitField.Flags.ManageChannels];
  readonly requiresAdmin = true;

  constructor(private databaseService: DatabaseService) {
    super();
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { message, serverConfig } = context;

    try {
      const channelConfigs = await this.databaseService.getChannelConfigs(serverConfig.serverId);

      if (channelConfigs.length === 0) {
        return {
          success: true,
          message: '📋 No auto-channel templates configured.\n\n' +
                  `Use \`${serverConfig.commandPrefix}config channel\` to add one.`
        };
      }

      const embed = new EmbedBuilder()
        .setTitle('🔧 Auto-Channel Configurations')
        .setColor(0x5865F2)
        .setTimestamp();

      for (const config of channelConfigs) {
        const channel = await message.guild?.channels.fetch(config.templateChannelId).catch(() => null);
        const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
        
        const statusEmoji = config.enabled ? '✅' : '❌';
        const categoryText = config.categoryId ? `<#${config.categoryId}>` : 'Same as template';
        
        embed.addFields({
          name: `${statusEmoji} ${channelName}`,
          value: `**Pattern:** ${config.namePattern}\n` +
                `**Max Channels:** ${config.maxChannels}\n` +
                `**Empty Timeout:** ${config.emptyTimeout}min\n` +
                `**User Limit:** ${config.userLimit || 'No limit'}\n` +
                `**Category:** ${categoryText}\n` +
                `**Template ID:** \`${config.templateChannelId}\``,
          inline: true
        });
      }

      embed.setFooter({
        text: `Use ${serverConfig.commandPrefix}config channel to modify • ${serverConfig.commandPrefix}remove channel to delete`
      });

      await message.reply({ embeds: [embed] });

      return {
        success: true,
        message: '' // Message already sent via embed
      };
    } catch (error) {
      console.error('Error listing channels:', error);
      return {
        success: false,
        message: '❌ Failed to retrieve channel configurations.'
      };
    }
  }

  override getUsage(prefix: string): string {
    return `${prefix}list channels`;
  }
}
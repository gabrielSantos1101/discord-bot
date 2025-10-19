import { PermissionsBitField } from 'discord.js';
import { ServerConfig } from '../../models/ServerConfig';
import { DatabaseService } from '../../services/DatabaseService';
import { CommandContext, CommandHandler, CommandResult } from './CommandHandler';

/**
 * Command to configure server settings
 * Usage: !config server [option] [value]
 */
export class ConfigServerCommand extends CommandHandler {
  readonly name = 'config server';
  readonly description = 'Configure server-wide bot settings';
  readonly requiredPermissions = [PermissionsBitField.Flags.Administrator];
  readonly requiresAdmin = true;

  constructor(private databaseService: DatabaseService) {
    super();
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, message, serverConfig } = context;

    // If no arguments, show current configuration
    if (args.length < 3) {
      return this.showCurrentConfig(serverConfig);
    }

    const [, , option, ...values] = args;
    const value = values.join(' ');

    if (!option) {
      return {
        success: false,
        message: this.getUsageMessage(serverConfig.commandPrefix)
      };
    }

    try {
      const updatedConfig = { ...serverConfig };

      switch (option.toLowerCase()) {
        case 'prefix':
          if (!value || value.length > 5) {
            return {
              success: false,
              message: '❌ Prefix must be 1-5 characters long.'
            };
          }
          updatedConfig.commandPrefix = value;
          break;

        case 'timezone':
          // Basic timezone validation
          if (!value || value.length < 3) {
            return {
              success: false,
              message: '❌ Please provide a valid timezone (e.g., UTC, America/New_York).'
            };
          }
          updatedConfig.timezone = value;
          break;

        case 'admin-role':
          if (!value) {
            return {
              success: false,
              message: '❌ Please provide a role ID or mention.'
            };
          }
          
          // Extract role ID from mention or use as-is
          const roleId = value.replace(/[<@&>]/g, '');
          const role = await message.guild?.roles.fetch(roleId).catch(() => null);
          
          if (!role) {
            return {
              success: false,
              message: '❌ Role not found. Please provide a valid role ID or mention.'
            };
          }

          if (!updatedConfig.adminRoles.includes(roleId)) {
            updatedConfig.adminRoles.push(roleId);
          }
          break;

        case 'remove-admin-role':
          if (!value) {
            return {
              success: false,
              message: '❌ Please provide a role ID or mention to remove.'
            };
          }
          
          const removeRoleId = value.replace(/[<@&>]/g, '');
          updatedConfig.adminRoles = updatedConfig.adminRoles.filter(id => id !== removeRoleId);
          break;

        case 'api-enabled':
          const apiEnabled = value.toLowerCase() === 'true' || value === '1';
          updatedConfig.apiAccess.enabled = apiEnabled;
          break;

        case 'api-rate-limit':
          const rateLimit = parseInt(value);
          if (isNaN(rateLimit) || rateLimit < 1 || rateLimit > 10000) {
            return {
              success: false,
              message: '❌ Rate limit must be between 1 and 10000 requests per minute.'
            };
          }
          updatedConfig.apiAccess.rateLimit = rateLimit;
          break;

        case 'log-level':
          const validLevels = ['error', 'warn', 'info', 'debug'];
          if (!validLevels.includes(value.toLowerCase())) {
            return {
              success: false,
              message: `❌ Log level must be one of: ${validLevels.join(', ')}`
            };
          }
          updatedConfig.logging.level = value.toLowerCase() as any;
          break;

        case 'log-channel':
          if (!value) {
            return {
              success: false,
              message: '❌ Please provide a channel ID or mention.'
            };
          }
          
          const channelId = value.replace(/[<#>]/g, '');
          const channel = await message.guild?.channels.fetch(channelId).catch(() => null);
          
          if (!channel || !channel.isTextBased()) {
            return {
              success: false,
              message: '❌ Channel not found or is not a text channel.'
            };
          }

          if (!updatedConfig.logging.channels.includes(channelId)) {
            updatedConfig.logging.channels.push(channelId);
          }
          break;

        case 'remove-log-channel':
          if (!value) {
            return {
              success: false,
              message: '❌ Please provide a channel ID or mention to remove.'
            };
          }
          
          const removeChannelId = value.replace(/[<#>]/g, '');
          updatedConfig.logging.channels = updatedConfig.logging.channels.filter(id => id !== removeChannelId);
          break;

        case 'enabled':
          const enabled = value.toLowerCase() === 'true' || value === '1';
          updatedConfig.enabled = enabled;
          break;

        default:
          return {
            success: false,
            message: this.getUsageMessage(serverConfig.commandPrefix)
          };
      }

      // Save updated configuration
      updatedConfig.lastUpdated = new Date();
      await this.databaseService.saveServerConfig(updatedConfig);

      return {
        success: true,
        message: `✅ Server configuration updated!\n**${option}** set to: ${value || 'updated'}`
      };
    } catch (error) {
      console.error('Error updating server config:', error);
      return {
        success: false,
        message: '❌ Failed to update server configuration. Please try again.'
      };
    }
  }

  private showCurrentConfig(config: ServerConfig): CommandResult {
    const adminRoles = config.adminRoles.length > 0 
      ? config.adminRoles.map(id => `<@&${id}>`).join(', ')
      : 'None (Administrator permission required)';
    
    const logChannels = config.logging.channels.length > 0
      ? config.logging.channels.map(id => `<#${id}>`).join(', ')
      : 'None';

    const message = `🔧 **Server Configuration**\n\n` +
      `**Prefix:** \`${config.commandPrefix}\`\n` +
      `**Timezone:** ${config.timezone}\n` +
      `**Status:** ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `**Admin Roles:** ${adminRoles}\n\n` +
      `**API Settings:**\n` +
      `• Enabled: ${config.apiAccess.enabled ? '✅' : '❌'}\n` +
      `• Rate Limit: ${config.apiAccess.rateLimit} req/min\n\n` +
      `**Logging:**\n` +
      `• Level: ${config.logging.level}\n` +
      `• Channels: ${logChannels}\n` +
      `• User Activities: ${config.logging.logUserActivities ? '✅' : '❌'}\n` +
      `• Channel Operations: ${config.logging.logChannelOperations ? '✅' : '❌'}\n\n` +
      `**Auto-Channels:** ${config.autoChannels.length} configured\n\n` +
      `Use \`${config.commandPrefix}config server <option> <value>\` to modify settings.`;

    return {
      success: true,
      message
    };
  }

  private getUsageMessage(prefix: string): string {
    return `**Usage:** \`${prefix}config server [option] [value]\`\n\n` +
           `**Options:**\n` +
           `• \`prefix <new_prefix>\` - Change command prefix\n` +
           `• \`timezone <timezone>\` - Set server timezone\n` +
           `• \`admin-role <@role>\` - Add admin role\n` +
           `• \`remove-admin-role <@role>\` - Remove admin role\n` +
           `• \`api-enabled <true/false>\` - Enable/disable API\n` +
           `• \`api-rate-limit <number>\` - Set API rate limit\n` +
           `• \`log-level <error/warn/info/debug>\` - Set log level\n` +
           `• \`log-channel <#channel>\` - Add log channel\n` +
           `• \`remove-log-channel <#channel>\` - Remove log channel\n` +
           `• \`enabled <true/false>\` - Enable/disable bot\n\n` +
           `**Examples:**\n` +
           `\`${prefix}config server prefix !\`\n` +
           `\`${prefix}config server admin-role @Moderators\`\n` +
           `\`${prefix}config server log-level info\``;
  }

  override getUsage(prefix: string): string {
    return `${prefix}config server [option] [value]`;
  }
}
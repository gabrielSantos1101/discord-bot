import { EmbedBuilder } from 'discord.js';
import { CommandContext, CommandHandler, CommandResult } from './CommandHandler';

/**
 * Command to show help information
 * Usage: !help [command]
 */
export class HelpCommand extends CommandHandler {
  readonly name = 'help';
  readonly description = 'Show help information for bot commands';
  readonly requiredPermissions: bigint[] = [];
  readonly requiresAdmin = false;

  private commands: Map<string, CommandHandler> = new Map();

  constructor(commands: CommandHandler[]) {
    super();
    commands.forEach(cmd => {
      this.commands.set(cmd.name, cmd);
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, message, serverConfig } = context;

    // If specific command requested
    if (args.length > 1) {
      const commandName = args.slice(1).join(' ').toLowerCase();
      const command = this.commands.get(commandName);
      
      if (!command) {
        return {
          success: false,
          message: `❌ Command \`${commandName}\` not found.\n\nUse \`${serverConfig.commandPrefix}help\` to see all available commands.`
        };
      }

      // Check if user has permission to see this command
      const hasPermission = await command.checkPermissions(context);
      if (!hasPermission) {
        return {
          success: false,
          message: `❌ You don't have permission to use the \`${commandName}\` command.`
        };
      }

      return {
        success: true,
        message: `**${command.name}** - ${command.description}\n\n` +
                `**Usage:** \`${command.getUsage(serverConfig.commandPrefix)}\`\n\n` +
                `**Required Permissions:** ${this.getPermissionText(command)}`
      };
    }

    // Show all available commands
    const embed = new EmbedBuilder()
      .setTitle('🤖 Bot Commands')
      .setColor(0x5865F2)
      .setDescription(`Use \`${serverConfig.commandPrefix}help <command>\` for detailed information about a specific command.`)
      .setTimestamp();

    const adminCommands: string[] = [];
    const userCommands: string[] = [];

    for (const command of this.commands.values()) {
      if (command.name === 'help') continue; // Skip self

      const hasPermission = await command.checkPermissions(context);
      if (!hasPermission) continue; // Skip commands user can't use

      const commandText = `\`${command.getUsage(serverConfig.commandPrefix)}\` - ${command.description}`;
      
      if (command.requiresAdmin) {
        adminCommands.push(commandText);
      } else {
        userCommands.push(commandText);
      }
    }

    if (userCommands.length > 0) {
      embed.addFields({
        name: '📋 General Commands',
        value: userCommands.join('\n'),
        inline: false
      });
    }

    if (adminCommands.length > 0) {
      embed.addFields({
        name: '🔧 Admin Commands',
        value: adminCommands.join('\n'),
        inline: false
      });
    }

    if (userCommands.length === 0 && adminCommands.length === 0) {
      embed.setDescription('No commands available for your permission level.');
    }

    embed.setFooter({
      text: `Bot Status: ${serverConfig.enabled ? 'Enabled' : 'Disabled'} • Prefix: ${serverConfig.commandPrefix}`
    });

    await message.reply({ embeds: [embed] });

    return {
      success: true,
      message: '' // Message already sent via embed
    };
  }

  private getPermissionText(command: CommandHandler): string {
    const permissions: string[] = [];
    
    if (command.requiresAdmin) {
      permissions.push('Admin Role or Administrator');
    }
    
    if (command.requiredPermissions.length > 0) {
      // Convert permission flags to readable names
      const permNames = command.requiredPermissions.map(perm => {
        // This is a simplified mapping - in a real implementation you'd want a complete mapping
        if (perm === 8n) return 'Administrator';
        if (perm === 16n) return 'Manage Channels';
        if (perm === 32n) return 'Manage Guild';
        return `Permission ${perm}`;
      });
      permissions.push(...permNames);
    }

    return permissions.length > 0 ? permissions.join(', ') : 'None';
  }

  override getUsage(prefix: string): string {
    return `${prefix}help [command]`;
  }
}
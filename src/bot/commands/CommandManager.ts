import { Client, Message } from 'discord.js';
import { DatabaseService } from '../../services/DatabaseService';
import { CommandContext, CommandHandler } from './CommandHandler';

// Import all command handlers
import { ConfigChannelCommand } from './ConfigChannelCommand';
import { ConfigServerCommand } from './ConfigServerCommand';
import { HelpCommand } from './HelpCommand';
import { ListChannelsCommand } from './ListChannelsCommand';
import { RemoveChannelCommand } from './RemoveChannelCommand';

/**
 * Manages bot commands and handles message parsing
 */
export class CommandManager {
  private commands: Map<string, CommandHandler> = new Map();
  private client: Client;
  private databaseService: DatabaseService;

  constructor(client: Client, databaseService: DatabaseService) {
    this.client = client;
    this.databaseService = databaseService;
    this.initializeCommands();
    this.setupEventListeners();
  }

  /**
   * Initialize all command handlers
   */
  private initializeCommands(): void {
    const commandHandlers = [
      new ConfigChannelCommand(this.databaseService),
      new ListChannelsCommand(this.databaseService),
      new RemoveChannelCommand(this.databaseService),
      new ConfigServerCommand(this.databaseService)
    ];

    // Add help command with reference to all other commands
    const helpCommand = new HelpCommand(commandHandlers);

    // Register all commands including help
    const allCommands = [...commandHandlers, helpCommand];
    allCommands.forEach(command => {
      this.commands.set(command.name.toLowerCase(), command);
    });

    console.log(`Registered ${this.commands.size} bot commands`);
  }

  /**
   * Setup Discord event listeners
   */
  private setupEventListeners(): void {
    this.client.on('messageCreate', this.handleMessage.bind(this));
  }

  /**
   * Handle incoming messages and check for commands
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    try {
      // Get server configuration
      let serverConfig = await this.databaseService.getServerConfig(message.guild.id);
      
      // Create default config if none exists
      if (!serverConfig) {
        serverConfig = await this.databaseService.createDefaultServerConfig(message.guild.id);
      }

      // Check if bot is enabled for this server
      if (!serverConfig.enabled) return;

      // Check if message starts with command prefix
      if (!message.content.startsWith(serverConfig.commandPrefix)) return;

      // Parse command and arguments
      const args = message.content.slice(serverConfig.commandPrefix.length).trim().split(/\s+/);
      if (args.length === 0) return;

      // Find command handler
      const commandName = this.findCommand(args);
      if (!commandName) return;

      const command = this.commands.get(commandName);
      if (!command) return;

      // Check if user is a guild member
      if (!message.member) {
        await message.reply('❌ This command can only be used in a server.');
        return;
      }

      // Create command context
      const context: CommandContext = {
        message,
        args,
        serverConfig,
        member: message.member
      };

      // Check permissions
      const hasPermission = await command.checkPermissions(context);
      if (!hasPermission) {
        await message.reply('❌ You don\'t have permission to use this command.');
        return;
      }

      // Execute command
      const result = await command.execute(context);
      
      // Send response if there's a message
      if (result.message) {
        if (result.ephemeral) {
          // For ephemeral messages, we'll just reply normally since we're using regular messages
          await message.reply({ content: result.message, allowedMentions: { repliedUser: false } });
        } else {
          await message.reply(result.message);
        }
      }

      // Log command execution
      if (serverConfig.logging.logChannelOperations && serverConfig.logging.channels.length > 0) {
        const logMessage = `🤖 **Command Executed**\n` +
          `**User:** ${message.author.tag} (${message.author.id})\n` +
          `**Command:** \`${message.content}\`\n` +
          `**Channel:** <#${message.channel.id}>\n` +
          `**Result:** ${result.success ? '✅ Success' : '❌ Failed'}`;

        for (const channelId of serverConfig.logging.channels) {
          const logChannel = await message.guild.channels.fetch(channelId).catch(() => null);
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(logMessage).catch(console.error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling command:', error);
      
      try {
        await message.reply('❌ An error occurred while processing your command. Please try again.');
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  }

  /**
   * Find command name from arguments (supports multi-word commands)
   */
  private findCommand(args: string[]): string | null {
    // Try to match multi-word commands first (longest match)
    for (let i = args.length; i > 0; i--) {
      const commandName = args.slice(0, i).join(' ').toLowerCase();
      if (this.commands.has(commandName)) {
        return commandName;
      }
    }
    return null;
  }

  /**
   * Get all registered commands
   */
  public getCommands(): CommandHandler[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get command by name
   */
  public getCommand(name: string): CommandHandler | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Reload server configuration (called when config is updated)
   */
  public async reloadServerConfig(serverId: string): Promise<void> {
    // This method can be called by external services when configuration changes
    // to ensure the command manager uses the latest configuration
    console.log(`Reloading configuration for server ${serverId}`);
  }
}
import { GuildMember, Message, PermissionsBitField } from 'discord.js';
import { ServerConfig } from '../../models/ServerConfig';

/**
 * Interface for bot command context
 */
export interface CommandContext {
  message: Message;
  args: string[];
  serverConfig: ServerConfig;
  member: GuildMember;
}

/**
 * Interface for command execution result
 */
export interface CommandResult {
  success: boolean;
  message: string;
  ephemeral?: boolean;
}

/**
 * Base class for bot commands
 */
export abstract class CommandHandler {
  /** Command name */
  abstract readonly name: string;
  
  /** Command description */
  abstract readonly description: string;
  
  /** Required permissions to execute this command */
  abstract readonly requiredPermissions: bigint[];
  
  /** Whether this command requires admin role */
  abstract readonly requiresAdmin: boolean;

  /**
   * Execute the command
   */
  abstract execute(context: CommandContext): Promise<CommandResult>;

  /**
   * Check if user has permission to execute this command
   */
  async checkPermissions(context: CommandContext): Promise<boolean> {
    const { member, serverConfig } = context;

    // Check if command requires admin role
    if (this.requiresAdmin) {
      // Check if user has admin roles configured for the server
      if (serverConfig.adminRoles.length > 0) {
        const hasAdminRole = member.roles.cache.some(role => 
          serverConfig.adminRoles.includes(role.id)
        );
        if (!hasAdminRole) {
          return false;
        }
      } else {
        // If no admin roles configured, require Administrator permission
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return false;
        }
      }
    }

    // Check required permissions
    if (this.requiredPermissions.length > 0) {
      const hasPermissions = this.requiredPermissions.every(permission =>
        member.permissions.has(permission)
      );
      if (!hasPermissions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get usage information for this command
   */
  getUsage(prefix: string): string {
    return `${prefix}${this.name}`;
  }

  /**
   * Get help text for this command
   */
  getHelp(prefix: string): string {
    return `**${this.getUsage(prefix)}** - ${this.description}`;
  }
}
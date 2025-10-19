import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { ChannelConfig } from '../models/ChannelConfig';
import { ServerConfig } from '../models/ServerConfig';
import { validateChannelConfig, validateServerConfig } from '../models/validators/ConfigValidator';

/**
 * Database service for managing server and channel configurations
 */
export class DatabaseService {
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private dbPath: string;

  constructor(dbPath: string = './data/bot-config.db') {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create necessary database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Server configurations table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_configs (
        server_id TEXT PRIMARY KEY,
        command_prefix TEXT NOT NULL DEFAULT '!',
        enabled BOOLEAN NOT NULL DEFAULT 1,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        admin_roles TEXT NOT NULL DEFAULT '[]',
        api_access_enabled BOOLEAN NOT NULL DEFAULT 1,
        api_allowed_endpoints TEXT NOT NULL DEFAULT '[]',
        api_rate_limit INTEGER NOT NULL DEFAULT 100,
        api_allowed_ips TEXT NOT NULL DEFAULT '[]',
        logging_level TEXT NOT NULL DEFAULT 'info',
        logging_channels TEXT NOT NULL DEFAULT '[]',
        logging_user_activities BOOLEAN NOT NULL DEFAULT 0,
        logging_channel_operations BOOLEAN NOT NULL DEFAULT 1,
        last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Channel configurations table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        template_channel_id TEXT NOT NULL,
        name_pattern TEXT NOT NULL,
        max_channels INTEGER NOT NULL DEFAULT 10,
        empty_timeout INTEGER NOT NULL DEFAULT 5,
        category_id TEXT,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        user_limit INTEGER NOT NULL DEFAULT 0,
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES server_configs (server_id) ON DELETE CASCADE,
        UNIQUE(server_id, template_channel_id)
      )
    `);

    // Create indexes for better performance
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_server_configs_server_id ON server_configs(server_id);
      CREATE INDEX IF NOT EXISTS idx_channel_configs_server_id ON channel_configs(server_id);
      CREATE INDEX IF NOT EXISTS idx_channel_configs_template_id ON channel_configs(template_channel_id);
    `);
  }

  /**
   * Get server configuration by server ID
   */
  async getServerConfig(serverId: string): Promise<ServerConfig | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const row = await this.db.get(`
        SELECT * FROM server_configs WHERE server_id = ?
      `, serverId);

      if (!row) return null;

      const config: ServerConfig = {
        serverId: row.server_id,
        commandPrefix: row.command_prefix,
        enabled: Boolean(row.enabled),
        timezone: row.timezone,
        adminRoles: JSON.parse(row.admin_roles),
        apiAccess: {
          enabled: Boolean(row.api_access_enabled),
          allowedEndpoints: JSON.parse(row.api_allowed_endpoints),
          rateLimit: row.api_rate_limit,
          allowedIPs: JSON.parse(row.api_allowed_ips)
        },
        logging: {
          level: row.logging_level as any,
          channels: JSON.parse(row.logging_channels),
          logUserActivities: Boolean(row.logging_user_activities),
          logChannelOperations: Boolean(row.logging_channel_operations)
        },
        autoChannels: await this.getChannelConfigs(serverId),
        lastUpdated: new Date(row.last_updated)
      };

      return config;
    } catch (error) {
      console.error('Error getting server config:', error);
      throw error;
    }
  }

  /**
   * Save or update server configuration
   */
  async saveServerConfig(config: ServerConfig): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Validate configuration
    const errors = validateServerConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid server config: ${errors.map(e => e.message).join(', ')}`);
    }

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO server_configs (
          server_id, command_prefix, enabled, timezone, admin_roles,
          api_access_enabled, api_allowed_endpoints, api_rate_limit, api_allowed_ips,
          logging_level, logging_channels, logging_user_activities, logging_channel_operations,
          last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        config.serverId,
        config.commandPrefix,
        config.enabled ? 1 : 0,
        config.timezone,
        JSON.stringify(config.adminRoles),
        config.apiAccess.enabled ? 1 : 0,
        JSON.stringify(config.apiAccess.allowedEndpoints),
        config.apiAccess.rateLimit,
        JSON.stringify(config.apiAccess.allowedIPs),
        config.logging.level,
        JSON.stringify(config.logging.channels),
        config.logging.logUserActivities ? 1 : 0,
        config.logging.logChannelOperations ? 1 : 0
      ]);

      // Save channel configurations
      await this.saveChannelConfigs(config.serverId, config.autoChannels);
    } catch (error) {
      console.error('Error saving server config:', error);
      throw error;
    }
  }

  /**
   * Get channel configurations for a server
   */
  async getChannelConfigs(serverId: string): Promise<ChannelConfig[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all(`
        SELECT * FROM channel_configs WHERE server_id = ? ORDER BY created_at
      `, serverId);

      return rows.map(row => ({
        templateChannelId: row.template_channel_id,
        serverId: row.server_id,
        namePattern: row.name_pattern,
        maxChannels: row.max_channels,
        emptyTimeout: row.empty_timeout,
        categoryId: row.category_id,
        enabled: Boolean(row.enabled),
        userLimit: row.user_limit,
        permissions: JSON.parse(row.permissions)
      }));
    } catch (error) {
      console.error('Error getting channel configs:', error);
      throw error;
    }
  }

  /**
   * Save channel configurations for a server
   */
  async saveChannelConfigs(serverId: string, configs: ChannelConfig[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Start transaction
      await this.db.run('BEGIN TRANSACTION');

      // Delete existing configurations for this server
      await this.db.run('DELETE FROM channel_configs WHERE server_id = ?', serverId);

      // Insert new configurations
      for (const config of configs) {
        // Validate configuration
        const errors = validateChannelConfig(config);
        if (errors.length > 0) {
          throw new Error(`Invalid channel config: ${errors.map(e => e.message).join(', ')}`);
        }

        await this.db.run(`
          INSERT INTO channel_configs (
            server_id, template_channel_id, name_pattern, max_channels, empty_timeout,
            category_id, enabled, user_limit, permissions, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          config.serverId,
          config.templateChannelId,
          config.namePattern,
          config.maxChannels,
          config.emptyTimeout,
          config.categoryId || null,
          config.enabled ? 1 : 0,
          config.userLimit,
          JSON.stringify(config.permissions)
        ]);
      }

      // Commit transaction
      await this.db.run('COMMIT');
    } catch (error) {
      // Rollback on error
      await this.db.run('ROLLBACK');
      console.error('Error saving channel configs:', error);
      throw error;
    }
  }

  /**
   * Get a specific channel configuration
   */
  async getChannelConfig(serverId: string, templateChannelId: string): Promise<ChannelConfig | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const row = await this.db.get(`
        SELECT * FROM channel_configs 
        WHERE server_id = ? AND template_channel_id = ?
      `, serverId, templateChannelId);

      if (!row) return null;

      return {
        templateChannelId: row.template_channel_id,
        serverId: row.server_id,
        namePattern: row.name_pattern,
        maxChannels: row.max_channels,
        emptyTimeout: row.empty_timeout,
        categoryId: row.category_id,
        enabled: Boolean(row.enabled),
        userLimit: row.user_limit,
        permissions: JSON.parse(row.permissions)
      };
    } catch (error) {
      console.error('Error getting channel config:', error);
      throw error;
    }
  }

  /**
   * Delete a channel configuration
   */
  async deleteChannelConfig(serverId: string, templateChannelId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        DELETE FROM channel_configs 
        WHERE server_id = ? AND template_channel_id = ?
      `, serverId, templateChannelId);
    } catch (error) {
      console.error('Error deleting channel config:', error);
      throw error;
    }
  }

  /**
   * Get all server IDs that have configurations
   */
  async getAllServerIds(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all('SELECT server_id FROM server_configs');
      return rows.map(row => row.server_id);
    } catch (error) {
      console.error('Error getting server IDs:', error);
      throw error;
    }
  }

  /**
   * Create default server configuration
   */
  async createDefaultServerConfig(serverId: string): Promise<ServerConfig> {
    const defaultConfig: ServerConfig = {
      serverId,
      commandPrefix: '!',
      enabled: true,
      timezone: 'UTC',
      adminRoles: [],
      apiAccess: {
        enabled: true,
        allowedEndpoints: ['/api/users/*', '/api/channels/*'],
        rateLimit: 100,
        allowedIPs: []
      },
      logging: {
        level: 'info',
        channels: [],
        logUserActivities: false,
        logChannelOperations: true
      },
      autoChannels: [],
      lastUpdated: new Date()
    };

    await this.saveServerConfig(defaultConfig);
    return defaultConfig;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
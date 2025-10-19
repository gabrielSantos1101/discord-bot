import { Pool } from 'pg';
import { ChannelConfig } from '../models/ChannelConfig';
import { ServerConfig } from '../models/ServerConfig';
import { validateChannelConfig, validateServerConfig } from '../models/validators/ConfigValidator';
import { logger } from '../utils/logger';

/**
 * Database service for managing server and channel configurations using PostgreSQL
 */
export class DatabaseService {
  private pool: Pool | null = null;
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || process.env['DATABASE_URL'] || '';
    if (!this.connectionString) {
      throw new Error('Database connection string is required');
    }
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();

      await this.createTables();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', {
        operation: 'database_init_error',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * Create database tables if they don't exist
   */
  private async createTables(): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      // Server configurations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS server_configs (
          server_id VARCHAR(20) PRIMARY KEY,
          command_prefix VARCHAR(5) NOT NULL DEFAULT '!',
          enabled BOOLEAN NOT NULL DEFAULT true,
          timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
          admin_roles JSONB NOT NULL DEFAULT '[]',
          api_access_enabled BOOLEAN NOT NULL DEFAULT true,
          api_allowed_endpoints JSONB NOT NULL DEFAULT '[]',
          api_rate_limit INTEGER NOT NULL DEFAULT 100,
          api_allowed_ips JSONB NOT NULL DEFAULT '[]',
          logging_level VARCHAR(20) NOT NULL DEFAULT 'info',
          logging_channels JSONB NOT NULL DEFAULT '[]',
          logging_user_activities BOOLEAN NOT NULL DEFAULT false,
          logging_channel_operations BOOLEAN NOT NULL DEFAULT true,
          last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Channel configurations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS channel_configs (
          id SERIAL PRIMARY KEY,
          server_id VARCHAR(20) NOT NULL,
          template_channel_id VARCHAR(20) NOT NULL,
          name_pattern VARCHAR(100) NOT NULL,
          max_channels INTEGER NOT NULL DEFAULT 10,
          empty_timeout INTEGER NOT NULL DEFAULT 5,
          category_id VARCHAR(20),
          enabled BOOLEAN NOT NULL DEFAULT true,
          user_limit INTEGER NOT NULL DEFAULT 0,
          permissions JSONB NOT NULL DEFAULT '[]',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES server_configs (server_id) ON DELETE CASCADE,
          UNIQUE(server_id, template_channel_id)
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_server_configs_server_id ON server_configs(server_id);
        CREATE INDEX IF NOT EXISTS idx_channel_configs_server_id ON channel_configs(server_id);
        CREATE INDEX IF NOT EXISTS idx_channel_configs_template_id ON channel_configs(template_channel_id);
      `);

      logger.info('Database tables created successfully', {
        operation: 'create_tables_success'
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get server configuration by server ID
   */
  async getServerConfig(serverId: string): Promise<ServerConfig | null> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM server_configs WHERE server_id = $1
      `, [serverId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        serverId: row.server_id,
        commandPrefix: row.command_prefix,
        enabled: row.enabled,
        timezone: row.timezone,
        adminRoles: row.admin_roles || [],
        apiAccess: {
          enabled: row.api_access_enabled,
          allowedEndpoints: row.api_allowed_endpoints || [],
          rateLimit: row.api_rate_limit,
          allowedIPs: row.api_allowed_ips || []
        },
        logging: {
          level: row.logging_level,
          channels: row.logging_channels || [],
          logUserActivities: row.logging_user_activities,
          logChannelOperations: row.logging_channel_operations
        },
        autoChannels: [],
        lastUpdated: row.last_updated
      };
    } finally {
      client.release();
    }
  }  /**
 
  * Save server configuration
   */
  async saveServerConfig(config: ServerConfig): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    // Validate configuration
    const validation = validateServerConfig(config);
    if (validation.length > 0) {
      throw new Error(`Invalid server configuration: ${validation.map(v => v.message).join(', ')}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO server_configs (
          server_id, command_prefix, enabled, timezone, admin_roles,
          api_access_enabled, api_allowed_endpoints, api_rate_limit, api_allowed_ips,
          logging_level, logging_channels, logging_user_activities, logging_channel_operations,
          last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (server_id) DO UPDATE SET
          command_prefix = EXCLUDED.command_prefix,
          enabled = EXCLUDED.enabled,
          timezone = EXCLUDED.timezone,
          admin_roles = EXCLUDED.admin_roles,
          api_access_enabled = EXCLUDED.api_access_enabled,
          api_allowed_endpoints = EXCLUDED.api_allowed_endpoints,
          api_rate_limit = EXCLUDED.api_rate_limit,
          api_allowed_ips = EXCLUDED.api_allowed_ips,
          logging_level = EXCLUDED.logging_level,
          logging_channels = EXCLUDED.logging_channels,
          logging_user_activities = EXCLUDED.logging_user_activities,
          logging_channel_operations = EXCLUDED.logging_channel_operations,
          last_updated = EXCLUDED.last_updated
      `, [
        config.serverId,
        config.commandPrefix,
        config.enabled,
        config.timezone,
        JSON.stringify(config.adminRoles),
        config.apiAccess.enabled,
        JSON.stringify(config.apiAccess.allowedEndpoints),
        config.apiAccess.rateLimit,
        JSON.stringify(config.apiAccess.allowedIPs),
        config.logging.level,
        JSON.stringify(config.logging.channels),
        config.logging.logUserActivities,
        config.logging.logChannelOperations,
        new Date()
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Get all channel configurations for a server
   */
  async getChannelConfigs(serverId: string): Promise<ChannelConfig[]> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM channel_configs WHERE server_id = $1 ORDER BY created_at
      `, [serverId]);

      return result.rows.map(row => ({
        templateChannelId: row.template_channel_id,
        serverId: row.server_id,
        namePattern: row.name_pattern,
        maxChannels: row.max_channels,
        emptyTimeout: row.empty_timeout,
        categoryId: row.category_id,
        enabled: row.enabled,
        userLimit: row.user_limit,
        permissions: row.permissions || []
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Save channel configurations for a server
   */
  async saveChannelConfigs(serverId: string, configs: ChannelConfig[]): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      // Start transaction
      await client.query('BEGIN');

      // Delete existing configurations for this server
      await client.query('DELETE FROM channel_configs WHERE server_id = $1', [serverId]);

      // Insert new configurations
      for (const config of configs) {
        // Validate configuration
        const validation = validateChannelConfig(config);
        if (validation.length > 0) {
          throw new Error(`Invalid channel configuration: ${validation.map(v => v.message).join(', ')}`);
        }

        await client.query(`
          INSERT INTO channel_configs (
            server_id, template_channel_id, name_pattern, max_channels, empty_timeout,
            category_id, enabled, user_limit, permissions, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          serverId,
          config.templateChannelId,
          config.namePattern,
          config.maxChannels,
          config.emptyTimeout,
          config.categoryId,
          config.enabled,
          config.userLimit,
          JSON.stringify(config.permissions),
          new Date(),
          new Date()
        ]);
      }

      // Commit transaction
      await client.query('COMMIT');
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      logger.error('Error saving channel configs:', {
        operation: 'save_channel_configs_error',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get specific channel configuration
   */
  async getChannelConfig(serverId: string, templateChannelId: string): Promise<ChannelConfig | null> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM channel_configs 
        WHERE server_id = $1 AND template_channel_id = $2
      `, [serverId, templateChannelId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        templateChannelId: row.template_channel_id,
        serverId: row.server_id,
        namePattern: row.name_pattern,
        maxChannels: row.max_channels,
        emptyTimeout: row.empty_timeout,
        categoryId: row.category_id,
        enabled: row.enabled,
        userLimit: row.user_limit,
        permissions: row.permissions || []
      };
    } finally {
      client.release();
    }
  }

  /**
   * Delete channel configuration
   */
  async deleteChannelConfig(serverId: string, templateChannelId: string): Promise<void> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      await client.query(`
        DELETE FROM channel_configs 
        WHERE server_id = $1 AND template_channel_id = $2
      `, [serverId, templateChannelId]);
    } finally {
      client.release();
    }
  }

  /**
   * Get all server IDs
   */
  async getAllServerIds(): Promise<string[]> {
    if (!this.pool) throw new Error('Database not initialized');

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT server_id FROM server_configs');
      return result.rows.map(row => row.server_id);
    } catch (error) {
      logger.error('Error getting all server IDs:', {
        operation: 'get_all_server_ids_error',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      client.release();
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
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
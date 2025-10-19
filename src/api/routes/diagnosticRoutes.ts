import { Request, Response, Router } from 'express';
import { DiscordBotService } from '../../bot/services/DiscordBotService';
import { logger } from '../../utils/logger';

/**
 * Diagnostic routes for monitoring bot health and presence functionality
 */
export function createDiagnosticRoutes(discordBotService: DiscordBotService): Router {
  const router = Router();

  /**
   * GET /api/diagnostics - Run complete diagnostic check
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      logger.info('Diagnostic check requested', {
        component: 'DiagnosticAPI',
        operation: 'diagnostics_request',
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      const diagnosticService = discordBotService.getDiagnosticService();
      if (!diagnosticService) {
        return res.status(503).json({
          error: 'Diagnostic service not available',
          message: 'Bot service is not fully initialized'
        });
      }

      const report = await diagnosticService.runDiagnosticsWithAlerts();

      return res.json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Diagnostic check failed', {
        component: 'DiagnosticAPI',
        operation: 'diagnostics_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Diagnostic check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/diagnostics/errors - Get presence error statistics
   */
  router.get('/errors', async (_req: Request, res: Response) => {
    try {
      const errorHandler = discordBotService.getPresenceErrorHandler();
      const stats = errorHandler.getErrorStats();
      const summary = errorHandler.getErrorSummary();

      return res.json({
        success: true,
        data: {
          stats,
          summary
        }
      });

    } catch (error) {
      logger.error('Error statistics request failed', {
        component: 'DiagnosticAPI',
        operation: 'error_stats'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get error statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/diagnostics/errors/reset - Reset error statistics
   */
  router.post('/errors/reset', async (req: Request, res: Response) => {
    try {
      const errorHandler = discordBotService.getPresenceErrorHandler();
      errorHandler.resetStats();

      logger.info('Error statistics reset', {
        component: 'DiagnosticAPI',
        operation: 'error_stats_reset',
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      return res.json({
        success: true,
        message: 'Error statistics reset successfully'
      });

    } catch (error) {
      logger.error('Error statistics reset failed', {
        component: 'DiagnosticAPI',
        operation: 'error_stats_reset'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to reset error statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/diagnostics/sync - Get presence sync metrics
   */
  router.get('/sync', async (_req: Request, res: Response) => {
    try {
      const syncService = discordBotService.getPresenceSyncService();
      if (!syncService) {
        return res.status(503).json({
          error: 'Presence sync service not available',
          message: 'Bot service is not fully initialized'
        });
      }

      const metrics = syncService.getMetrics();
      const status = syncService.getStatus();
      const config = syncService.getConfig();

      return res.json({
        success: true,
        data: {
          metrics,
          status,
          config
        }
      });

    } catch (error) {
      logger.error('Sync metrics request failed', {
        component: 'DiagnosticAPI',
        operation: 'sync_metrics'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get sync metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/diagnostics/sync/force - Force a manual presence synchronization
   */
  router.post('/sync/force', async (req: Request, res: Response) => {
    try {
      const syncService = discordBotService.getPresenceSyncService();
      if (!syncService) {
        return res.status(503).json({
          error: 'Presence sync service not available',
          message: 'Bot service is not fully initialized'
        });
      }

      logger.info('Manual sync requested', {
        component: 'DiagnosticAPI',
        operation: 'manual_sync',
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      const metrics = await syncService.forcSync();

      return res.json({
        success: true,
        message: 'Manual synchronization completed',
        data: metrics
      });

    } catch (error) {
      logger.error('Manual sync failed', {
        component: 'DiagnosticAPI',
        operation: 'manual_sync'
      }, error as Error);

      return res.status(500).json({
        error: 'Manual synchronization failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/diagnostics/intents - Check specific intent status
   */
  router.get('/intents/:intent', async (req: Request, res: Response) => {
    try {
      const intent = req.params['intent'];
      if (!intent) {
        return res.status(400).json({
          error: 'Intent parameter is required'
        });
      }

      const diagnosticService = discordBotService.getDiagnosticService();
      
      if (!diagnosticService) {
        return res.status(503).json({
          error: 'Diagnostic service not available',
          message: 'Bot service is not fully initialized'
        });
      }

      // Map intent names to GatewayIntentBits values
      const intentMap: Record<string, number> = {
        'guilds': 1,
        'guild_members': 2,
        'guild_bans': 4,
        'guild_emojis_and_stickers': 8,
        'guild_integrations': 16,
        'guild_webhooks': 32,
        'guild_invites': 64,
        'guild_voice_states': 128,
        'guild_presences': 256,
        'guild_messages': 512,
        'guild_message_reactions': 1024,
        'guild_message_typing': 2048,
        'direct_messages': 4096,
        'direct_message_reactions': 8192,
        'direct_message_typing': 16384,
        'message_content': 32768
      };

      const intentValue = intentMap[intent.toLowerCase()];
      if (!intentValue) {
        return res.status(400).json({
          error: 'Invalid intent name',
          message: `Intent '${intent}' is not recognized`,
          availableIntents: Object.keys(intentMap)
        });
      }

      const hasIntent = await diagnosticService.checkIntent(intentValue);

      return res.json({
        success: true,
        data: {
          intent: intent,
          enabled: hasIntent,
          value: intentValue
        }
      });

    } catch (error) {
      logger.error('Intent check failed', {
        component: 'DiagnosticAPI',
        operation: 'intent_check',
        metadata: { intent: req.params['intent'] }
      }, error as Error);

      return res.status(500).json({
        error: 'Intent check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/diagnostics/recovery/:errorType - Get recovery suggestions for error type
   */
  router.get('/recovery/:errorType', async (req: Request, res: Response) => {
    try {
      const errorType = req.params['errorType'];
      if (!errorType) {
        return res.status(400).json({
          error: 'Error type parameter is required'
        });
      }

      const errorHandler = discordBotService.getPresenceErrorHandler();
      
      // Validate error type
      const validErrorTypes = [
        'intent_missing', 'intent_disabled', 'cache_unavailable', 'event_processing',
        'data_transformation', 'sync_failure', 'rate_limit', 'permission_denied',
        'network_error', 'unknown'
      ];

      if (!validErrorTypes.includes(errorType)) {
        return res.status(400).json({
          error: 'Invalid error type',
          message: `Error type '${errorType}' is not recognized`,
          availableTypes: validErrorTypes
        });
      }

      const suggestions = errorHandler.getRecoverySuggestions(errorType as any);

      return res.json({
        success: true,
        data: {
          errorType: errorType,
          suggestions
        }
      });

    } catch (error) {
      logger.error('Recovery suggestions request failed', {
        component: 'DiagnosticAPI',
        operation: 'recovery_suggestions',
        metadata: { errorType: req.params['errorType'] }
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get recovery suggestions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}
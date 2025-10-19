import type { CacheConfig } from '../utils/config';
import { CacheService } from './CacheService';

/**
 * Factory for creating and managing CacheService instances
 */
export class CacheServiceFactory {
  private static instance: CacheService | null = null;

  /**
   * Create or get existing CacheService instance
   */
  static async create(config: CacheConfig): Promise<CacheService> {
    if (!CacheServiceFactory.instance) {
      CacheServiceFactory.instance = new CacheService(config);
      await CacheServiceFactory.instance.initialize();
    }
    return CacheServiceFactory.instance;
  }

  /**
   * Get existing CacheService instance
   */
  static getInstance(): CacheService | null {
    return CacheServiceFactory.instance;
  }

  /**
   * Close and reset the CacheService instance
   */
  static async close(): Promise<void> {
    if (CacheServiceFactory.instance) {
      await CacheServiceFactory.instance.close();
      CacheServiceFactory.instance = null;
    }
  }
}
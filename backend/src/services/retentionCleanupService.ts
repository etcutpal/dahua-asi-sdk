/**
 * retentionCleanupService.ts
 *
 * Runs a daily cron job that reads dbRetentionMonths from general-settings.json
 * and deletes access records older than the configured retention window via the
 * repository layer (works for both JSON-file and SQL backends).
 *
 * Register with: retentionCleanupService.start()  inside startServer().
 */

import cron from 'node-cron';
import logger from '../utils/logger';
import { RepositoryFactory } from '../repositories/RepositoryFactory';
import { loadRetentionMonths } from '../routes/database-settings';

function getRetentionMonths(): number {
  return loadRetentionMonths();
}

async function runCleanup(): Promise<void> {
  const months = getRetentionMonths();

  if (months === 0) {
    logger.info('[Retention] dbRetentionMonths = 0 — keeping all records forever, skipping cleanup.');
    return;
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  logger.info(`[Retention] Starting cleanup — deleting records older than ${cutoff.toISOString()} (${months} month(s))`);

  try {
    const repo = RepositoryFactory.accessRecords();
    const deleted = await repo.deleteOlderThan(cutoff);
    if (deleted > 0) {
      logger.info(`[Retention] Removed ${deleted} access record(s)`);
    } else {
      logger.info(`[Retention] Nothing to delete — all records are within the retention window`);
    }
  } catch (err: any) {
    logger.error(`[Retention] Cleanup failed: ${err.message}`);
  }
}

const retentionCleanupService = {
  /** Run cleanup immediately, then schedule daily at 02:00. */
  start(): void {
    // Run once at startup (in background — don't block server start)
    setImmediate(() => {
      runCleanup().catch((e: any) =>
        logger.warn(`[Retention] Initial cleanup error: ${e.message}`)
      );
    });

    // Schedule: every day at 02:00 AM
    cron.schedule('0 2 * * *', () => {
      runCleanup().catch((e: any) =>
        logger.error(`[Retention] Scheduled cleanup error: ${e.message}`)
      );
    });

    logger.info('[Retention] Cleanup scheduler started — runs daily at 02:00 AM');
  },

  /** Trigger a cleanup run manually (e.g. when settings are saved). */
  runNow(): Promise<void> {
    return runCleanup();
  },
};

export default retentionCleanupService;

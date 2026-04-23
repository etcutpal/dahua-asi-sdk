import { Router, Request, Response } from 'express';
import offlineRecordFetchService from '../services/offlineRecordFetchService';
import logger from '../utils/logger';

const router = Router();

// GET /api/settings/auto-fetch
router.get('/auto-fetch', async (req: Request, res: Response) => {
  try {
    const config = offlineRecordFetchService.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('Error getting auto-fetch settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/settings/auto-fetch
router.put('/auto-fetch', async (req: Request, res: Response) => {
  try {
    const { enabled, delaySeconds, offsetBeforeOfflineSeconds } = req.body;
    const updates: Record<string, any> = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof delaySeconds === 'number') updates.delaySeconds = delaySeconds;
    if (typeof offsetBeforeOfflineSeconds === 'number') updates.offsetBeforeOfflineSeconds = offsetBeforeOfflineSeconds;

    offlineRecordFetchService.saveConfig(updates);
    const config = offlineRecordFetchService.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('Error saving auto-fetch settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

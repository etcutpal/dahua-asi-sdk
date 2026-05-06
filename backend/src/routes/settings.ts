import { Router, Request, Response } from 'express';
import offlineRecordFetchService from '../services/offlineRecordFetchService';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

// ── General Settings helpers ──────────────────────────────────────────────────
const GENERAL_SETTINGS_PATH = path.join(__dirname, '..', '..', 'data', 'general-settings.json');

const GENERAL_SETTINGS_DEFAULTS = {
  companyName: '',
  language: 'en',
  timeZone: 'Asia/Dhaka',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  theme: 'light',
};

function loadGeneralSettings(): typeof GENERAL_SETTINGS_DEFAULTS {
  try {
    if (fs.existsSync(GENERAL_SETTINGS_PATH)) {
      const raw = fs.readFileSync(GENERAL_SETTINGS_PATH, 'utf-8');
      return { ...GENERAL_SETTINGS_DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // fall through to defaults
  }
  return { ...GENERAL_SETTINGS_DEFAULTS };
}

function saveGeneralSettings(data: Partial<typeof GENERAL_SETTINGS_DEFAULTS>): typeof GENERAL_SETTINGS_DEFAULTS {
  const current = loadGeneralSettings();
  const updated = { ...current, ...data };
  const dir = path.dirname(GENERAL_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GENERAL_SETTINGS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

const router = Router();

// GET /api/settings/general
router.get('/general', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, settings: loadGeneralSettings() });
  } catch (error: any) {
    logger.error('Error getting general settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/settings/general
router.put('/general', (req: Request, res: Response) => {
  try {
    const allowed = ['companyName', 'language', 'timeZone', 'dateFormat', 'timeFormat', 'theme'];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (key in req.body) patch[key] = req.body[key];
    }
    const settings = saveGeneralSettings(patch);
    res.json({ success: true, settings });
  } catch (error: any) {
    logger.error('Error saving general settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


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

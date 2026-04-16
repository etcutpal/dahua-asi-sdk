import express, { Request, Response } from 'express';
import netSdkService from '../services/netSdkService';
import logger from '../utils/logger';

const router = express.Router();

// Start Auto Registration Server
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { port } = req.body;
    const result = await netSdkService.startAutoReg(port || 9500);
    res.json(result);
  } catch (error: any) {
    logger.error('Error starting Auto Registration:', error);
    res.status(500).json({ error: error.message || 'Failed to start Auto Registration' });
  }
});

// Stop Auto Registration Server
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const result = await netSdkService.stopAutoReg();
    res.json(result);
  } catch (error: any) {
    logger.error('Error stopping Auto Registration:', error);
    res.status(500).json({ error: error.message || 'Failed to stop Auto Registration' });
  }
});

// Get Auto Registration status
router.get('/status', (req: Request, res: Response) => {
  // This would check the actual status from the bridge
  res.json({
    running: true,
    port: 9500,
    message: 'Auto Registration Server status',
  });
});

export default router;

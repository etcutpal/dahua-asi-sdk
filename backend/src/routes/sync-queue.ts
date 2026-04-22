import express, { Request, Response } from 'express';
import syncQueueService from '../services/syncQueue.service';

const router = express.Router();

// GET all jobs (with optional filters: ?status=failed&ruleId=xxx)
router.get('/', (req: Request, res: Response) => {
  let jobs = syncQueueService.getJobs();
  const { status, ruleId, deviceId } = req.query as Record<string, string>;
  if (status) jobs = jobs.filter(j => j.status === status);
  if (ruleId) jobs = jobs.filter(j => j.ruleId === ruleId);
  if (deviceId) jobs = jobs.filter(j => j.deviceId === deviceId);
  // Most recent first
  jobs = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, jobs, summary: syncQueueService.getSummary() });
});

// GET summary only
router.get('/summary', (_req: Request, res: Response) => {
  res.json({ success: true, summary: syncQueueService.getSummary() });
});

// POST retry a failed job
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    await syncQueueService.retryJob(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// POST retry ALL failed jobs
router.post('/retry-all-failed', async (_req: Request, res: Response) => {
  const jobs = syncQueueService.getJobs().filter(j => j.status === 'failed');
  for (const job of jobs) {
    await syncQueueService.retryJob(job.id);
  }
  res.json({ success: true, retried: jobs.length });
});

// DELETE a job
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await syncQueueService.deleteJob(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

export default router;

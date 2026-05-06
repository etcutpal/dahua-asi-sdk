import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

const router = Router();

// __dirname = backend/src/routes  →  3 levels up = project root
const ROOT = path.resolve(__dirname, '../../..');
const SHARED_CONFIG_PATH = path.join(ROOT, 'shared', 'server.config.json');
const FRONTEND_CONFIG_PATH = path.join(ROOT, 'frontend', 'public', 'config.json');
const BACKEND_ENV_PATH = path.join(ROOT, 'backend', '.env');

const BRIDGE_URL = process.env.NETSDK_BRIDGE_URL || 'http://localhost:5000';

function readSharedConfig(): any {
  try {
    return JSON.parse(fs.readFileSync(SHARED_CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeSharedConfig(config: any): void {
  fs.writeFileSync(SHARED_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function writeFrontendConfig(config: any): void {
  try {
    fs.writeFileSync(FRONTEND_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Could not write frontend config.json:', err);
  }
}

function writeBackendEnv(config: any): void {
  try {
    const { ports, network } = config;
    const content = [
      `PORT=${ports.backend}`,
      `HOST=${network.bindHost || '0.0.0.0'}`,
      `NETSDK_BRIDGE_URL=http://localhost:${ports.bridge}`,
      `FRONTEND_URL=http://localhost:${ports.frontend}`,
      `SERVER_IP=${network.deviceRegistrationIp}`,
    ].join('\n') + '\n';
    fs.writeFileSync(BACKEND_ENV_PATH, content, 'utf-8');
  } catch (err) {
    console.error('Could not write backend/.env:', err);
  }
}

// GET /api/system/config
router.get('/config', (req: Request, res: Response) => {
  const config = readSharedConfig();
  if (!config) {
    return res.status(500).json({ error: 'Could not read server.config.json' });
  }
  res.json(config);
});

// POST /api/system/config
router.post('/config', async (req: Request, res: Response) => {
  const existing = readSharedConfig();
  if (!existing) {
    return res.status(500).json({ error: 'Could not read server.config.json' });
  }

  // Deep merge incoming body with existing config
  const updated = {
    ports: { ...existing.ports, ...req.body.ports },
    network: { ...existing.network, ...req.body.network },
    bridge: { ...existing.bridge, ...req.body.bridge },
  };

  // Write all config files
  writeSharedConfig(updated);
  writeBackendEnv(updated);

  // Sync frontend/public/config.json
  const { localAccessIp, deviceRegistrationIp, publicAccessEnabled, publicAccessIp } = updated.network;
  const backendPort = updated.ports.backend;
  writeFrontendConfig({
    localApiUrl: `http://${localAccessIp}:${backendPort}`,
    publicApiUrl: publicAccessEnabled && publicAccessIp ? `http://${publicAccessIp}:${backendPort}` : '',
    publicEnabled: publicAccessEnabled,
  });

  const portsChanged =
    req.body.ports &&
    Object.keys(req.body.ports).some((k) => (req.body.ports as any)[k] !== (existing.ports as any)[k]);

  const deviceIpChanged =
    req.body.network?.deviceRegistrationIp &&
    req.body.network.deviceRegistrationIp !== existing.network.deviceRegistrationIp;

  const autoRegPort = updated.ports.autoReg;

  // If device registration IP changed — full SDK restart so devices reconnect fresh
  if (deviceIpChanged) {
    try {
      // 1. Full SDK cleanup: logs out all devices, stops listeners, stops auto-reg
      await axios.post(`${BRIDGE_URL}/api/sdk/cleanup`);
      // 2. Update the IP the auto-reg will bind to
      await axios.post(`${BRIDGE_URL}/api/autoreg/setip`, { ip: deviceRegistrationIp });
      // 3. Re-initialise the SDK
      await axios.post(`${BRIDGE_URL}/api/sdk/init`);
      // 4. Restart auto-reg on new IP — devices will reconnect and show actual status
      await axios.post(`${BRIDGE_URL}/api/autoreg/start`, { port: autoRegPort });
    } catch (err: any) {
      return res.json({
        success: true,
        restartRequired: true,
        message: `Configuration saved. Restart required to apply new Device Registration IP (${deviceRegistrationIp}).`,
      });
    }
  }

  res.json({
    success: true,
    restartRequired: portsChanged,
    message: portsChanged
      ? 'Configuration saved. A service restart is required for port changes to take effect.'
      : 'Configuration saved successfully.',
  });
});

// GET /api/system/network-interfaces
router.get('/network-interfaces', (req: Request, res: Response) => {
  const ifaces = os.networkInterfaces();
  const result: { name: string; address: string }[] = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push({ name, address: addr.address });
      }
    }
  }

  // No loopback — 127.0.0.1 is never a valid advertised address

  res.json(result);
});

// POST /api/system/backup — TODO (Task 13): Export all data as a downloadable ZIP
// When implemented, this will zip backend/data/*.json and return it as a download.
router.post('/backup', (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: 'Backup not yet implemented. Please export records from the Access Records and Attendance pages for now.' });
});

export default router;

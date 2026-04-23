#!/usr/bin/env node
/**
 * bootstrap.js — Startup orchestrator for AccessPro
 * Reads shared/server.config.json, writes per-service env files,
 * then spawns the bridge, backend, and frontend processes.
 *
 * Usage:  node shared/bootstrap.js [--no-frontend] [--no-bridge]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'shared', 'server.config.json');

// ── Load config ────────────────────────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  console.log('✅ Loaded shared/server.config.json');
} catch (err) {
  console.error('❌ Cannot read shared/server.config.json:', err.message);
  process.exit(1);
}

const { ports, network, bridge } = config;

// ── Write backend/.env ─────────────────────────────────────────────────────
const backendEnv = `PORT=${ports.backend}
HOST=${network.bindHost || '0.0.0.0'}
NETSDK_BRIDGE_URL=http://localhost:${ports.bridge}
FRONTEND_URL=http://localhost:${ports.frontend}
SERVER_IP=${network.deviceRegistrationIp}
`;
const backendEnvPath = path.join(ROOT, 'backend', '.env');
fs.writeFileSync(backendEnvPath, backendEnv, 'utf-8');
console.log(`✅ Wrote backend/.env  (port ${ports.backend})`);

// ── Write frontend/.env.local ──────────────────────────────────────────────
const frontendEnvLocal = `BACKEND_PORT=${ports.backend}
NEXT_PUBLIC_FRONTEND_PORT=${ports.frontend}
`;
const frontendEnvPath = path.join(ROOT, 'frontend', '.env.local');
fs.writeFileSync(frontendEnvPath, frontendEnvLocal, 'utf-8');
console.log(`✅ Wrote frontend/.env.local  (backend port ${ports.backend})`);

// ── Write frontend/public/config.json ──────────────────────────────────────
const publicConfig = {
  localApiUrl: `http://${network.localAccessIp}:${ports.backend}`,
  publicApiUrl:
    network.publicAccessEnabled && network.publicAccessIp
      ? `http://${network.publicAccessIp}:${ports.backend}`
      : '',
  publicEnabled: !!network.publicAccessEnabled,
};
const publicConfigPath = path.join(ROOT, 'frontend', 'public', 'config.json');
fs.writeFileSync(publicConfigPath, JSON.stringify(publicConfig, null, 2), 'utf-8');
console.log(`✅ Wrote frontend/public/config.json`);

// ── Helpers ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const noFrontend = args.includes('--no-frontend');
const noBridge = args.includes('--no-bridge');

function spawnService(label, cmd, cmdArgs, cwd, env = {}) {
  console.log(`\n🚀 Starting ${label}…`);
  // On Windows, npm/npx need shell:true but dotnet does not.
  // Using shell:true with paths containing spaces causes MSBuild to split them.
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx');
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: needsShell,
  });
  child.on('error', (err) => console.error(`❌ ${label} error:`, err.message));
  child.on('exit', (code) => console.log(`⚠️  ${label} exited with code ${code}`));
  return child;
}

// ── Spawn services ─────────────────────────────────────────────────────────
const children = [];

if (!noBridge) {
  const bridgeCsproj = path.join(ROOT, 'NetSDKBridge', 'NetSDKBridge.csproj');
  children.push(
    spawnService(
      'NetSDKBridge',
      'dotnet',
      ['run', '--project', bridgeCsproj],
      path.join(ROOT, 'NetSDKBridge')
    )
  );
}

children.push(
  spawnService(
    'Backend',
    'npm',
    ['run', 'dev'],
    path.join(ROOT, 'backend'),
    { PORT: String(ports.backend) }
  )
);

if (!noFrontend) {
  children.push(
    spawnService(
      'Frontend',
      'npm',
      ['run', 'dev', '--', '-p', String(ports.frontend)],
      path.join(ROOT, 'frontend'),
      { BACKEND_PORT: String(ports.backend) }
    )
  );
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n⚠️  Stopping all services…');
  children.forEach((c) => c.kill());
  process.exit(0);
});

// Keep bootstrap alive so it can relay child exit events and respond to SIGINT.
// Without this the Node event loop drains immediately after spawn() calls return.
const keepAlive = setInterval(() => {}, 1 << 30);

// If ALL children exit (e.g. during dev restart), exit bootstrap too.
let exitedCount = 0;
children.forEach((c) => {
  c.on('exit', () => {
    exitedCount++;
    if (exitedCount >= children.length) {
      console.log('⚠️  All services have exited — shutting down bootstrap.');
      clearInterval(keepAlive);
    }
  });
});
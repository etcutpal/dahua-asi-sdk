'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface NIC { name: string; address: string; }
interface ServerConfig {
  ports: { frontend: number; backend: number; bridge: number; autoReg: number };
  network: { localAccessIp: string; deviceRegistrationIp: string; publicAccessEnabled: boolean; publicAccessIp: string; bindHost: string };
  bridge: { platformUsername: string; platformPassword: string };
}
const DEFAULT_CONFIG: ServerConfig = {
  ports: { frontend: 3000, backend: 3001, bridge: 5000, autoReg: 9500 },
  network: { localAccessIp: '127.0.0.1', deviceRegistrationIp: '127.0.0.1', publicAccessEnabled: false, publicAccessIp: '', bindHost: '0.0.0.0' },
  bridge: { platformUsername: 'admin', platformPassword: '' },
};

type RestartPhase = 'restarting' | 'done' | 'error';
interface RestartOverlay { phase: RestartPhase; newIp: string; port: number; message?: string; }

export default function SystemSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [nics, setNics] = useState<NIC[]>([]);
  const [config, setConfig] = useState<ServerConfig>(DEFAULT_CONFIG);
  const [alert, setAlert] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [restartOverlay, setRestartOverlay] = useState<RestartOverlay | null>(null);
  const savedIpRef = useRef<string>(DEFAULT_CONFIG.network.deviceRegistrationIp);

  const showAlert = (type: 'success' | 'warning' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 6000);
  };

  const loadConfig = useCallback(async () => {
    try {
      const [cfgRes, nicRes] = await Promise.all([fetch('/api/system/config'), fetch('/api/system/network-interfaces')]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setConfig(cfg);
        savedIpRef.current = cfg.network?.deviceRegistrationIp ?? DEFAULT_CONFIG.network.deviceRegistrationIp;
      }
      if (nicRes.ok) setNics(await nicRes.json());
    } catch { showAlert('error', 'Failed to load system configuration.'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadConfig();
  }, [isAuthenticated, router, loadConfig]);

  const handleSave = async () => {
    const ipChanged = config.network.deviceRegistrationIp !== savedIpRef.current;
    setIsSaving(true);

    if (ipChanged) {
      // Show overlay immediately and yield to browser paint cycle before fetch
      setRestartOverlay({ phase: 'restarting', newIp: config.network.deviceRegistrationIp, port: config.ports.autoReg });
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }

    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();

      if (!res.ok) {
        if (ipChanged) {
          setRestartOverlay({ phase: 'error', newIp: config.network.deviceRegistrationIp, port: config.ports.autoReg, message: data.error || 'Save failed.' });
        } else {
          showAlert('error', data.error || 'Save failed.');
        }
        return;
      }

      savedIpRef.current = config.network.deviceRegistrationIp;

      if (ipChanged) {
        if (data.restartRequired) {
          setRestartOverlay({ phase: 'error', newIp: config.network.deviceRegistrationIp, port: config.ports.autoReg, message: 'Bridge could not restart automatically. Please restart services manually.' });
        } else {
          setRestartOverlay({ phase: 'done', newIp: config.network.deviceRegistrationIp, port: config.ports.autoReg });
          setTimeout(() => setRestartOverlay(null), 5000);
        }
      } else {
        showAlert(data.restartRequired ? 'warning' : 'success', data.message);
      }
    } catch {
      if (ipChanged) {
        setRestartOverlay({ phase: 'error', newIp: config.network.deviceRegistrationIp, port: config.ports.autoReg, message: 'Network error while saving.' });
      } else {
        showAlert('error', 'Network error while saving.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const detectPublicIp = async () => {
    setIsDetectingIp(true);
    try {
      const data = await (await fetch('https://api.ipify.org?format=json')).json();
      setConfig((c) => ({ ...c, network: { ...c.network, publicAccessIp: data.ip } }));
    } catch { showAlert('error', 'Could not detect public IP.'); }
    finally { setIsDetectingIp(false); }
  };

  const setNet = (patch: Partial<ServerConfig['network']>) => setConfig((c) => ({ ...c, network: { ...c.network, ...patch } }));
  const setPorts = (patch: Partial<ServerConfig['ports']>) => setConfig((c) => ({ ...c, ports: { ...c.ports, ...patch } }));
  const setBridge = (patch: Partial<ServerConfig['bridge']>) => setConfig((c) => ({ ...c, bridge: { ...c.bridge, ...patch } }));

  const inp = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';
  const sec = 'bg-white rounded-lg shadow-sm border border-gray-200 p-6';
  const h2c = 'text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2';

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );

  const localApiUrl = "http://" + config.network.localAccessIp + ":" + config.ports.backend;
  const publicApiUrl = config.network.publicAccessEnabled && config.network.publicAccessIp
    ? "http://" + config.network.publicAccessIp + ":" + config.ports.backend
    : '(disabled)';
  const deviceRegUrl = config.network.deviceRegistrationIp + ":" + config.ports.autoReg;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/settings/system" onLogout={logout} />

      {/*  Restart Overlay  */}
      {restartOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">

            {restartOverlay.phase === 'restarting' && (
              <>
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Restarting SDK &amp; Registration Server</h2>
                <p className="text-gray-600 mb-5">
                  IP address changing to{' '}
                  <span className="font-mono font-semibold text-blue-700">{restartOverlay.newIp}</span>
                </p>
                <div className="space-y-2 text-sm text-gray-500 text-left bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                    <span>Stopping all device sessions &amp; listeners...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" style={{ animationDelay: '0.2s' }} />
                    <span>Applying new IP  {restartOverlay.newIp}...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-300 animate-pulse flex-shrink-0" style={{ animationDelay: '0.4s' }} />
                    <span>Re-initialising NetSDK...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-200 animate-pulse flex-shrink-0" style={{ animationDelay: '0.6s' }} />
                    <span>Starting registration server on {restartOverlay.newIp}:{restartOverlay.port}...</span>
                  </div>
                </div>
                <p className="mt-5 text-xs text-gray-400">Devices will reconnect automatically if their Server Address matches</p>
              </>
            )}

            {restartOverlay.phase === 'done' && (
              <>
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">SDK Restarted Successfully</h2>
                <p className="text-gray-600 mb-3">
                  Registration server now listening on{' '}
                  <span className="font-mono font-semibold text-green-700">
                    {restartOverlay.newIp}:{restartOverlay.port}
                  </span>
                </p>
                <p className="text-sm text-gray-500 mb-1">All previous device sessions were cleared.</p>
                <p className="text-sm text-gray-500">
                  Devices configured to connect to this address will reconnect automatically.
                </p>
                <p className="mt-5 text-xs text-gray-400">This dialog will close automatically...</p>
              </>
            )}

            {restartOverlay.phase === 'error' && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Restart Failed</h2>
                <p className="text-gray-600 mb-6">{restartOverlay.message}</p>
                <button
                  onClick={() => setRestartOverlay(null)}
                  className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
                >
                  Close
                </button>
              </>
            )}

          </div>
        </div>
      )}

      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">
        {alert && (
          <div className={"mb-4 p-4 rounded-lg flex items-center gap-3 border " + (alert.type === 'success' ? 'bg-green-50 border-green-200' : alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200')}>
            <span className={"text-sm " + (alert.type === 'success' ? 'text-green-800' : alert.type === 'warning' ? 'text-yellow-800' : 'text-red-800')}>{alert.message}</span>
          </div>
        )}
        <div className="mb-6 lg:mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <span></span>
            <span className="text-gray-900 font-medium">System Settings</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-600 mt-1 text-sm lg:text-base">Configure network access, ports, and bridge credentials</p>
        </div>
        <div className="space-y-6">
          <div className={sec}>
            <h2 className={h2c}><Icon path="M5 12h14M12 5l7 7-7 7" />Network Interfaces</h2>
            <p className="text-sm text-gray-500 mb-4">Services bind to 0.0.0.0. These settings control advertised addresses.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={lbl}>Local Access IP</label>
                <select className={inp} value={config.network.localAccessIp} onChange={(e) => setNet({ localAccessIp: e.target.value })}>
                  {nics.map((n) => <option key={n.address} value={n.address}>{n.name}  {n.address}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Used by browsers on the same LAN</p>
              </div>
              <div>
                <label className={lbl}>Device Registration IP</label>
                <select className={inp} value={config.network.deviceRegistrationIp} onChange={(e) => setNet({ deviceRegistrationIp: e.target.value })}>
                  {nics.filter((n) => n.address !== '127.0.0.1').map((n) => <option key={n.address} value={n.address}>{n.name}  {n.address}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  IP your physical devices dial in to.
                  {config.network.deviceRegistrationIp !== savedIpRef.current && (
                    <span className="ml-1 text-amber-600 font-medium"> Saving will restart the SDK and drop all device sessions.</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className={sec}>
            <h2 className={h2c}><Icon path="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />Public / Remote Access</h2>
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input type="checkbox" checked={config.network.publicAccessEnabled} onChange={(e) => setNet({ publicAccessEnabled: e.target.checked })} className="w-4 h-4 text-blue-600 border-gray-300 rounded" />
              <span className="text-sm font-medium text-gray-700">Enable Public / Remote Access</span>
            </label>
            {config.network.publicAccessEnabled && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <strong>NAT note:</strong> Forward port {config.ports.backend} on your router to {config.network.localAccessIp}.
                </div>
                <div>
                  <label className={lbl}>Public IP or Domain</label>
                  <div className="flex gap-2">
                    <input type="text" className={inp + " flex-1"} placeholder="e.g. 203.0.113.5" value={config.network.publicAccessIp} onChange={(e) => setNet({ publicAccessIp: e.target.value })} />
                    <button onClick={detectPublicIp} disabled={isDetectingIp} className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50">
                      {isDetectingIp ? 'Detecting...' : 'Detect'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className={sec}>
            <h2 className={h2c}><Icon path="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 4-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />Port Configuration</h2>
            <div className="p-3 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">Port changes require a service restart.</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([{ label: 'Frontend', key: 'frontend', desc: 'Next.js UI' }, { label: 'Backend API', key: 'backend', desc: 'Express server' }, { label: 'Bridge (C#)', key: 'bridge', desc: 'NetSDK bridge' }, { label: 'Auto-Reg', key: 'autoReg', desc: 'Device registration' }] as const).map(({ label, key, desc }) => (
                <div key={key}>
                  <label className={lbl}>{label}</label>
                  <input type="number" min={1} max={65535} className={inp} value={config.ports[key]} onChange={(e) => setPorts({ [key]: parseInt(e.target.value) || config.ports[key] })} />
                  <p className="text-xs text-gray-500 mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={sec}>
            <h2 className={h2c}><Icon path="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />Bridge Credentials</h2>
            <p className="text-sm text-gray-500 mb-4">Must match what is configured on each access-control device.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={lbl}>Platform Username</label>
                <input type="text" className={inp} value={config.bridge.platformUsername} onChange={(e) => setBridge({ platformUsername: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Platform Password</label>
                <input type="password" className={inp} placeholder="Leave blank to keep existing" value={config.bridge.platformPassword} onChange={(e) => setBridge({ platformPassword: e.target.value })} />
              </div>
            </div>
          </div>
          <div className={sec}>
            <h2 className={h2c}><Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />Resolved URLs</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">Local API URL</p><code className="text-blue-700 break-all">{localApiUrl}</code></div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">Public API URL</p><code className={"break-all " + (config.network.publicAccessEnabled ? 'text-blue-700' : 'text-gray-400')}>{publicApiUrl}</code></div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">Device Registration</p><code className="text-blue-700 break-all">{deviceRegUrl}</code></div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => router.back()} className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2">
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
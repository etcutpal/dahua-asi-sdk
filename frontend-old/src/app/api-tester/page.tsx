'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Clock, Globe, MapPin } from 'lucide-react';
import Link from 'next/link';

// ─── Endpoint Definitions ───────────────────────────────────────────────────
interface EndpointDef {
  label: string;
  method: string;
  path: string;
  description: string;
  body?: string;
  params?: { key: string; value: string }[];
  group: 'nat' | 'local-ip' | 'backend';
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const BRIDGE_URL = 'http://localhost:5000';

const endpoints: EndpointDef[] = [
  // ═══════════════════════════════════════════════════════
  // BACKEND ENDPOINTS
  // ═══════════════════════════════════════════════════════
  { label: 'Backend Health', method: 'GET', path: '/api/health', description: 'Check if the backend is alive.', group: 'backend' },
  { label: 'List Devices (config)', method: 'GET', path: '/api/devices', description: 'All configured devices from backend.', group: 'backend' },
  {
    label: 'Add Device (config)',
    method: 'POST',
    path: '/api/devices',
    description: 'Create a new device config.',
    body: JSON.stringify(
      { name: 'ASI12', deviceID: 'ASI12', ip: '192.168.1.147', username: 'admin', password: 'admin123' },
      null,
      2
    ),
    group: 'backend',
  },
  {
    label: 'Update Device (config)',
    method: 'PUT',
    path: '/api/devices/{id}',
    description: 'Update a device (replace {id}).',
    body: JSON.stringify({ name: 'ASI12 Updated', ip: '192.168.1.147' }, null, 2),
    group: 'backend',
  },
  { label: 'Delete Device (config)', method: 'DELETE', path: '/api/devices/{id}', description: 'Remove a device config.', group: 'backend' },

  // ── Events ──
  { label: 'Access Events (last 20)', method: 'GET', path: '/api/events/access-control?limit=20', description: 'Recent access control events from SDK StartListen.', group: 'backend' },
  { label: 'Events for Device', method: 'GET', path: '/api/events/access-control/device/ASI12', description: 'Events filtered by device.', group: 'backend' },
  { label: 'Clear Events', method: 'DELETE', path: '/api/events/access-control', description: 'Delete stored events.', group: 'backend' },

  // ── Access Control Events (SDK StartListen - Live) ──
  { 
    label: '🔴 Live Access Events', 
    method: 'GET', 
    path: '/api/events/access-control?limit=50', 
    description: 'Live access control events via SDK StartListen. Shows: User ID, Card Number, Face/Fingerprint/Card access, Success/Fail status, Door number, Timestamp. NOTE: Snapshots NOT available with StartListen (SDK limitation).', 
    group: 'backend' 
  },
  { 
    label: 'Device-Specific Events', 
    method: 'GET', 
    path: '/api/events/access-control/device/ASI12', 
    description: 'Access events filtered by device ID (ASI12). Events flow through SDK alarm callback (no direct IP needed).', 
    group: 'backend' 
  },

  // ── Auto-Reg ──
  { label: 'Start Auto-Reg', method: 'POST', path: '/api/autoreg/start', description: 'Start listening on port 9500.', group: 'backend' },
  { label: 'Stop Auto-Reg', method: 'POST', path: '/api/autoreg/stop', description: 'Stop the auto-reg server.', group: 'backend' },

  // ── Webhook Endpoints (Called by NetSDKBridge) ──
  { 
    label: '📡 Webhook: Access Events', 
    method: 'POST', 
    path: '/api/webhooks/access-events', 
    description: 'Webhook endpoint called by NetSDKBridge when SDK alarm event received. Payload: {type, deviceId, timestamp, data: {eventType, userId, cardNumber, isSuccess, door, ...}}. NOTE: This is called by the bridge, not manually.', 
    group: 'backend' 
  },

  // ═══════════════════════════════════════════════════════
  // BRIDGE: NAT Traversal (Works over Internet)
  // ═══════════════════════════════════════════════════════
  { label: 'List Devices (live)', method: 'GET', path: '/api/devices', description: 'Connected devices from Bridge (live status).', group: 'nat', baseUrl: BRIDGE_URL },

  // ── Access Records (SDK TCP - NAT Traversal) ──
  {
    label: 'Access Records (Latest 10)',
    method: 'GET',
    path: '/api/devices/ASI12/access-records-sdk',
    description: 'Latest 10 access records via SDK TCP. Uses local device time (no UTC conversion).',
    params: [
      { key: 'startTime', value: '2026-04-10T00:00:00' },
      { key: 'endTime', value: '2026-04-10T23:59:59' },
      { key: 'maxRecords', value: '10' },
    ],
    group: 'nat',
    baseUrl: BRIDGE_URL,
  },
  {
    label: 'Access Records (7 days)',
    method: 'GET',
    path: '/api/devices/ASI12/access-records-sdk',
    description: 'Records from last 7 days via SDK TCP. No device IP needed.',
    params: [{ key: 'maxRecords', value: '20' }],
    group: 'nat',
    baseUrl: BRIDGE_URL,
  },
  {
    label: 'Access Records (date range)',
    method: 'GET',
    path: '/api/devices/ASI12/access-records-sdk',
    description: 'Records within a date range via SDK TCP.',
    params: [
      { key: 'startTime', value: '2026-04-05T00:00:00' },
      { key: 'endTime', value: '2026-04-06T00:00:00' },
      { key: 'maxRecords', value: '100' },
    ],
    group: 'nat',
    baseUrl: BRIDGE_URL,
  },
  {
    label: 'Access Records (by card)',
    method: 'GET',
    path: '/api/devices/ASI12/access-records-sdk',
    description: 'Records filtered by card number via SDK TCP.',
    params: [
      { key: 'cardNumber', value: '448008' },
      { key: 'maxRecords', value: '50' },
    ],
    group: 'nat',
    baseUrl: BRIDGE_URL,
  },
  {
    label: 'Access Records (custom range)',
    method: 'GET',
    path: '/api/devices/ASI12/access-records-sdk',
    description: 'Full date range + card filter.',
    params: [
      { key: 'startTime', value: '2026-04-01T00:00:00' },
      { key: 'endTime', value: '2026-04-10T23:59:59' },
      { key: 'cardNumber', value: '448008' },
      { key: 'maxRecords', value: '200' },
    ],
    group: 'nat',
    baseUrl: BRIDGE_URL,
  },

  // ═══════════════════════════════════════════════════════
  // BRIDGE: Needs Device Local IP (LAN only)
  // ═══════════════════════════════════════════════════════
  { label: 'Access Records (CGI)', method: 'GET', path: '/api/devices/ASI12/access-records', description: 'Access records via CGI. Needs direct device HTTP access (LAN only).', group: 'local-ip', baseUrl: BRIDGE_URL },
  { label: 'Door Status', method: 'GET', path: '/api/devices/ASI12/door-status', description: 'Current door state via CGI (needs device IP).', group: 'local-ip', baseUrl: BRIDGE_URL },
  {
    label: 'Open Door',
    method: 'POST',
    path: '/api/devices/ASI12/open-door',
    description: 'Open door via CGI (needs device IP).',
    body: JSON.stringify({ doorIndex: 0 }, null, 2),
    group: 'local-ip',
    baseUrl: BRIDGE_URL,
  },
  {
    label: 'Close Door',
    method: 'POST',
    path: '/api/devices/ASI12/close-door',
    description: 'Close door via CGI (needs device IP).',
    body: JSON.stringify({ doorIndex: 0 }, null, 2),
    group: 'local-ip',
    baseUrl: BRIDGE_URL,
  },
];

// ─── Build URL helper ────────────────────────────────────────────────────────
function buildUrl(def: EndpointDef, deviceId: string, params: Record<string, string>): string {
  const base = def.baseUrl || BACKEND_URL;
  let path = def.path;
  if (deviceId) path = path.replace('{id}', deviceId);
  if (def.params) {
    const search = new URLSearchParams();
    def.params.forEach((p) => {
      const v = params[p.key] ?? p.value;
      if (v) search.append(p.key, v);
    });
    const qs = search.toString();
    if (qs) path += (path.includes('?') ? '&' : '?') + qs;
  }
  return base + path;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ApiTesterPage() {
  const [selected, setSelected] = useState<EndpointDef>(endpoints[0]);
  const [deviceId, setDeviceId] = useState('ASI12');
  const [method, setMethod] = useState(selected.method);
  const [url, setUrl] = useState(buildUrl(selected, deviceId, {}));
  const [body, setBody] = useState(selected.body || '');
  const [responseText, setResponseText] = useState('');
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ time: string; status: number; method: string; url: string }[]>([]);

  const handleSelect = (ep: EndpointDef) => {
    setSelected(ep);
    setMethod(ep.method);
    setUrl(buildUrl(ep, deviceId, {}));
    setBody(ep.body || '');
    setResponseText('');
    setStatusCode(null);
  };

  const handleDeviceIdChange = (v: string) => {
    setDeviceId(v);
    setUrl(buildUrl(selected, v, {}));
  };

  const handleSend = async () => {
    setLoading(true);
    setResponseText('');
    setStatusCode(null);
    const start = Date.now();
    try {
      const opts: RequestInit = { method };
      if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = body;
      }
      const res = await fetch(url, opts);
      const elapsed = Date.now() - start;
      setStatusCode(res.status);
      try {
        const json = await res.json();
        setResponseText(JSON.stringify(json, null, 2));
      } catch {
        const txt = await res.text();
        setResponseText(txt || '(empty response)');
      }
      setHistory((prev) => [
        { time: `${elapsed}ms`, status: res.status, method, url },
        ...prev,
      ].slice(0, 30));
    } catch (err: any) {
      setStatusCode(0);
      setResponseText(`Network Error:\n${err.message || err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s: number | null) => {
    if (s === null) return 'default';
    if (s >= 200 && s < 300) return 'default';
    if (s >= 400 && s < 500) return 'destructive' as const;
    if (s >= 500) return 'destructive' as const;
    if (s === 0) return 'destructive' as const;
    return 'default';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">API Tester</h1>
            <Badge variant="outline">All Endpoints</Badge>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ── Sidebar: Endpoint List ── */}
          <div className="lg:col-span-3">
            <Card className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Endpoints</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-3">
                {(['backend', 'nat', 'local-ip'] as const).map((group) => {
                  const groupEndpoints = endpoints.filter((ep) => ep.group === group);
                  if (groupEndpoints.length === 0) return null;

                  const groupInfo = {
                    backend: { label: 'Backend (Port 3001)', icon: null, color: 'text-gray-600' },
                    nat: { label: 'Bridge — NAT Traversal', icon: <Globe className="h-3 w-3" />, color: 'text-green-600' },
                    'local-ip': { label: 'Bridge — Needs Device IP', icon: <MapPin className="h-3 w-3" />, color: 'text-amber-600' },
                  }[group];

                  return (
                    <div key={group}>
                      <div className={`flex items-center space-x-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${groupInfo.color}`}>
                        {groupInfo.icon}
                        <span>{groupInfo.label}</span>
                      </div>
                      <div className="space-y-0.5 ml-1">
                        {groupEndpoints.map((ep, i) => (
                          <button
                            key={i}
                            onClick={() => handleSelect(ep)}
                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                              selected === ep
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`text-[9px] font-mono px-1 py-0 rounded ${
                                  selected === ep
                                    ? 'bg-white/20 text-white'
                                    : ep.method === 'GET'
                                    ? 'bg-green-100 text-green-700'
                                    : ep.method === 'POST'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {ep.method}
                              </span>
                              <span className="truncate">{ep.label}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* ── Main: Request + Response ── */}
          <div className="lg:col-span-9 space-y-6">
            {/* Device ID input */}
            <Card>
              <CardContent className="pt-4">
                <label className="text-sm font-medium block mb-1">Device ID (replaces {'{id}'})</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  value={deviceId}
                  onChange={(e) => handleDeviceIdChange(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Request */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Request</CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      selected.group === 'nat'
                        ? 'text-green-700 border-green-300 bg-green-50'
                        : selected.group === 'local-ip'
                        ? 'text-amber-700 border-amber-300 bg-amber-50'
                        : 'text-gray-600 border-gray-300 bg-gray-50'
                    }`}
                  >
                    {selected.group === 'nat' ? (
                      <><Globe className="h-2.5 w-2.5 mr-1" /> NAT Traversal</>
                    ) : selected.group === 'local-ip' ? (
                      <><MapPin className="h-2.5 w-2.5 mr-1" /> Needs Device IP</>
                    ) : (
                      'Backend'
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{selected.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex space-x-2">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm font-mono w-24"
                  >
                    {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Button onClick={handleSend} disabled={loading} className="space-x-2">
                    <Send className="h-4 w-4" />
                    <span>Send</span>
                  </Button>
                </div>

                {/* Body (for POST/PUT) */}
                {(method === 'POST' || method === 'PUT') && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Request Body (JSON)</label>
                    <textarea
                      className="w-full border rounded-md px-3 py-2 text-xs font-mono h-32"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  </div>
                )}

                {/* Params for endpoints with query string */}
                {selected.params && selected.params.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Query Parameters</label>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.params.map((p) => (
                        <div key={p.key}>
                          <label className="text-[10px] text-muted-foreground">{p.key}</label>
                          <input
                            className="w-full border rounded-md px-2 py-1 text-xs font-mono"
                            defaultValue={p.value}
                            onChange={(e) => {
                              // Rebuild URL on change
                              const ep = selected;
                              const base = ep.baseUrl || BACKEND_URL;
                              let path = ep.path;
                              if (deviceId) path = path.replace('{id}', deviceId);
                              const params: Record<string, string> = {};
                              ep.params!.forEach((pp) => {
                                const el = document.querySelector(`[data-param="${pp.key}"]`) as HTMLInputElement;
                                if (el) params[pp.key] = el.value;
                              });
                              const search = new URLSearchParams(params);
                              const qs = search.toString();
                              setUrl(base + path + (qs ? '?' + qs : ''));
                            }}
                            data-param={p.key}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Response */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Response</CardTitle>
                {statusCode !== null && (
                  <Badge variant={statusColor(statusCode)}>{statusCode}</Badge>
                )}
              </CardHeader>
              <CardContent>
                <textarea
                  readOnly
                  className="w-full border rounded-md px-3 py-2 text-xs font-mono h-64 bg-gray-50"
                  value={responseText || '// Response will appear here...'}
                />
              </CardContent>
            </Card>

            {/* History */}
            {history.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span>Request History</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center space-x-3 text-xs font-mono bg-gray-50 px-3 py-1.5 rounded">
                        <Badge
                          variant={h.status >= 200 && h.status < 400 ? 'default' : 'destructive'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {h.status}
                        </Badge>
                        <Badge className="text-[10px] px-1.5 py-0 bg-gray-200 text-gray-700">{h.method}</Badge>
                        <span className="truncate flex-1">{h.url}</span>
                        <span className="text-muted-foreground">{h.time}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

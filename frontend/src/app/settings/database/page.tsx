'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type DbType = 'sqlserver' | 'mysql' | 'postgresql' | 'mongodb';

interface DbConfig {
  type: DbType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  useSSL: boolean;
}

interface MigrateResult {
  table: string;
  status: 'created' | 'exists' | 'error';
  error?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PORTS: Record<DbType, number> = {
  sqlserver: 1433,
  mysql: 3306,
  postgresql: 5432,
  mongodb: 27017,
};

const DB_LABELS: Record<DbType, string> = {
  sqlserver: 'SQL Server (MSSQL)',
  mysql: 'MySQL / MariaDB',
  postgresql: 'PostgreSQL',
  mongodb: 'MongoDB',
};

const DB_ICONS: Record<DbType, string> = {
  sqlserver: '🗄️',
  mysql: '🐬',
  postgresql: '🐘',
  mongodb: '🍃',
};

const DB_RETENTION_OPTIONS = [
  { value: 1,  label: '1 Month' },
  { value: 3,  label: '3 Months' },
  { value: 6,  label: '6 Months (Default)' },
  { value: 12, label: '1 Year' },
  { value: 24, label: '2 Years' },
  { value: 36, label: '3 Years' },
  { value: 0,  label: 'Keep Forever' },
];

const INITIAL_CONFIG: DbConfig = {
  type: 'sqlserver',
  host: 'localhost',
  port: 1433,
  database: '',
  user: '',
  password: '',
  useSSL: false,
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DatabaseSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<DbConfig>(INITIAL_CONFIG);
  const [hasExisting, setHasExisting] = useState(false);

  // Test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string; migrations?: MigrateResult[] } | null>(null);

  // Whether config has changed since last successful test
  const [testedConfig, setTestedConfig] = useState<string | null>(null);

  // Retention state
  const [retentionMonths, setRetentionMonths] = useState(6);
  const [isRetentionSaving, setIsRetentionSaving] = useState(false);
  const [retentionSaveResult, setRetentionSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const configKey = JSON.stringify({ ...config, password: config.password === '••••••••' ? '(masked)' : config.password });
  const isTestFresh = testedConfig === configKey && testResult?.success === true;

  // ── Load existing config on mount ──────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/database/config');
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
        setHasExisting(true);
      }
    } catch (_) {}
    try {
      const res2 = await fetch('/api/database/retention');
      const data2 = await res2.json();
      if (data2.success && typeof data2.dbRetentionMonths === 'number') {
        setRetentionMonths(data2.dbRetentionMonths);
      }
    } catch (_) {}
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadConfig();
  }, [isAuthenticated, router, loadConfig]);

  // ── Field change ───────────────────────────────────────────────────────────
  const handleChange = (field: keyof DbConfig, value: string | number | boolean) => {
    setConfig(prev => {
      const next = { ...prev, [field]: value };
      // Auto-update port when DB type changes
      if (field === 'type') next.port = DEFAULT_PORTS[value as DbType];
      return next;
    });
    // Invalidate test when config changes
    setTestResult(null);
    setSaveResult(null);
  };

  // ── Test connection ────────────────────────────────────────────────────────
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSaveResult(null);
    try {
      const res = await fetch('/api/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) setTestedConfig(configKey);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  // ── Save & migrate ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/database/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setSaveResult(data);
      if (data.success) {
        setHasExisting(true);
        // Mask password after save
        setConfig(prev => ({ ...prev, password: '••••••••' }));
        setTestedConfig(null);
        setTestResult(null);
      }
    } catch (err: any) {
      setSaveResult({ success: false, message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Save retention settings ────────────────────────────────────────────────
  const handleSaveRetention = async () => {
    setIsRetentionSaving(true);
    setRetentionSaveResult(null);
    try {
      const res = await fetch('/api/database/retention', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbRetentionMonths: retentionMonths }),
      });
      const data = await res.json();
      setRetentionSaveResult({ success: data.success, message: data.success ? 'Retention settings saved.' : (data.error ?? 'Save failed') });
    } catch (err: any) {
      setRetentionSaveResult({ success: false, message: err.message });
    } finally {
      setIsRetentionSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Sidebar currentPath="/settings/database" onLogout={logout} />

      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/settings" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Icon path="M15 19l-7-7 7-7" />
          </Link>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Database Settings</h1>
            <p className="text-gray-500 text-sm mt-0.5">Configure database connection for persistent storage</p>
          </div>
        </div>

        {/* Current status banner */}
        {hasExisting && (
          <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-3">
            <span className="text-green-500 text-lg">✅</span>
            <div>
              <p className="text-green-800 font-medium text-sm">Active database configuration found</p>
              <p className="text-green-600 text-xs">
                {DB_ICONS[config.type]} {DB_LABELS[config.type]} — {config.host}:{config.port}/{config.database}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left column: form ────────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Database Type */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icon path="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" className="w-5 h-5 text-blue-600" />
                Database Type
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.keys(DB_LABELS) as DbType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => handleChange('type', type)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      config.type === type
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{DB_ICONS[type]}</span>
                    <span className={`text-xs font-medium text-center leading-tight ${config.type === type ? 'text-blue-700' : 'text-gray-600'}`}>
                      {type === 'sqlserver' ? 'SQL Server' : type === 'postgresql' ? 'PostgreSQL' : type === 'mongodb' ? 'MongoDB' : 'MySQL'}
                    </span>
                    {config.type === type && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Connection Details */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icon path="M13 10V3L4 14h7v7l9-11h-7z" className="w-5 h-5 text-blue-600" />
                Connection Details
              </h2>

              <div className="space-y-4">
                {/* Host + Port */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Server Address / Host <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={config.host}
                      onChange={e => handleChange('host', e.target.value)}
                      placeholder="localhost or 192.168.1.100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                    <input
                      type="number"
                      value={config.port}
                      onChange={e => handleChange('port', parseInt(e.target.value) || DEFAULT_PORTS[config.type])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Database name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {config.type === 'mongodb' ? 'Database Name' : 'Database Name'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.database}
                    onChange={e => handleChange('database', e.target.value)}
                    placeholder="e.g. accesspro_db"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* User + Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      type="text"
                      value={config.user}
                      onChange={e => handleChange('user', e.target.value)}
                      placeholder={config.type === 'sqlserver' ? 'sa' : 'root'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={config.password}
                      onChange={e => handleChange('password', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* SSL toggle */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.useSSL}
                    onClick={() => handleChange('useSSL', !config.useSSL)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.useSSL ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.useSSL ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-gray-700 font-medium">Use SSL / TLS</span>
                </div>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${
                testResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <span className="text-xl mt-0.5">{testResult.success ? '✅' : '❌'}</span>
                <div>
                  <p className={`font-semibold text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </p>
                  {testResult.version && (
                    <p className="text-green-600 text-xs mt-0.5">{testResult.version}</p>
                  )}
                  {!testResult.success && (
                    <p className="text-red-600 text-xs mt-0.5 font-mono">{testResult.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleTest}
                disabled={isTesting || !config.host || !config.database}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-blue-500 text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Icon path="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4" />
                    Test Connection
                  </>
                )}
              </button>

              <button
                onClick={handleSave}
                disabled={isSaving || !isTestFresh}
                title={!isTestFresh ? 'Test connection successfully before saving' : ''}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving & Initializing...
                  </>
                ) : (
                  <>
                    <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                    Save & Initialize Database
                  </>
                )}
              </button>
            </div>

            {!isTestFresh && testResult === null && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4" />
                You must test the connection successfully before saving.
              </p>
            )}

            {/* Data Retention */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Icon path="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" className="w-5 h-5 text-blue-600" />
                Data Retention
              </h2>
              <div className="max-w-sm">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auto-Delete Records Older Than</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={retentionMonths}
                  onChange={(e) => setRetentionMonths(parseInt(e.target.value))}
                >
                  {DB_RETENTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Access records and attendance logs older than this period will be eligible for automatic cleanup.
                </p>
              </div>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-800 dark:text-amber-300 max-w-lg">
                <strong>Note:</strong> Automatic cleanup runs on a scheduled task. Existing data beyond this period will not be deleted immediately — it will be removed at the next scheduled cleanup cycle.
              </div>
              {retentionSaveResult && (
                <div className={`mt-3 flex items-center gap-2 text-sm ${retentionSaveResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  <Icon path={retentionSaveResult.success ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} className="w-4 h-4" />
                  {retentionSaveResult.message}
                </div>
              )}
              <div className="mt-4">
                <button
                  onClick={handleSaveRetention}
                  disabled={isRetentionSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRetentionSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                      Save Retention Settings
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right column: info + migration results ───────────────────── */}
          <div className="space-y-6">

            {/* Tables that will be managed */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Icon path="M3 10h18M3 14h18M3 6h18M3 18h18" className="w-5 h-5 text-gray-500" />
                Tables Managed
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                These tables will be created if they don&apos;t exist. Existing tables are never modified.
              </p>
              <ul className="space-y-1.5">
                {['persons', 'employees', 'employee_groups', 'devices', 'access_rules', 'sync_queue', 'access_records', 'device_groups', 'access_events', 'attendance_periods', 'attendance_breaks', 'attendance_rules_settings', 'attendance_shifts', 'attendance_schedules', 'attendance_holidays', 'attendance_leave_types', 'attendance_leave_records'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-700">
                    <Icon path="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-mono text-xs">{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Migration results */}
            {saveResult && (
              <div className={`rounded-xl border shadow-sm p-5 ${saveResult.success ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'}`}>
                <h2 className={`text-base font-semibold mb-3 flex items-center gap-2 ${saveResult.success ? 'text-gray-900' : 'text-red-800'}`}>
                  {saveResult.success
                    ? <><Icon path="M5 13l4 4L19 7" className="w-5 h-5 text-green-600" /> Migration Results</>
                    : <><Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-red-500" /> Save Failed</>
                  }
                </h2>

                <p className={`text-sm mb-4 ${saveResult.success ? 'text-gray-600' : 'text-red-700'}`}>
                  {saveResult.message}
                </p>

                {saveResult.migrations && saveResult.migrations.length > 0 && (
                  <ul className="space-y-2">
                    {saveResult.migrations.map(m => (
                      <li key={m.table} className="flex items-center gap-2 text-sm">
                        <span className="text-base">
                          {m.status === 'created' ? '🟢' : m.status === 'exists' ? '🔵' : '🔴'}
                        </span>
                        <span className="font-mono text-xs flex-1 text-gray-700">{m.table}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.status === 'created' ? 'bg-green-100 text-green-700' :
                          m.status === 'exists'  ? 'bg-blue-100 text-blue-700' :
                                                   'bg-red-100 text-red-700'
                        }`}>
                          {m.status === 'created' ? 'Created' : m.status === 'exists' ? 'Exists' : 'Error'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Legend */}
                {saveResult.success && saveResult.migrations && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>🟢 Newly created</span>
                    <span>🔵 Already existed</span>
                    <span>🔴 Error</span>
                  </div>
                )}
              </div>
            )}

            {/* Info box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
                <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4" />
                Important Notes
              </h3>
              <ul className="space-y-1.5 text-xs text-amber-700">
                <li>• Credentials are stored in <span className="font-mono">data/db-config.json</span></li>
                <li>• Tables are created with <span className="font-mono">CREATE TABLE IF NOT EXISTS</span></li>
                <li>• Existing tables and data are <strong>never dropped</strong></li>
                <li>• After saving, restart the backend to use the new database</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

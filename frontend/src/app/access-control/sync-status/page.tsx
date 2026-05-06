'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncJob {
  id: string;
  ruleId: string;
  ruleName?: string;
  personId: string;
  personName?: string;
  deviceId: string;
  deviceName?: string;
  operation: 'add' | 'delete';
  status: 'pending' | 'sending' | 'success' | 'failed' | 'queued_offline';
  attempts: number;
  maxAttempts: number;
  failReason?: string | null;
  createdAt: string;
  lastAttemptAt?: string | null;
  completedAt?: string | null;
}

interface QueueSummary {
  pending: number;
  sending: number;
  success: number;
  failed: number;
  queued_offline: number;
  total: number;
}

interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function safeDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SyncJob['status'] }) {
  const styles: Record<string, string> = {
    pending:       'bg-amber-100 text-amber-700',
    sending:       'bg-blue-100 text-blue-700',
    success:       'bg-green-100 text-green-700',
    failed:        'bg-red-100 text-red-700',
    queued_offline:'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    pending:       '⏳ Pending',
    sending:       '🔄 Sending',
    success:       '✅ Done',
    failed:        '❌ Failed',
    queued_offline:'📴 Offline',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabKey = 'active' | 'success' | 'failed';

export default function SyncStatusPage() {
  const { socket } = useSocket();
  const { logout } = useAuth();

  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [tab, setTab] = useState<TabKey>('active');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    try {
      const [jobsData, summaryData, devicesData] = await Promise.all([
        apiFetch('/api/sync-queue'),
        apiFetch('/api/sync-queue/summary'),
        apiFetch('/api/devices').catch(() => ({ devices: [] })),
      ]);
      setJobs(jobsData.jobs || []);
      setSummary(summaryData);
      setDevices((devicesData.devices || []).map((d: any) => ({
        deviceId: d.deviceId,
        name: d.name,
        registrationId: d.registrationId,
      })));
    } catch (e: any) {
      setError(e.message || 'Failed to load sync queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => loadJobs();
    socket.on('sync:queue:updated', handler);
    return () => { socket.off('sync:queue:updated', handler); };
  }, [socket, loadJobs]);

  // Resolve device name: prefer stored name but fall back to devices list lookup
  function resolveDeviceName(job: SyncJob): string {
    if (job.deviceName && job.deviceName !== job.deviceId) return job.deviceName;
    const found = devices.find(d => d.registrationId === job.deviceId || d.deviceId === job.deviceId);
    return found?.name || job.deviceId;
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try { await apiFetch(`/api/sync-queue/${id}/retry`, { method: 'POST' }); await loadJobs(); }
    finally { setRetryingId(null); }
  }

  async function handleRetryAll() {
    setRetryingAll(true);
    try { await apiFetch('/api/sync-queue/retry-all-failed', { method: 'POST' }); await loadJobs(); }
    finally { setRetryingAll(false); }
  }

  async function handleDelete(id: string) {
    try { await apiFetch(`/api/sync-queue/${id}`, { method: 'DELETE' }); await loadJobs(); }
    catch (e: any) { setError(e.message); }
  }

  const tabFilter: Record<TabKey, (j: SyncJob) => boolean> = {
    active:  j => ['pending', 'sending', 'queued_offline'].includes(j.status),
    success: j => j.status === 'success',
    failed:  j => j.status === 'failed',
  };

  const filtered = jobs.filter(tabFilter[tab]);
  const failedCount  = jobs.filter(j => j.status === 'failed').length;
  const activeCount  = jobs.filter(j => ['pending', 'sending', 'queued_offline'].includes(j.status)).length;
  const successCount = jobs.filter(j => j.status === 'success').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Sidebar currentPath="/access-control" onLogout={logout} />

      <div className="lg:ml-64 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Link href="/access-control" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Sync Status</h1>
                <p className="text-gray-500 text-sm mt-0.5">Live view of access rule sync queue</p>
              </div>
            </div>
            {failedCount > 0 && (
              <button
                onClick={handleRetryAll}
                disabled={retryingAll}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${retryingAll ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {retryingAll ? 'Retrying…' : `Retry All Failed (${failedCount})`}
              </button>
            )}
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Pending',  value: summary.pending,        color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-100' },
                { label: 'Sending',  value: summary.sending,        color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100'  },
                { label: 'Offline',  value: summary.queued_offline, color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200 dark:border-gray-700'  },
                { label: 'Success',  value: summary.success,        color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
                { label: 'Failed',   value: summary.failed,         color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100'   },
              ].map(({ label, value, color, bg, border }) => (
                <div key={label} className={`${bg} rounded-xl p-4 border ${border} text-center`}>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {/* Main card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4">
              {([
                { key: 'active'  as TabKey, label: `Active`,    count: activeCount  },
                { key: 'success' as TabKey, label: `Completed`, count: successCount },
                { key: 'failed'  as TabKey, label: `Failed`,    count: failedCount  },
              ]).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === key
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  {label}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <svg className="w-8 h-8 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                No jobs in this category
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide bg-gray-50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3">Person</th>
                      <th className="px-4 py-3">Device</th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Op</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Attempts</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(job => (
                      <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{job.personName || job.personId}</span>
                          {job.personName && job.personName !== job.personId && (
                            <div className="text-xs text-gray-400">{job.personId}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {resolveDeviceName(job)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate" title={job.ruleName}>
                          {job.ruleName || job.ruleId}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            job.operation === 'add'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {job.operation === 'add' ? '+ Add' : '− Remove'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-center text-xs">
                          {job.attempts}/{job.maxAttempts}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate" title={job.failReason || ''}>
                          {job.failReason || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {safeDate(job.completedAt || job.lastAttemptAt || job.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {job.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(job.id)}
                                disabled={retryingId === job.id}
                                title="Retry"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <svg className={`w-4 h-4 ${retryingId === job.id ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(job.id)}
                              title="Remove"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * dashboardnew/page.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * NEW Dashboard — route: /dashboardnew
 *
 * All sub-sections are implemented inline with clear comment blocks so each
 * section can be extracted into its own component file later without any
 * logic changes.
 *
 * Sections in this file:
 *   [TYPES]           — TypeScript interfaces
 *   [HELPERS]         — Pure utility functions (formatters, colour pickers)
 *   [SIDEBAR]         — Left navigation sidebar component
 *   [STAT CARD]       — Top KPI card (with sparkline + trend badge)
 *   [ATTENDANCE CHART]— Weekly attendance line chart (pure SVG)
 *   [DEVICE DONUT]    — Device statistics donut chart (pure SVG)
 *   [ATTENDANCE RATE] — Attendance rate circular gauge (pure SVG)
 *   [TOP ACCESS POINTS]— Horizontal bar list
 *   [RECENT ACCESS]   — Access history table rows
 *   [MAIN PAGE]       — Root component, data fetching, layout
 *
 * APIs used:
 *   GET /api/dashboard/summary          → KPI summary
 *   GET /api/dashboard/devices          → device list
 *   GET /api/events/access-control      → recent access events
 *   WebSocket 'access:control:event'    → live event push
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/context/SocketContext';

// ─────────────────────────────────────────────────────────────────────────────
// [TYPES]
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateArrivals: number;
  devicesOnline: number;
  devicesOffline: number;
}

interface Device {
  id: string;
  name: string;
  registrationId?: string;
  ipAddress?: string;
  status: 'online' | 'offline' | 'maintenance';
  location?: string;
  lastSeen?: string;
}

interface AccessEvent {
  id?: string;
  deviceId?: string;
  timestamp?: string;
  data?: {
    userId?: string;
    UserID?: string;
    cardName?: string;
    CardName?: string;
    cardNumber?: string;
    isSuccess?: boolean;
    openMethod?: string | number;
    door?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/** Aggregated weekly attendance numbers (Mon–Sun) */
interface WeeklyAttendance {
  day: string;    // 'Mon', 'Tue' …
  count: number;
}

/** A single entry in the Top Access Points list */
interface AccessPoint {
  name: string;
  count: number;
  percent: number;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// [HELPERS]
// ─────────────────────────────────────────────────────────────────────────────

/** Format a timestamp into "HH:MM:SS AM/PM" */
function fmtTime(ts?: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format a Date object to a short date string */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Resolve a display name from a raw access event */
function resolveDisplayName(event: AccessEvent): string {
  const d = event.data || event;
  return d.cardName || d.CardName || d.userId || d.UserID || d.cardNumber || 'Unknown';
}

/** Resolve employee-ID-style label */
function resolveEmpId(event: AccessEvent): string {
  const d = event.data || event;
  return d.userId || d.UserID || d.cardNumber || 'N/A';
}

/** Resolve door/location label */
function resolveDoor(event: AccessEvent): string {
  const d = event.data || event;
  const door = d.door ?? d.Door;
  if (door !== undefined && door !== null) return `Door ${door}`;
  return event.deviceId ? `Device ${event.deviceId}` : 'Unknown';
}

/** Resolve success/failure from event */
function resolveSuccess(event: AccessEvent): boolean {
  const d = event.data || event;
  return d.isSuccess === true;
}

/** Deterministic avatar colour from a string */
function avatarColor(name: string): string {
  const palette = ['#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399', '#f87171'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return palette[Math.abs(h) % palette.length];
}

/** Inline SVG icon helper */
const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none"
    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// [SIDEBAR]
// Can be extracted to: components/DashboardNewSidebar.tsx
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { name: 'Dashboard',   path: '/dashboardnew', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Employees',   path: '/employees',    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0' },
  { name: 'Attendance',  path: '/attendance',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { name: 'Access',      path: '/access-control', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { name: 'Devices',     path: '/devices',      icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { name: 'Reports',     path: '/access-records', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { name: 'Alerts',      path: '/',             icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { name: 'Settings',    path: '/settings/system', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

function NewSidebar({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { onLogout(); router.push('/login'); };

  const NavLinks = () => (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {NAV_ITEMS.map(item => {
        const isActive = typeof window !== 'undefined' && window.location.pathname === item.path;
        return (
          <Link
            key={item.name}
            href={item.path}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${isActive
                ? 'bg-green-500 text-white shadow-md shadow-green-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            <Icon path={item.icon} className="w-5 h-5 flex-shrink-0" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-30 lg:hidden p-2 bg-white rounded-xl shadow-md text-gray-600"
      >
        <Icon path="M4 6h16M4 12h16M4 18h16" className="w-5 h-5" />
      </button>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar panel ── */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 z-50 flex flex-col
        transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-gray-100">
          <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">AccessPro</span>
          <button className="ml-auto lg:hidden text-gray-400" onClick={() => setMobileOpen(false)}>
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        <NavLinks />

        {/* Admin footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">A</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">Admin</p>
            <p className="text-xs text-gray-400">Administrator</p>
          </div>
          <button onClick={handleLogout} title="Logout" className="text-gray-400 hover:text-red-500 transition-colors">
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [STAT CARD]
// A top-row KPI card with value, label, trend badge and mini sparkline.
// Can be extracted to: components/dashboard/StatCard.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  trend: number;      // e.g. 8.2 for +8.2%
  trendLabel: string; // e.g. 'vs Yesterday'
  iconBg: string;     // Tailwind bg colour class
  iconPath: string;
  sparklineData?: number[]; // 6–8 data points for mini chart
  sparklineColor?: string;  // stroke hex
}

function StatCard({ label, value, trend, trendLabel, iconBg, iconPath, sparklineData = [], sparklineColor = '#6366f1' }: StatCardProps) {
  // ── Mini sparkline (pure SVG, no library needed) ──
  const W = 80, H = 32;
  const pts = sparklineData.length >= 2 ? sparklineData : [0, 1];
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = pts.map(v => H - ((v - min) / range) * H);
  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ');

  const isUp = trend >= 0;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        {/* Icon */}
        <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon path={iconPath} className="w-6 h-6 text-white" />
        </div>
        {/* Sparkline */}
        {sparklineData.length >= 2 && (
          <svg width={W} height={H} className="opacity-80">
            <polyline points={polyline} fill="none" stroke={sparklineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-0.5">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        {isUp
          ? <span className="flex items-center gap-0.5 text-green-600"><Icon path="M5 15l7-7 7 7" className="w-3 h-3" />{Math.abs(trend)}%</span>
          : <span className="flex items-center gap-0.5 text-red-500"><Icon path="M19 9l-7 7-7-7" className="w-3 h-3" />{Math.abs(trend)}%</span>
        }
        <span className="text-gray-400 font-normal">{trendLabel}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [ATTENDANCE CHART]
// Pure-SVG line chart for weekly/daily/monthly attendance overview.
// Can be extracted to: components/dashboard/AttendanceChart.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceChartProps {
  data: WeeklyAttendance[];
  activeTab: 'Daily' | 'Weekly' | 'Monthly';
  onTabChange: (tab: 'Daily' | 'Weekly' | 'Monthly') => void;
}

function AttendanceChart({ data, activeTab, onTabChange }: AttendanceChartProps) {
  const W = 560, H = 200, PAD_L = 40, PAD_B = 30, PAD_T = 20, PAD_R = 10;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const counts = data.map(d => d.count);
  const maxVal = Math.max(...counts, 1);
  // Y gridlines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxVal));

  // Point coordinates
  const pts = data.map((d, i) => ({
    x: PAD_L + (i / Math.max(data.length - 1, 1)) * chartW,
    y: PAD_T + chartH - (d.count / maxVal) * chartH,
    label: d.day,
    val: d.count,
  }));

  // SVG path for line
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // Filled area under the line
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${PAD_T + chartH} L${pts[0].x},${PAD_T + chartH} Z`;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Attendance Overview</h2>
        <div className="flex items-center gap-2">
          {/* Period selector button (cosmetic for now) */}
          <button className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-3.5 h-3.5" />
            This Week
            <Icon path="M19 9l-7 7-7-7" className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Daily / Weekly / Monthly tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(['Daily', 'Weekly', 'Monthly'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${activeTab === tab ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320, height: 200 }}>
          <defs>
            {/* Gradient fill under the line */}
            <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines + Y labels */}
          {gridLines.map((val, i) => {
            const y = PAD_T + chartH - (val / maxVal) * chartH;
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{val.toLocaleString()}</text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#attendGrad)" />

          {/* Line */}
          <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points + value labels */}
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#22c55e" stroke="white" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#374151" fontWeight="600">
                {p.val.toLocaleString()}
              </text>
              {/* X axis label */}
              <text x={p.x} y={PAD_T + chartH + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">{p.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [DEVICE DONUT]
// Pure-SVG donut chart for device status breakdown.
// Can be extracted to: components/dashboard/DeviceDonut.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceDonutProps {
  online: number;
  offline: number;
  maintenance: number;
}

function DeviceDonut({ online, offline, maintenance }: DeviceDonutProps) {
  const total = online + offline + maintenance || 1;
  const segments = [
    { label: 'Online',      value: online,      color: '#22c55e' },
    { label: 'Offline',     value: offline,     color: '#60a5fa' },
    { label: 'Maintenance', value: maintenance, color: '#fb923c' },
  ];

  // Build SVG arc segments
  const CX = 60, CY = 60, R = 50, r = 30; // outer radius, inner radius
  let cumAngle = -Math.PI / 2; // start from top

  const arcPath = (startA: number, endA: number) => {
    const x1 = CX + R * Math.cos(startA), y1 = CY + R * Math.sin(startA);
    const x2 = CX + R * Math.cos(endA),   y2 = CY + R * Math.sin(endA);
    const x3 = CX + r * Math.cos(endA),   y3 = CY + r * Math.sin(endA);
    const x4 = CX + r * Math.cos(startA), y4 = CY + r * Math.sin(startA);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${r},${r} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
  };

  const arcs = segments.map(s => {
    const span = (s.value / total) * 2 * Math.PI;
    const path = s.value > 0 ? arcPath(cumAngle, cumAngle + span) : '';
    cumAngle += span;
    return { ...s, path };
  });

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <h2 className="text-base font-bold text-gray-900 mb-4">Device Statistics</h2>

      <div className="flex items-center gap-6">
        {/* Donut SVG */}
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {arcs.map((a, i) => a.path && (
              <path key={i} d={a.path} fill={a.color} className="transition-all duration-300" />
            ))}
            {/* Centre text */}
            <text x="60" y="56" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">{total}</text>
            <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#6b7280">Total Devices</text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {arcs.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                <span className="text-xs text-gray-600">{a.label}</span>
              </div>
              <span className="text-xs font-semibold text-gray-800">
                {a.value} <span className="font-normal text-gray-400">({((a.value / total) * 100).toFixed(1)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Status footer */}
      <div className="mt-4 flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-xl px-3 py-2">
        <Icon path="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" className="w-4 h-4 flex-shrink-0" />
        All devices are functioning well
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [ATTENDANCE RATE]
// Circular gauge showing the overall attendance rate percentage.
// Can be extracted to: components/dashboard/AttendanceRate.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceRateProps {
  present: number;
  absent: number;
  trendVsLastMonth: number; // e.g. 6.8
}

function AttendanceRate({ present, absent, trendVsLastMonth }: AttendanceRateProps) {
  const total = present + absent || 1;
  const rate = (present / total) * 100;

  // SVG circle gauge
  const R = 54, CX = 70, CY = 70;
  const circum = 2 * Math.PI * R;
  const dash = (rate / 100) * circum;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Attendance Rate</h2>
        <button className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
          This Month <Icon path="M19 9l-7 7-7-7" className="w-3 h-3" />
        </button>
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center gap-3">
        <svg width="140" height="140" viewBox="0 0 140 140">
          {/* Track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f3f4f6" strokeWidth="12" />
          {/* Progress arc */}
          <circle
            cx={CX} cy={CY} r={R} fill="none"
            stroke="#22c55e" strokeWidth="12"
            strokeDasharray={`${dash.toFixed(1)} ${circum.toFixed(1)}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827">{rate.toFixed(1)}%</text>
          <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fill="#6b7280">Attendance Rate</text>
        </svg>

        {/* Present / Absent row */}
        <div className="flex items-center gap-8 w-full justify-center">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
              <Icon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Present</p>
              <p className="font-bold text-gray-900">{present.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
              <Icon path="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Absent</p>
              <p className="font-bold text-gray-900">{absent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* vs Last Month */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 border-t border-gray-100 pt-3 w-full justify-between">
          <span>vs Last Month</span>
          <span className={`flex items-center gap-0.5 font-bold ${trendVsLastMonth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            <Icon path={trendVsLastMonth >= 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} className="w-3 h-3" />
            {Math.abs(trendVsLastMonth)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [TOP ACCESS POINTS]
// Horizontal bar chart for top access locations.
// Can be extracted to: components/dashboard/TopAccessPoints.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface TopAccessPointsProps {
  points: AccessPoint[];
}

// Door icons for each access point type
const DOOR_ICON = 'M3 10.5V19a1 1 0 001 1h6v-5h4v5h6a1 1 0 001-1v-8.5M9 3h6M3 7l9-4 9 4';
const ACCESS_POINT_ICONS: Record<string, string> = {
  'main entrance': 'M3 10.5V19a1 1 0 001 1h16a1 1 0 001-1v-8.5M9 3h6M3 7l9-4 9 4',
  'office door':   'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  'back entrance': 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1',
  'server room':   'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7',
  'parking gate':  'M12 4v16m8-8H4',
};

function TopAccessPoints({ points }: TopAccessPointsProps) {
  const maxCount = Math.max(...points.map(p => p.count), 1);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Top Access Points</h2>
        <button className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
          This Month <Icon path="M19 9l-7 7-7-7" className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-4">
        {points.map((p, i) => {
          const iconKey = p.name.toLowerCase();
          const iconPath = ACCESS_POINT_ICONS[iconKey] || DOOR_ICON;
          const barWidth = (p.count / maxCount) * 100;

          return (
            <div key={i} className="flex items-center gap-3">
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon path={iconPath} className="w-4 h-4 text-gray-500" />
              </div>
              {/* Bar + labels */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 font-medium truncate">{p.name}</span>
                  <span className="text-sm font-bold text-gray-900 ml-2">{p.count.toLocaleString()}</span>
                </div>
                <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%`, background: p.color }}
                  />
                </div>
              </div>
              {/* Percent */}
              <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{p.percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [RECENT ACCESS]
// A single row in the Recent Access History table.
// Can be extracted to: components/dashboard/RecentAccessRow.tsx
// ─────────────────────────────────────────────────────────────────────────────

function RecentAccessRow({ event }: { event: AccessEvent }) {
  const name    = resolveDisplayName(event);
  const empId   = resolveEmpId(event);
  const door    = resolveDoor(event);
  const success = resolveSuccess(event);
  const time    = fmtTime(event.timestamp || event.data?.swipeTime);
  const color   = avatarColor(name);
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ background: color }}
      >
        {initials}
      </div>

      {/* Name + ID + door */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400 truncate">{empId} · {door}</p>
      </div>

      {/* Status badge */}
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0
        ${success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
        {success ? 'Access Granted' : 'Access Denied'}
      </span>

      {/* Time + navigate icon */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-medium text-gray-700">{time}</p>
        <p className="text-xs text-gray-400">Today</p>
      </div>

      {/* Navigate */}
      <button className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-green-50 flex items-center justify-center text-gray-400 hover:text-green-500 transition-colors flex-shrink-0">
        <Icon path="M9 5l7 7-7 7" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [MAIN PAGE]
// Root component — data fetching, state, layout assembly.
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardNewPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const { socket } = useSocket();

  // ── State ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chartTab, setChartTab] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');

  const [summary, setSummary] = useState<DashboardSummary>({
    totalEmployees: 0, presentToday: 0, absentToday: 0,
    lateArrivals: 0, devicesOnline: 0, devicesOffline: 0,
  });

  const [devices, setDevices] = useState<Device[]>([]);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyAttendance[]>([
    { day: 'Mon', count: 0 }, { day: 'Tue', count: 0 }, { day: 'Wed', count: 0 },
    { day: 'Thu', count: 0 }, { day: 'Fri', count: 0 }, { day: 'Sat', count: 0 }, { day: 'Sun', count: 0 },
  ]);

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) router.push('/login');
  }, [isAuthenticated, router]);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Initial data fetch ───────────────────────────────────────────────────
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, devicesRes, eventsRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/summary`),
        fetch(`${API_URL}/api/dashboard/devices`),
        fetch(`${API_URL}/api/events/access-control?limit=50`),
      ]);

      // Summary
      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setSummary(d);

        // Derive weekly chart data from summary (backend may expand this later)
        // For now distribute presentToday across the week as a demonstration.
        // Replace with a real /api/dashboard/weekly endpoint when available.
        const base = d.presentToday || 0;
        setWeeklyData([
          { day: 'Mon', count: Math.round(base * 0.72) },
          { day: 'Tue', count: Math.round(base * 0.88) },
          { day: 'Wed', count: Math.round(base * 0.92) },
          { day: 'Thu', count: Math.round(base * 1.0) },
          { day: 'Fri', count: Math.round(base * 0.95) },
          { day: 'Sat', count: Math.round(base * 0.52) },
          { day: 'Sun', count: Math.round(base * 0.17) },
        ]);
      }

      // Devices
      if (devicesRes.ok) {
        const d = await devicesRes.json();
        setDevices(Array.isArray(d) ? d : []);
      }

      // Access events
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        if (d.success && Array.isArray(d.events)) setAccessEvents(d.events);
      }
    } catch (err) {
      console.error('[DashboardNew] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => { if (isAuthenticated) fetchAll(); }, [isAuthenticated, fetchAll]);

  // ── Live WebSocket events ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (ev: AccessEvent) => {
      setAccessEvents(prev => [ev, ...prev].slice(0, 500));
    };
    socket.on('access:control:event', handler);
    return () => { socket.off('access:control:event', handler); };
  }, [socket]);

  // ── Derived values ───────────────────────────────────────────────────────
  const devicesOnlineCnt    = devices.filter(d => d.status === 'online').length || summary.devicesOnline;
  const devicesOfflineCnt   = devices.filter(d => d.status === 'offline').length || summary.devicesOffline;
  const devicesMaintenanceCnt = devices.filter(d => d.status === 'maintenance').length;
  const totalDevices        = devicesOnlineCnt + devicesOfflineCnt + devicesMaintenanceCnt;

  // Top access points — derived from recent events (can be replaced with API endpoint)
  const pointCounts: Record<string, number> = {};
  accessEvents.forEach(ev => {
    const key = resolveDoor(ev);
    pointCounts[key] = (pointCounts[key] || 0) + 1;
  });
  const totalPointAccesses = Object.values(pointCounts).reduce((a, b) => a + b, 0) || 1;
  const POINT_COLORS = ['#22c55e', '#60a5fa', '#fb923c', '#a78bfa', '#f472b6'];
  const topPoints: AccessPoint[] = Object.entries(pointCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count], i) => ({
      name,
      count,
      percent: (count / totalPointAccesses) * 100,
      color: POINT_COLORS[i % POINT_COLORS.length],
    }));

  // Fallback static top-points when there are no live events yet
  const displayPoints: AccessPoint[] = topPoints.length > 0 ? topPoints : [
    { name: 'Main Entrance', count: 1456, percent: 40.9, color: '#22c55e' },
    { name: 'Office Door',   count: 1102, percent: 30.9, color: '#60a5fa' },
    { name: 'Back Entrance', count: 562,  percent: 15.8, color: '#fb923c' },
    { name: 'Server Room',   count: 267,  percent: 7.5,  color: '#a78bfa' },
    { name: 'Parking Gate',  count: 175,  percent: 4.9,  color: '#f472b6' },
  ];

  // Today's access record count (from events that have today's date)
  const todayStr = new Date().toDateString();
  const todayAccessCount = accessEvents.filter(ev => {
    const ts = ev.timestamp || ev.data?.swipeTime || '';
    return ts && new Date(ts).toDateString() === todayStr;
  }).length;

  // Sparkline data arrays for stat cards (last 7 values, arbitrary demo shape)
  const makeSparkline = (base: number) =>
    [0.6, 0.75, 0.65, 0.85, 0.72, 0.9, 1.0].map(f => Math.round(f * base));

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 text-sm">Loading Dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Left Sidebar ── */}
      <NewSidebar onLogout={logout} />

      {/* ── Main content area (offset by sidebar width on desktop) ── */}
      <div className="lg:ml-64 min-h-screen flex flex-col">

        {/* ── Top header bar ── */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="pl-8 lg:pl-0">
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400">
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {' · '}{fmtDate(currentTime)}
            </p>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-3">
            {/* Search (cosmetic) */}
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-400">
              <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" className="w-4 h-4" />
              <span>Search…</span>
            </div>
            {/* Notifications */}
            <button className="relative w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200">
              <Icon path="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            {/* Refresh */}
            <button onClick={fetchAll} className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200">
              <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Page body ── */}
        <main className="flex-1 p-4 lg:p-6 space-y-5">

          {/* ── ROW 1: KPI Stat Cards ── */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Today Present"
              value={summary.presentToday}
              trend={8.2}
              trendLabel="vs Yesterday"
              iconBg="bg-green-500"
              iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"
              sparklineData={makeSparkline(summary.presentToday || 1245)}
              sparklineColor="#22c55e"
            />
            <StatCard
              label="Total Employees"
              value={summary.totalEmployees}
              trend={-2.4}
              trendLabel="vs Last Month"
              iconBg="bg-blue-500"
              iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              sparklineData={makeSparkline(summary.totalEmployees || 2560)}
              sparklineColor="#60a5fa"
            />
            <StatCard
              label="Today's Late Arrival"
              value={summary.lateArrivals}
              trend={-12.5}
              trendLabel="vs Yesterday"
              iconBg="bg-orange-400"
              iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              sparklineData={makeSparkline(summary.lateArrivals || 78)}
              sparklineColor="#fb923c"
            />
            <StatCard
              label="Today's Access Records"
              value={todayAccessCount || accessEvents.length}
              trend={5.7}
              trendLabel="vs Yesterday"
              iconBg="bg-purple-500"
              iconPath="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              sparklineData={makeSparkline(accessEvents.length || 3562)}
              sparklineColor="#a78bfa"
            />
          </section>

          {/* ── ROW 2: Attendance Chart + Device Donut ── */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Attendance chart spans 2 columns */}
            <div className="xl:col-span-2">
              <AttendanceChart
                data={weeklyData}
                activeTab={chartTab}
                onTabChange={setChartTab}
              />
            </div>
            {/* Device statistics donut */}
            <DeviceDonut
              online={devicesOnlineCnt}
              offline={devicesOfflineCnt}
              maintenance={devicesMaintenanceCnt}
            />
          </section>

          {/* ── ROW 3: Recent Access History + Attendance Rate + Top Access Points ── */}
          <section className="grid grid-cols-1 xl:grid-cols-5 gap-4">

            {/* Recent Access History — 2 columns wide */}
            <div className="xl:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Recent Access History</h2>
                <Link href="/access-records" className="text-xs text-green-600 font-semibold hover:underline">
                  View All
                </Link>
              </div>

              {accessEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-300">
                  <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-10 h-10 mb-2" />
                  <p className="text-sm">No access events yet</p>
                </div>
              ) : (
                <div>
                  {accessEvents.slice(0, 6).map((ev, i) => (
                    <RecentAccessRow key={ev.id || i} event={ev} />
                  ))}
                </div>
              )}
            </div>

            {/* Attendance Rate gauge — 1.5 columns wide */}
            <div className="xl:col-span-1">
              <AttendanceRate
                present={summary.presentToday}
                absent={summary.absentToday}
                trendVsLastMonth={6.8}
              />
            </div>

            {/* Top Access Points bar — 1.5 columns wide */}
            <div className="xl:col-span-2">
              <TopAccessPoints points={displayPoints} />
            </div>

          </section>

        </main>
      </div>
    </div>
  );
}

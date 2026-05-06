'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface GeneralSettings {
  companyName: string;
  language: string;
  timeZone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  theme: 'light' | 'dark';
}

const DEFAULTS: GeneralSettings = {
  companyName: '',
  language: 'en',
  timeZone: 'Asia/Dhaka',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  theme: 'light',
};

const LANGUAGES = [
  { value: 'en',    label: 'English' },
  { value: 'bn',    label: 'Bengali (বাংলা)' },
  { value: 'ar',    label: 'Arabic (العربية)' },
  { value: 'zh',    label: 'Chinese (中文)' },
  { value: 'fr',    label: 'French (Français)' },
  { value: 'de',    label: 'German (Deutsch)' },
  { value: 'hi',    label: 'Hindi (हिन्दी)' },
  { value: 'ja',    label: 'Japanese (日本語)' },
  { value: 'ko',    label: 'Korean (한국어)' },
  { value: 'ms',    label: 'Malay (Bahasa Melayu)' },
  { value: 'pt',    label: 'Portuguese (Português)' },
  { value: 'ru',    label: 'Russian (Русский)' },
  { value: 'es',    label: 'Spanish (Español)' },
  { value: 'tr',    label: 'Turkish (Türkçe)' },
  { value: 'ur',    label: 'Urdu (اردو)' },
];

const TIMEZONES = [
  { value: 'Pacific/Midway',        label: '(UTC-11:00) Midway Island' },
  { value: 'Pacific/Honolulu',      label: '(UTC-10:00) Hawaii' },
  { value: 'America/Anchorage',     label: '(UTC-09:00) Alaska' },
  { value: 'America/Los_Angeles',   label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { value: 'America/Denver',        label: '(UTC-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Chicago',       label: '(UTC-06:00) Central Time (US & Canada)' },
  { value: 'America/New_York',      label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Caracas',       label: '(UTC-04:30) Caracas' },
  { value: 'America/Halifax',       label: '(UTC-04:00) Atlantic Time (Canada)' },
  { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) Buenos Aires' },
  { value: 'Atlantic/South_Georgia',label: '(UTC-02:00) South Georgia' },
  { value: 'Atlantic/Azores',       label: '(UTC-01:00) Azores' },
  { value: 'UTC',                   label: '(UTC+00:00) UTC / GMT' },
  { value: 'Europe/London',         label: '(UTC+00:00) London, Dublin' },
  { value: 'Europe/Paris',          label: '(UTC+01:00) Paris, Berlin, Rome' },
  { value: 'Europe/Istanbul',       label: '(UTC+03:00) Istanbul' },
  { value: 'Asia/Dubai',            label: '(UTC+04:00) Dubai, Abu Dhabi' },
  { value: 'Asia/Kabul',            label: '(UTC+04:30) Kabul' },
  { value: 'Asia/Karachi',          label: '(UTC+05:00) Karachi, Islamabad' },
  { value: 'Asia/Kolkata',          label: '(UTC+05:30) Mumbai, New Delhi' },
  { value: 'Asia/Kathmandu',        label: '(UTC+05:45) Kathmandu' },
  { value: 'Asia/Dhaka',            label: '(UTC+06:00) Dhaka, Almaty' },
  { value: 'Asia/Rangoon',          label: '(UTC+06:30) Rangoon (Yangon)' },
  { value: 'Asia/Bangkok',          label: '(UTC+07:00) Bangkok, Jakarta' },
  { value: 'Asia/Shanghai',         label: '(UTC+08:00) Beijing, Singapore' },
  { value: 'Asia/Tokyo',            label: '(UTC+09:00) Tokyo, Seoul' },
  { value: 'Australia/Darwin',      label: '(UTC+09:30) Darwin' },
  { value: 'Australia/Sydney',      label: '(UTC+10:00) Sydney, Melbourne' },
  { value: 'Pacific/Auckland',      label: '(UTC+12:00) Auckland, Fiji' },
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (31/12/2025)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (12/31/2025)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (2025-12-31)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY  (31-12-2025)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY  (31.12.2025)' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY  (31 Dec 2025)' },
  { value: 'MMMM D, YYYY', label: 'MMMM D, YYYY  (December 31, 2025)' },
];

export default function GeneralSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const { refresh: refreshGlobalSettings } = useSettings();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULTS);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const loadSettings = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/settings/general`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setSettings({ ...DEFAULTS, ...data.settings });
      }
    } catch {
      showAlert('error', 'Failed to load settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadSettings();
  }, [isAuthenticated, router, loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/settings/general`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings({ ...DEFAULTS, ...data.settings });
        refreshGlobalSettings(); // push changes to SettingsContext app-wide
        showAlert('success', 'General settings saved successfully.');
      } else {
        showAlert('error', data.error || 'Failed to save settings.');
      }
    } catch {
      showAlert('error', 'Network error while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const set = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const inp = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';
  const sec = 'bg-white rounded-lg shadow-sm border border-gray-200 p-6';
  const h2c = 'text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2';

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Sidebar currentPath="/settings/general" onLogout={logout} />

      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">

        {/* Alert */}
        {alert && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 border ${alert.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <Icon
              path={alert.type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}
              className={`w-5 h-5 flex-shrink-0 ${alert.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
            />
            <span className={`text-sm ${alert.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{alert.message}</span>
          </div>
        )}

        {/* Breadcrumb + Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <span>›</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">General Settings</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">General Settings</h1>
          <p className="text-gray-600 mt-1 text-sm lg:text-base">Configure company details, regional preferences, and application behaviour</p>
        </div>

        <div className="space-y-6">

          {/* ── Company ─────────────────────────────────────────────────── */}
          <div className={sec}>
            <h2 className={h2c}>
              <Icon path="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              Company
            </h2>
            <div className="max-w-lg">
              <label className={lbl}>Company Name</label>
              <input
                type="text"
                className={inp}
                placeholder="e.g. Acme Corporation"
                value={settings.companyName}
                onChange={(e) => set('companyName', e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Displayed on reports, exports, and the login page.</p>
            </div>
          </div>

          {/* ── Regional ────────────────────────────────────────────────── */}
          <div className={sec}>
            <h2 className={h2c}>
              <Icon path="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              Regional &amp; Localisation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={lbl}>Language</label>
                <select className={inp} value={settings.language} onChange={(e) => set('language', e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Interface language (UI labels, messages).</p>
              </div>

              <div>
                <label className={lbl}>Time Zone</label>
                <select className={inp} value={settings.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Used for attendance timestamps and reports.</p>
              </div>
            </div>
          </div>

          {/* ── Date & Time ─────────────────────────────────────────────── */}
          <div className={sec}>
            <h2 className={h2c}>
              <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              Date &amp; Time Format
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={lbl}>Date Format</label>
                <select className={inp} value={settings.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
                  {DATE_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Controls how dates appear across the application.</p>
              </div>

              <div>
                <label className={lbl}>Time Format</label>
                <div className="flex gap-3 mt-1">
                  {(['12h', '24h'] as const).map((fmt) => (
                    <label
                      key={fmt}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-colors text-sm font-medium ${
                        settings.timeFormat === fmt
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="timeFormat"
                        value={fmt}
                        checked={settings.timeFormat === fmt}
                        onChange={() => set('timeFormat', fmt)}
                        className="sr-only"
                      />
                      <Icon
                        path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        className="w-4 h-4"
                      />
                      {fmt === '12h' ? '12 Hour (AM/PM)' : '24 Hour'}
                      {fmt === '12h' && <span className="text-xs text-gray-400">(Default)</span>}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">How times are displayed in attendance and access records.</p>
              </div>
            </div>
          </div>

          {/* ── Appearance ──────────────────────────────────────────────── */}
          <div className={sec}>
            <h2 className={h2c}>
              <Icon path="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              Appearance
            </h2>
            <div>
              <label className={lbl}>Theme</label>
              <div className="flex gap-4 mt-1">
                {([
                  { value: 'light', label: 'Light', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z', note: '(Default)' },
                  { value: 'dark',  label: 'Dark',  icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z', note: '' },
                ] as const).map(({ value, label, icon, note }) => (
                  <label
                    key={value}
                    className={`flex items-center gap-3 px-5 py-3 rounded-lg border-2 cursor-pointer transition-colors text-sm font-medium ${
                      settings.theme === value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={value}
                      checked={settings.theme === value}
                      onChange={() => set('theme', value)}
                      className="sr-only"
                    />
                    <Icon path={icon} className="w-5 h-5" />
                    <span>{label}</span>
                    {note && <span className="text-xs text-gray-400">{note}</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Dark theme support is being rolled out progressively.</p>
            </div>
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => router.back()}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

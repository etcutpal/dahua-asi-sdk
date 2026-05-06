'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export interface GeneralSettings {
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

interface SettingsContextType {
  settings: GeneralSettings;
  isLoaded: boolean;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULTS,
  isLoaded: false,
  refresh: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  const applyTheme = (theme: 'light' | 'dark') => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  };

  const load = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/settings/general`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          const merged: GeneralSettings = { ...DEFAULTS, ...data.settings };
          setSettings(merged);
          applyTheme(merged.theme);
        }
      }
    } catch {
      // Keep defaults on network error
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-apply theme whenever it changes (e.g. after hot reload)
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  return (
    <SettingsContext.Provider value={{ settings, isLoaded, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  return useContext(SettingsContext);
}

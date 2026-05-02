'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AppConfig {
  localApiUrl: string;
  publicApiUrl: string;
  publicEnabled: boolean;
}

interface ConfigContextType {
  config: AppConfig | null;
  apiUrl: string;
  isLoaded: boolean;
  refreshConfig: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  localApiUrl: 'http://localhost:3001',
  publicApiUrl: '',
  publicEnabled: false,
};

const ConfigContext = createContext<ConfigContextType>({
  config: null,
  apiUrl: DEFAULT_CONFIG.localApiUrl,
  isLoaded: false,
  refreshConfig: () => {},
});

function isPrivateHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  // 10.x.x.x
  if (/^10\./.test(hostname)) return true;
  // 172.16.x.x - 172.31.x.x
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  // 192.168.x.x
  if (/^192\.168\./.test(hostname)) return true;
  return false;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_CONFIG.localApiUrl);
  const [isLoaded, setIsLoaded] = useState(false);

  function resolveUrl(data: AppConfig): string {
    if (typeof window === 'undefined') return data.localApiUrl || DEFAULT_CONFIG.localApiUrl;
    const hostname = window.location.hostname;
    if (data.publicEnabled && data.publicApiUrl && !isPrivateHostname(hostname)) {
      return data.publicApiUrl;
    }
    return data.localApiUrl || DEFAULT_CONFIG.localApiUrl;
  }

  const loadConfig = () => {
    fetch('/config.json')
      .then((res) => res.json())
      .then((data: AppConfig) => {
        setConfig(data);
        setApiUrl(resolveUrl(data));
        setIsLoaded(true);
      })
      .catch(() => {
        setConfig(DEFAULT_CONFIG);
        setApiUrl(DEFAULT_CONFIG.localApiUrl);
        setIsLoaded(true);
      });
  };

  useEffect(() => {
    loadConfig(); // fetch once on mount
  }, []);

  return (
    <ConfigContext.Provider value={{ config, apiUrl, isLoaded, refreshConfig: loadConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextType {
  return useContext(ConfigContext);
}

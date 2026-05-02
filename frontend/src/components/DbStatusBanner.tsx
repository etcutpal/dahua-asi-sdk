'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '@/context/ConfigContext';

export default function DbStatusBanner() {
  const { apiUrl } = useConfig();
  const [dbDown, setDbDown] = useState(false);
  const [dbInfo, setDbInfo] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok && res.status === 503) {
          // Server responded but DB is degraded
          const data = await res.json() as any;
          if (!mounted) return;
          setDbDown(true);
          if (data.database && !data.database.connected) {
            setDbInfo(data.database.message || `${data.database.type || 'SQL'} at ${data.database.host || '?'}`);
          }
          return;
        }
        // OK response — everything good
        if (!mounted) return;
        setDbDown(false);
        setDbInfo('');
      } catch {
        if (mounted) {
          setDbDown(true);
          setDbInfo(`Cannot reach backend at ${apiUrl}`);
        }
      }
    }

    check();
    const interval = setInterval(check, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [apiUrl]);

  if (!dbDown) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white text-sm font-medium shadow-lg">
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Database unavailable</span>
        {dbInfo && (
          <>
            <span className="opacity-60">—</span>
            <span className="opacity-80 text-xs">{dbInfo}</span>
          </>
        )}
        <span className="opacity-60">—</span>
        <span className="opacity-80 text-xs">App is using local JSON storage. Check your Database Settings.</span>
      </div>
    </div>
  );
}

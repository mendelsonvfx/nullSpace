import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    downloadUrl: string;
    notes?: string;
    releaseUrl?: string;
    pubDate?: string;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const frequency = localStorage.getItem('updateCheckFrequency') || '24h';
      if (frequency === 'never') return;

      if (frequency !== 'launch') {
        const intervalMs: Record<string, number> = {
          '1h': 3_600_000,
          '24h': 86_400_000,
          '7d': 604_800_000,
        };
        const lastCheck = parseInt(localStorage.getItem('lastUpdateCheck') || '0');
        if (Date.now() - lastCheck < (intervalMs[frequency] ?? 86_400_000)) return;
      }

      try {
        const info = await invoke<{
          version: string;
          download_url: string;
          notes: string | null;
          release_url: string | null;
          pub_date: string | null;
        } | null>('check_for_update');
        localStorage.setItem('lastUpdateCheck', Date.now().toString());
        if (info) {
          setUpdateInfo({
            version: info.version,
            downloadUrl: info.download_url,
            notes: info.notes ?? undefined,
            releaseUrl: info.release_url ?? undefined,
            pubDate: info.pub_date ?? undefined,
          });
        }
      } catch {
        // Silently ignore — network unavailable, no releases, etc.
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const info = (e as CustomEvent<{
        version: string;
        download_url: string;
        notes: string | null;
        release_url: string | null;
        pub_date: string | null;
      }>).detail;
      setUpdateInfo({
        version: info.version,
        downloadUrl: info.download_url,
        notes: info.notes ?? undefined,
        releaseUrl: info.release_url ?? undefined,
        pubDate: info.pub_date ?? undefined,
      });
    };
    window.addEventListener('nullspace:update-available', handler);
    return () => window.removeEventListener('nullspace:update-available', handler);
  }, []);

  return {
    updateInfo,
    dismissUpdate: () => setUpdateInfo(null),
  };
}

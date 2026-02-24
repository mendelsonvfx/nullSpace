import { save } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import { getVersion } from '@tauri-apps/api/app';

const EXPORT_VERSION = 1;

const LOCAL_STORAGE_KEYS = [
  'clients',
  'otherProjectTransactionsByPath',
  'time-statistics-storage',
  'categories',
  'softwarePaths',
  'accentColor',
  'customAccentColors',
  'animationsEnabled',
  'modalBlurEnabled',
  'blendPreviewsEnabled',
  'showTagIcons',
  'showCategoryBar',
  'baseCurrency',
  'convertToBaseCurrency',
  'revenueNormalizationThresholds',
  'manualExchangeRates',
  'exchangeRateMode',
  'exchangeRatesCache',
  'timeTrackingEnabled',
  'breakRemindersEnabled',
  'breakIntervals',
  'deadlineNotifications',
  'deadlineNotificationDays',
  'defaultProjectsPath',
  'setupCompleted',
  'selectedCategory',
  'shotsBrowserDocked',
  'windowSettings',
  'shotsbrowser_showSearchFilter',
  'shotsbrowser_showSpecialContextButtons',
];

export interface ExportData {
  version: number;
  exportedAt: string;
  appVersion: string;
  localStorage: Record<string, string | null>;
  archivedBackups: unknown[];
}

export async function exportData(): Promise<boolean> {
  const localStorageData: Record<string, string | null> = {};
  for (const key of LOCAL_STORAGE_KEYS) {
    localStorageData[key] = localStorage.getItem(key);
  }

  let archivedBackups: unknown[] = [];
  try {
    archivedBackups = await invoke<unknown[]>('get_archived_backups');
  } catch (e) {
    console.warn('[Export] Failed to get archived backups:', e);
  }

  let appVersion = '0.0.0';
  try {
    appVersion = await getVersion();
  } catch {
    // ignore
  }

  const data: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    localStorage: localStorageData,
    archivedBackups,
  };

  const filePath = await save({
    defaultPath: `nullspace-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (!filePath) return false;

  await writeTextFile(filePath, JSON.stringify(data, null, 2));
  return true;
}

export async function readExportFile(filePath: string): Promise<ExportData | null> {
  try {
    const content = await readTextFile(filePath);
    const data = JSON.parse(content);
    if (!data.version || !data.localStorage || typeof data.localStorage !== 'object') {
      return null;
    }
    return data as ExportData;
  } catch {
    return null;
  }
}

export async function applyImport(data: ExportData): Promise<void> {
  // Restore localStorage
  for (const [key, value] of Object.entries(data.localStorage)) {
    if (value !== null && value !== undefined) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }

  // Restore archived backups
  if (data.archivedBackups && data.archivedBackups.length > 0) {
    for (const backup of data.archivedBackups) {
      const backupObj = backup as Record<string, unknown>;
      const projectId = backupObj.id as string;
      if (projectId) {
        try {
          await invoke('backup_project_json', {
            projectId,
            jsonData: JSON.stringify(backup),
          });
        } catch (e) {
          console.warn(`[Import] Failed to restore backup for project ${projectId}:`, e);
        }
      }
    }
  }
}

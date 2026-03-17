// src/components/modals/SettingsPanel.tsx
import { useProjectStore } from '../../store/projectStore';
import React, { useState, useEffect, useRef } from 'react';
import { X, FolderOpen, Check, AlertCircle, Plus, Settings, Trash2, RefreshCw, Download, Upload } from 'lucide-react';
import { selectProjectDirectory, selectExecutable, detectInstalledSoftware } from '../../utils/tauri';
import { SoftwareIcon } from '../SoftwareIcon';
import type { SoftwareName } from '../../types/project';
import { useThumbnailCache } from '../../hooks/useThumbnailCache';
import { CustomSelect } from '../ui/CustomSelect';
import { ColorPickerPopup } from '../ui/ColorPickerPopup';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/tauri';
import { useModalBlur } from '../../hooks/useModalBlur';
import { clearAllTimeTrackingData } from '../../utils/clearAllData';
import { exportData, readExportFile, applyImport, type ExportData } from '../../utils/dataExportImport';
import { open } from '@tauri-apps/api/dialog';
import { hslStringToHex } from '../../utils/colorUtils';
import SimpleBar from 'simplebar-react';

interface SettingsPanelProps {
  onClose: () => void;
  onDeleteClient?: (clientId: string, clientName: string) => void;
}

interface SoftwarePathConfig {
  name: SoftwareName;
  displayName: string;
  path: string;
}

const DEFAULT_SOFTWARE: Array<{ name: SoftwareName; displayName: string }> = [
  { name: 'blender', displayName: 'Blender' },
  { name: 'houdini', displayName: 'Houdini' },
  // { name: 'maya', displayName: 'Maya' },
  { name: 'after-effects', displayName: 'After Effects' },
  { name: 'photoshop', displayName: 'Photoshop' },
  // { name: 'cinema4d', displayName: 'Cinema 4D' },
  // { name: 'substance', displayName: 'Substance Painter' },
  // { name: 'unreal', displayName: 'Unreal Engine' },
  // { name: 'unity', displayName: 'Unity' },
  // { name: 'zbrush', displayName: 'ZBrush' },
  // { name: 'marmoset', displayName: 'Marmoset Toolbag' },
];

// Helper function to check if path is a valid executable
function isValidExecutablePath(path: string): boolean {
  if (!path) return false;
  return path.toLowerCase().endsWith('.exe');
}

export function SettingsPanel({ onClose, onDeleteClient }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'software' | 'appearance' | 'clients' | 'finance' | 'categories' | 'data'>('general');
  const [softwarePaths, setSoftwarePaths] = useState<SoftwarePathConfig[]>([]);
  const [appVersion, setAppVersion] = useState<string>('');
  const [showTagIcons, setShowTagIcons] = useState(() => {
    const saved = localStorage.getItem('showTagIcons');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Modal blur effect
  const blurClass = useModalBlur();

  const handleSave = () => {
    // Save software paths to localStorage
    if (activeTab === 'software' && softwarePaths.length > 0) {
      const pathsToSave: Record<string, string> = {};
      softwarePaths.forEach(sw => {
        if (sw.path) {
          pathsToSave[sw.name] = sw.path;
        }
      });
      localStorage.setItem('softwarePaths', JSON.stringify(pathsToSave));
      console.log('Software paths saved:', pathsToSave);
    }

    // Save appearance settings
    if (activeTab === 'appearance') {
      localStorage.setItem('showTagIcons', JSON.stringify(showTagIcons));
    }

    onClose();
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
      onClose();
    }
    delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
  };

  // Load app version on mount
  useEffect(() => {
    getVersion().then(version => {
      setAppVersion(version);
    }).catch(err => {
      console.error('Failed to get app version:', err);
      setAppVersion('0.6.0');
    });
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div data-settings-panel className="bg-card-bg border border-border-secondary rounded-card max-w-4xl w-full h-[80vh] min-h-[580px] flex overflow-hidden animate-modal" onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="w-48 border-r border-border-secondary p-4 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>

          <nav className="space-y-1 flex-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'general'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('software')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'software'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              Software Paths
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'appearance'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              Appearance
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'clients'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              Clients
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'finance'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              Finance
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`w-full text-left px-3 py-2 rounded-button transition-colors ${
                activeTab === 'data'
                  ? 'bg-accent'
                  : 'hover:bg-hover-bg'
              }`}
            >
              Data
            </button>
          </nav>

          {/* Version info at bottom */}
          <div className="mt-4">
            <div className="text-xs text-text-muted text-center">
              nullSpace v{appVersion || '0.6.0'}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-border-secondary">
            <h3 className="text-xl font-semibold">
              {activeTab === 'general' && 'General Settings'}
              {activeTab === 'software' && 'Software Paths'}
              {activeTab === 'appearance' && 'Appearance'}
                            {activeTab === 'clients' && 'Clients'}
              {activeTab === 'finance' && 'Finance Settings'}
              {activeTab === 'data' && 'Data'}
            </h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors"
            >
              <X className="w-5 h-5 close-button-red" />
            </button>
          </div>

          {/* Content Area */}
          <SimpleBar className="flex-1 custom-page-scrollbar" autoHide={false}>
            <div className="p-6">
              {activeTab === 'general' && <GeneralSettings />}
              {activeTab === 'software' && <SoftwareSettings softwarePaths={softwarePaths} setSoftwarePaths={setSoftwarePaths} />}
              {activeTab === 'appearance' && <AppearanceSettings showTagIcons={showTagIcons} setShowTagIcons={setShowTagIcons} />}
              {activeTab === 'clients' && <ClientsSettings onDeleteClient={onDeleteClient} />}
              {activeTab === 'finance' && <FinanceSettings />}
              {activeTab === 'data' && <DataSettings />}
            </div>
          </SimpleBar>

          {/* Footer */}
          <div className="border-t border-border-secondary px-6 py-4 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium animate-button"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { defaultProjectsPath, setDefaultProjectsPath, loadProjects } = useProjectStore();
  const [projectsDir, setProjectsDir] = useState(defaultProjectsPath);
  const [timeTrackingEnabled, setTimeTrackingEnabled] = useState(() => {
    const saved = localStorage.getItem('timeTrackingEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('deadlineNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [deadlineDays, setDeadlineDays] = useState(() => {
    const saved = localStorage.getItem('deadlineNotificationDays');
    return saved !== null ? parseInt(saved) : 3;
  });

  const handleBrowseDirectory = async () => {
    const selected = await selectProjectDirectory();
    if (selected) {
      setProjectsDir(selected);
      setDefaultProjectsPath(selected);
      setTimeout(() => {
        loadProjects();
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      {/* Projects Directory */}
      <div>
        <div className="mb-3">
          <label className="block font-medium mb-1">Projects Directory</label>
          <p className="text-sm text-text-muted">
            Default location where projects are stored and loaded from
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectsDir}
            onChange={(e) => setProjectsDir(e.target.value)}
            className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 min-h-[38px] text-sm focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleBrowseDirectory}
            className="px-3 py-2 min-h-[38px] text-sm bg-sidebar-bg border border-border-primary hover:border-border-secondary rounded-button transition-colors flex items-center gap-2 animate-button"
          >
            <FolderOpen className="w-4 h-4" />
            Browse
          </button>
        </div>
      </div>

      {/* Time Tracking Feature */}
      <div className="border-t border-border-secondary pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium mb-1">Time Tracking & Analytics</div>
            <p className="text-sm text-text-muted">
              <span className="text-orange-400 font-semibold">experimental!</span> Enable automatic time tracking when launching software from projects
            </p>
          </div>
          <button
            onClick={() => {
              const newValue = !timeTrackingEnabled;
              setTimeTrackingEnabled(newValue);
              localStorage.setItem('timeTrackingEnabled', JSON.stringify(newValue));
              window.dispatchEvent(new Event('storage'));
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              timeTrackingEnabled ? 'bg-accent' : 'bg-border-secondary'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                timeTrackingEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="border-t border-border-secondary pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium mb-1">Deadline Notifications</div>
            <p className="text-sm text-text-muted">
              Show notifications for projects with upcoming deadlines
            </p>
          </div>
          <button
            onClick={() => {
              const newValue = !notifications;
              setNotifications(newValue);
              localStorage.setItem('deadlineNotifications', JSON.stringify(newValue));
              window.dispatchEvent(new Event('storage'));
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              notifications ? 'bg-accent' : 'bg-border-secondary'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                notifications ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {notifications && (
          <div className="ml-0 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium mb-1">Days Before Deadline</div>
                <p className="text-sm text-text-muted">
                  Show notifications when deadline is within this many days
                </p>
              </div>
              <input
                type="number"
                min="0"
                max="7"
                value={deadlineDays}
                onChange={(e) => {
                  const newValue = Math.min(7, Math.max(0, parseInt(e.target.value) || 0));
                  setDeadlineDays(newValue);
                  localStorage.setItem('deadlineNotificationDays', newValue.toString());
                  window.dispatchEvent(new Event('storage'));
                }}
                className="w-20 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent text-center"
              />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function DataSettings() {
  const { loadProjects } = useProjectStore();
  const { clearAllThumbnails, getCacheSize } = useThumbnailCache();

  // Thumbnail Cache state
  const [cacheSize, setCacheSize] = useState(0);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Clear Time Data state
  const [timeDataCleared, setTimeDataCleared] = useState(false);
  const [showClearTimeConfirm, setShowClearTimeConfirm] = useState(false);

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importExportError, setImportExportError] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<ExportData | null>(null);

  useEffect(() => {
    getCacheSize().then(setCacheSize);
  }, [getCacheSize]);

  const handleClearCache = async () => {
    if (cacheSize === 0) return;
    await clearAllThumbnails();
    setCacheSize(0);
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
    loadProjects();
  };

  const handleClearTimeData = async () => {
    await clearAllTimeTrackingData();
    setTimeDataCleared(true);
    setShowClearTimeConfirm(false);
    setTimeout(() => setTimeDataCleared(false), 3000);
    loadProjects();
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setImportExportError(null);
    try {
      const success = await exportData();
      if (success) {
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3000);
      }
    } catch (e) {
      setImportExportError('Export failed: ' + String(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = async () => {
    setImportExportError(null);
    setImportSuccess(false);
    try {
      const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });
      if (!filePath || Array.isArray(filePath)) return;

      setIsImporting(true);
      const data = await readExportFile(filePath as string);
      if (!data) {
        setImportExportError('Invalid backup file.');
        setIsImporting(false);
        return;
      }
      setPendingImportData(data);
      setShowImportConfirm(true);
      setIsImporting(false);
    } catch (e) {
      setImportExportError('Import failed: ' + String(e));
      setIsImporting(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!pendingImportData) return;
    setIsImporting(true);
    try {
      await applyImport(pendingImportData);
      setImportSuccess(true);
      setShowImportConfirm(false);
      setPendingImportData(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setImportExportError('Import failed: ' + String(e));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thumbnail Cache */}
      <div>
        <div className="mb-3">
          <div className="font-medium mb-1">Thumbnail Cache</div>
          <p className="text-sm text-text-muted">
            Clear cached thumbnails to force reload. Useful if thumbnails appear outdated.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearCache}
            disabled={cacheSize === 0}
            className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors flex items-center gap-2 text-sm font-medium animate-button"
          >
            <RefreshCw className="w-4 h-4" />
            Clear Cache ({cacheSize} thumbnails)
          </button>
          {cacheCleared && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <Check className="w-4 h-4" />
              Cache cleared
            </div>
          )}
        </div>
      </div>

      {/* Clear Time Tracking Data */}
      <div className="border-t border-border-secondary pt-6">
        <div className="mb-3">
          <div className="font-medium mb-1 text-red-400">Clear Time Tracking Data</div>
          <p className="text-sm text-text-muted">
            Permanently delete all time tracking data from all projects. This includes all time entries, project time statistics, and global software statistics. This action cannot be undone.
          </p>
        </div>

        {!showClearTimeConfirm ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowClearTimeConfirm(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium animate-button"
            >
              <Trash2 className="w-4 h-4" />
              Clear All Time Data
            </button>
            {timeDataCleared && (
              <div className="flex items-center gap-2 text-green-500 text-sm">
                <Check className="w-4 h-4" />
                Time data cleared
              </div>
            )}
          </div>
        ) : (
          <div className="bg-red-950/30 border border-red-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-red-400 mb-2">Are you sure?</div>
                <div className="text-sm text-text-primary space-y-1">
                  <p>This action will delete:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>All time entries from all projects</li>
                    <li>Total time spent on projects</li>
                    <li>Global software statistics</li>
                  </ul>
                  <p className="mt-2 font-medium text-red-300">This action is irreversible!</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClearTimeData}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium animate-button"
              >
                <Trash2 className="w-4 h-4" />
                Yes, delete all data
              </button>
              <button
                onClick={() => setShowClearTimeConfirm(false)}
                className="px-4 py-2 bg-border-secondary hover:bg-border-secondary rounded-button transition-colors text-sm font-medium animate-button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Export & Import */}
      <div className="border-t border-border-secondary pt-6">
        <div className="mb-3">
          <div className="font-medium mb-1">Export & Import</div>
          <p className="text-sm text-text-muted">
            Export all settings, clients, financial data, time statistics, and archived project backups to a file. Use this to transfer data between devices or before reinstalling.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors flex items-center gap-2 text-sm font-medium animate-button"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export Data'}
          </button>
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors flex items-center gap-2 text-sm font-medium animate-button"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import Data'}
          </button>
          {exportSuccess && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <Check className="w-4 h-4" />
              Data exported
            </div>
          )}
          {importSuccess && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <Check className="w-4 h-4" />
              Data imported — reloading...
            </div>
          )}
          {importExportError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {importExportError}
            </div>
          )}
        </div>

        {showImportConfirm && (
          <div className="mt-3 bg-amber-950/30 border border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-amber-400 mb-2">Confirm Import</div>
                <div className="text-sm text-text-primary space-y-1">
                  <p>This will overwrite your current settings with the backup data:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>All app settings and preferences</li>
                    <li>Client data</li>
                    <li>Financial data and statistics</li>
                    <li>Archived project backups</li>
                  </ul>
                  <p className="mt-2">
                    Exported on: {pendingImportData?.exportedAt
                      ? new Date(pendingImportData.exportedAt).toLocaleDateString()
                      : 'Unknown'} (v{pendingImportData?.appVersion})
                  </p>
                  <p className="mt-2 font-medium text-amber-300">
                    The page will reload after import.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleImportConfirm}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium animate-button"
              >
                <Upload className="w-4 h-4" />
                Yes, import data
              </button>
              <button
                onClick={() => { setShowImportConfirm(false); setPendingImportData(null); }}
                className="px-4 py-2 bg-border-secondary hover:bg-border-secondary rounded-button transition-colors text-sm font-medium animate-button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SoftwareSettings({
  softwarePaths,
  setSoftwarePaths
}: {
  softwarePaths: SoftwarePathConfig[];
  setSoftwarePaths: React.Dispatch<React.SetStateAction<SoftwarePathConfig[]>>
}) {
  // Load saved paths from localStorage on mount
  useEffect(() => {
    const savedPaths = localStorage.getItem('softwarePaths');
    const pathsMap: Record<string, string> = savedPaths ? JSON.parse(savedPaths) : {};

    const initialPaths = DEFAULT_SOFTWARE.map(sw => ({
      ...sw,
      path: pathsMap[sw.name] || ''
    }));

    setSoftwarePaths(initialPaths);
  }, []);

  const handleBrowseExecutable = async (index: number) => {
    const selected = await selectExecutable();
    if (selected) {
      setSoftwarePaths(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], path: selected };
        return updated;
      });
    }
  };

  const [isDetecting, setIsDetecting] = useState(false);

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const detected = await detectInstalledSoftware();
      console.log('Detected software:', detected);

      // Update software paths with detected ones
      setSoftwarePaths(prev => {
        return prev.map(sw => {
          if (detected[sw.name]) {
            return { ...sw, path: detected[sw.name] };
          }
          return sw;
        });
      });
    } catch (error) {
      console.error('Failed to auto-detect software:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Configure paths to installed 3D software applications
        </p>
        <button
          onClick={handleAutoDetect}
          disabled={isDetecting}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium animate-button flex items-center gap-2"
        >
          {isDetecting && <RefreshCw className="w-4 h-4 animate-spin" />}
          {isDetecting ? 'Detecting...' : 'Auto-Detect'}
        </button>
      </div>

      <div className="space-y-3">
        {softwarePaths.map((sw, index) => (
          <div key={sw.name} className="bg-sidebar-bg rounded-button p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <SoftwareIcon name={sw.name} className="w-5 h-5" />
                <h4 className="font-medium">{sw.displayName}</h4>
                {isValidExecutablePath(sw.path) && (
                  <Check className="w-3 h-3 text-green-500" />
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={sw.path}
                onChange={(e) => {
                  // Remove quotes from path if present
                  let cleanPath = e.target.value.trim();
                  if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
                      (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
                    cleanPath = cleanPath.slice(1, -1);
                  }
                  setSoftwarePaths(prev => {
                    const updated = [...prev];
                    updated[index] = { ...updated[index], path: cleanPath };
                    return updated;
                  });
                }}
                placeholder={`Path to ${sw.displayName} executable...`}
                className="flex-1 bg-app-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => handleBrowseExecutable(index)}
                className="px-3 py-2 bg-border-secondary hover:bg-border-secondary rounded-button transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettings({ showTagIcons, setShowTagIcons }: { showTagIcons: boolean; setShowTagIcons: (value: boolean) => void }) {
  const [accentColor, setAccentColor] = useState(() => {
    const saved = localStorage.getItem('accentColor');
    return saved || '#9103c6';
  });
  const [customColor, setCustomColor] = useState('#9103C6');
  const pendingColorRef = useRef('#9103C6');
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    const saved = localStorage.getItem('animationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [modalBlurEnabled, setModalBlurEnabled] = useState(() => {
    const saved = localStorage.getItem('modalBlurEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [blendPreviewsEnabled, setBlendPreviewsEnabled] = useState(() => {
    const saved = localStorage.getItem('blendPreviewsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Window settings
  const [autoMaximizeOnLaunch, setAutoMaximizeOnLaunch] = useState(false);
  const [preferredMonitor, setPreferredMonitor] = useState(0);
  const [monitors, setMonitors] = useState<Array<{
    index: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    is_primary: boolean;
  }>>([]);

  const defaultAccentColors = [
    { name: 'Purple', value: '#9103c6' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Orange', value: '#f97316' },
  ];

  const [customColors, setCustomColors] = useState<string[]>(() => {
    const saved = localStorage.getItem('customAccentColors');
    return saved ? JSON.parse(saved) : [];
  });

  const handleColorChange = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--accent-color', color);

    // Calculate darker hover color (reduce lightness by ~10%)
    const hoverColor = adjustColorBrightness(color, -20);
    document.documentElement.style.setProperty('--accent-color-hover', hoverColor);

    // Trigger re-render across components
    window.dispatchEvent(new Event('storage'));
  };

  // Helper function to darken/lighten color
  const adjustColorBrightness = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1).toUpperCase();
  };

  const handleCustomColorAdd = () => {
    const color = pendingColorRef.current;
    if (color && /^#[0-9A-F]{6}$/i.test(color)) {
      // Добавить кастомный цвет в список, если его там еще нет
      if (!customColors.includes(color.toUpperCase())) {
        const updatedColors = [...customColors, color.toUpperCase()];
        setCustomColors(updatedColors);
        localStorage.setItem('customAccentColors', JSON.stringify(updatedColors));
      }
      handleColorChange(color);
      setShowCustomColorPicker(false);
      setCustomColor('#9103C6');
      pendingColorRef.current = '#9103C6';
      if (pickerTriggerRef.current) pickerTriggerRef.current.style.backgroundColor = '';
    }
  };

  const handleRemoveCustomColor = (colorToRemove: string) => {
    const updatedColors = customColors.filter(c => c !== colorToRemove);
    setCustomColors(updatedColors);
    localStorage.setItem('customAccentColors', JSON.stringify(updatedColors));

    // Если удаляемый цвет был выбран, переключиться на дефолтный
    if (accentColor === colorToRemove) {
      handleColorChange('#9103c6');
    }
  };

  // Load monitors and window settings
  useEffect(() => {
    const loadMonitorsAndSettings = async () => {
      try {
        const monitorsData = await invoke<Array<{
          index: number;
          name: string;
          x: number;
          y: number;
          width: number;
          height: number;
          is_primary: boolean;
        }>>('get_available_monitors');
        setMonitors(monitorsData);

        const settings = localStorage.getItem('windowSettings');
        if (settings) {
          const parsed = JSON.parse(settings);
          setAutoMaximizeOnLaunch(parsed.autoMaximizeOnLaunch || false);
          setPreferredMonitor(parsed.preferredMonitor || 0);
        }
      } catch (error) {
        console.error('Failed to load monitors:', error);
      }
    };

    loadMonitorsAndSettings();
  }, []);

  useEffect(() => {
    // Apply saved accent color on mount
    const savedColor = localStorage.getItem('accentColor');
    if (savedColor) {
      document.documentElement.style.setProperty('--accent-color', savedColor);
      const hoverColor = adjustColorBrightness(savedColor, -20);
      document.documentElement.style.setProperty('--accent-color-hover', hoverColor);
    }
  }, []);

  // Helper to update window settings
  const updateWindowSettings = (updates: Partial<{
    autoMaximizeOnLaunch: boolean;
    preferredMonitor: number;
    preferredMonitorName: string;
  }>) => {
    const current = localStorage.getItem('windowSettings');
    const settings = current ? JSON.parse(current) : {};
    const updated = { ...settings, ...updates };
    localStorage.setItem('windowSettings', JSON.stringify(updated));
  };

  const handleResetWindowPosition = async () => {
    try {
      await invoke('reset_window_position');
      localStorage.removeItem('windowState');
      console.log('Window position reset');
    } catch (error) {
      console.error('Failed to reset window position:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium mb-3 text-text-muted">Theme</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled
            className="p-4 rounded-button border-2 border-border-primary/50 bg-sidebar-bg/30 cursor-not-allowed opacity-50"
          >
            <div className="w-full h-20 bg-white/20 rounded mb-2" />
            <div className="text-sm font-medium text-text-muted">Light</div>
          </button>
          <button
            disabled
            className="p-4 rounded-button border-2 border-accent/50 bg-sidebar-bg/30 cursor-not-allowed opacity-50"
          >
            <div className="w-full h-20 bg-zinc-950/50 rounded mb-2" />
            <div className="text-sm font-medium text-text-muted">Dark</div>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <label className="block text-sm font-medium mb-3">Accent Color</label>
        <div className="flex gap-3 flex-wrap items-center">
          {defaultAccentColors.map(color => (
            <button
              key={color.value}
              onClick={() => handleColorChange(color.value)}
              className={`w-12 h-12 rounded-lg border-2 transition-all ${
                accentColor === color.value
                  ? 'border-white scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
          {customColors.map(color => (
            <div key={color} className="relative group">
              <button
                onClick={() => handleColorChange(color)}
                className={`w-12 h-12 rounded-lg border-2 transition-all ${
                  accentColor === color
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                title="Custom color"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveCustomColor(color);
                }}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove custom color"
              >
                <X size={8} strokeWidth={2.5} />
              </button>
            </div>
          ))}
          <button
            ref={pickerTriggerRef}
            onClick={() => {
              if (!showCustomColorPicker && pickerTriggerRef.current) {
                const rect = pickerTriggerRef.current.getBoundingClientRect();
                const popupWidth = 224;
                const popupHeight = 390;
                const left = rect.left + popupWidth > window.innerWidth ? window.innerWidth - popupWidth - 8 : rect.left;
                const top = rect.bottom + 8 + popupHeight > window.innerHeight ? rect.top - popupHeight - 8 : rect.bottom - 8;
                setPickerPos({ top, left });
                pendingColorRef.current = customColor;
                pickerTriggerRef.current.style.backgroundColor = customColor;
              }
              setShowCustomColorPicker(v => !v);
            }}
            className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center ${
              showCustomColorPicker ? 'border-white' : 'border-dashed border-border-primary hover:border-border-hover transition-colors'
            }`}
            title="Add custom color"
          >
            {!showCustomColorPicker && <span className="text-text-muted">+</span>}
          </button>
        </div>

      </div>

      {/* Custom color picker popup (fixed, so not clipped by overflow-hidden on modal) */}
      <ColorPickerPopup
        isOpen={showCustomColorPicker}
        color={customColor}
        position={pickerPos}
        triggerRef={pickerTriggerRef as React.RefObject<HTMLElement>}
        onChange={(hex) => {
          pendingColorRef.current = hex;
          if (pickerTriggerRef.current) pickerTriggerRef.current.style.backgroundColor = hex;
        }}
        onApply={handleCustomColorAdd}
        onCancel={() => {
          setShowCustomColorPicker(false);
          pendingColorRef.current = '#9103C6';
          if (pickerTriggerRef.current) pickerTriggerRef.current.style.backgroundColor = '';
        }}
      />

      {/* Animations */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Animations</div>
          <p className="text-sm text-text-muted">
            Enable smooth transitions and animations
          </p>
        </div>
        <button
          onClick={() => {
            const newValue = !animationsEnabled;
            setAnimationsEnabled(newValue);
            localStorage.setItem('animationsEnabled', JSON.stringify(newValue));
            if (newValue) {
              document.body.classList.remove('animations-disabled');
            } else {
              document.body.classList.add('animations-disabled');
            }
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            animationsEnabled ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              animationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Modal Blur */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Modal Blur Effect</div>
          <p className="text-sm text-text-muted">
            Add subtle blur to background when modals are open
          </p>
        </div>
        <button
          onClick={() => {
            const newValue = !modalBlurEnabled;
            setModalBlurEnabled(newValue);
            localStorage.setItem('modalBlurEnabled', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            modalBlurEnabled ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              modalBlurEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Compact Mode */}
      <div className="flex items-center justify-between opacity-50">
        <div>
          <div className="font-medium mb-1 text-text-muted">Compact Mode</div>
          <p className="text-sm text-text-muted">
            Use smaller spacing and UI elements
          </p>
        </div>
        <button
          disabled
          className="w-12 h-6 rounded-full bg-border-secondary/50 relative cursor-not-allowed"
        >
          <div className="w-5 h-5 bg-white/50 rounded-full absolute top-0.5 left-0.5" />
        </button>
      </div>

      {/* Tag Icons */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Tag Icons</div>
          <p className="text-sm text-text-muted">
            Display icons in client and payment status tags
          </p>
        </div>
        <button
          onClick={() => {
            const newValue = !showTagIcons;
            setShowTagIcons(newValue);
            localStorage.setItem('showTagIcons', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors ${
            showTagIcons ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
            showTagIcons ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* Blender File Previews */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Blender File Previews</div>
          <p className="text-sm text-text-muted">
            Show thumbnail previews for .blend files in Versions Overview
          </p>
        </div>
        <button
          onClick={() => {
            const newValue = !blendPreviewsEnabled;
            setBlendPreviewsEnabled(newValue);
            localStorage.setItem('blendPreviewsEnabled', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors ${
            blendPreviewsEnabled ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
            blendPreviewsEnabled ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* Window Settings */}
      <div className="border-t border-border-secondary pt-6">
        <label className="block text-sm font-medium mb-3">Window Settings</label>

        {/* Auto-Maximize on Launch */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-medium mb-1">Auto-Maximize on Launch</div>
            <p className="text-sm text-text-muted">
              Automatically maximize nullSpace window on startup
            </p>
          </div>
          <button
            onClick={() => {
              const newValue = !autoMaximizeOnLaunch;
              setAutoMaximizeOnLaunch(newValue);
              updateWindowSettings({ autoMaximizeOnLaunch: newValue });
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              autoMaximizeOnLaunch ? 'bg-accent' : 'bg-border-secondary'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                autoMaximizeOnLaunch ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Monitor Selection (only shown if auto-maximize is enabled) */}
        {autoMaximizeOnLaunch && monitors.length > 0 && (
          <div className="mb-3">
            <div className="mb-3">
              <label className="block font-medium mb-1">Preferred Monitor</label>
              <p className="text-sm text-text-muted">
                Select monitor for auto-maximized window
              </p>
            </div>
            <select
              value={preferredMonitor}
              onChange={(e) => {
                const index = parseInt(e.target.value);
                setPreferredMonitor(index);
                const monitor = monitors[index];
                updateWindowSettings({
                  preferredMonitor: index,
                  preferredMonitorName: monitor?.name || '',
                });
              }}
              className="w-full bg-app-bg border border-border-primary rounded-button px-4 py-2 focus:outline-none focus:border-accent"
            >
              {monitors.map((monitor) => {
                // Extract display number from name like "\\.\DISPLAY3" -> "Display 3"
                const displayNum = monitor.name.match(/DISPLAY(\d+)/)?.[1] || (monitor.index + 1);
                const displayName = `Display ${displayNum}`;

                return (
                  <option key={monitor.index} value={monitor.index}>
                    {monitor.index + 1}. {displayName} {monitor.is_primary ? '(Primary)' : ''} - {monitor.width}x{monitor.height}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Monitor Preview (only shown if multiple monitors and auto-maximize enabled) */}
        {autoMaximizeOnLaunch && monitors.length > 1 && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Monitor Layout</label>
            <div className="bg-sidebar-bg rounded-button p-4 flex items-center justify-center gap-2" style={{ minHeight: '100px' }}>
              {monitors.map((monitor) => {
                const isSelected = monitor.index === preferredMonitor;
                const scale = 60 / Math.max(...monitors.map(m => m.height));
                const width = monitor.width * scale;
                const height = monitor.height * scale;

                return (
                  <div
                    key={monitor.index}
                    className={`relative rounded border-2 transition-all ${
                      isSelected ? 'border-accent bg-accent/20' : 'border-border-primary bg-hover-bg'
                    }`}
                    style={{ width: `${width}px`, height: `${height}px` }}
                  >
                    {monitor.is_primary && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[10px] bg-card-bg px-1 rounded text-text-muted">
                          Primary
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
                      {monitor.index + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reset Window Position Button */}
        <div className="mt-6">
          <button
            onClick={handleResetWindowPosition}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg rounded-button transition-colors text-sm font-medium"
          >
            Reset Window Position
          </button>
          <p className="text-xs text-text-muted mt-2">
            Center window on primary monitor and restore default size (1920x900)
          </p>
        </div>
      </div>
    </div>
  );
}

function ClientsSettings({ onDeleteClient }: { onDeleteClient?: (clientId: string, clientName: string) => void }) {
  const { clients, addClient, updateClient, deleteClient } = useProjectStore();
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientPickerPos, setClientPickerPos] = useState({ top: 0, left: 0 });
  const [clientPickerClientId, setClientPickerClientId] = useState<string | null>(null);
  const [clientOriginalColor, setClientOriginalColor] = useState('');
  const [clientPickerColor, setClientPickerColor] = useState('#9103C6');
  const clientPendingColorRef = useRef('#9103C6');
  const clientPickerTriggerRef = useRef<HTMLElement | null>(null);

  // Generate bright, vibrant color (avoiding brown tones)
  const generateBrightColor = () => {
    const brightColors = [
      '#FF6B6B', // Bright red
      '#4ECDC4', // Bright cyan
      '#45B7D1', // Bright blue
      '#FFA07A', // Light salmon
      '#98D8C8', // Mint
      '#F7DC6F', // Bright yellow
      '#BB8FCE', // Bright purple
      '#85C1E2', // Sky blue
      '#F8B739', // Bright orange
      '#52B788', // Bright green
      '#E74C3C', // Red
      '#3498DB', // Blue
      '#9B59B6', // Purple
      '#1ABC9C', // Turquoise
      '#F39C12', // Orange
      '#E91E63', // Pink
      '#00BCD4', // Cyan
      '#8BC34A', // Light green
      '#FF5722', // Deep orange
      '#9C27B0', // Deep purple
    ];
    return brightColors[Math.floor(Math.random() * brightColors.length)];
  };

  const handleAddClient = () => {
    if (newClientName.trim()) {
      addClient({
        name: newClientName.trim(),
        color: generateBrightColor()
      });
      setNewClientName('');
      setShowAddClient(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Manage your clients and their contact information
        </p>
        <button
          onClick={() => setShowAddClient(!showAddClient)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium flex items-center gap-2 animate-button"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Client
        </button>
      </div>

      {showAddClient && (
        <div className="bg-sidebar-bg rounded-button p-3">
          <label className="block text-xs font-medium mb-2">Client Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              placeholder="Enter client name..."
              className="flex-1 bg-app-bg border border-border-primary rounded-button px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleAddClient}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium animate-button"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddClient(false);
                setNewClientName('');
              }}
              className="px-3 py-1.5 bg-border-secondary hover:bg-border-secondary rounded-button transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {clients.map(client => (
          <div
            key={client.id}
            className="bg-sidebar-bg rounded-button p-3"
          >
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => setEditingClient(editingClient === client.id ? null : client.id)}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: client.color || '#ffffff' }}
              />
              <span className="text-sm font-medium flex-1">{client.name}</span>
              <div className="p-1.5 rounded-button">
                <Settings className={`w-3.5 h-3.5 transition-transform duration-300 ${editingClient === client.id ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {editingClient === client.id && (
              <div className="mt-3 space-y-4">
                {/* Color Picker Section */}
                <button
                  onClick={(e) => {
                    clientPickerTriggerRef.current = e.currentTarget;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const popupWidth = 224, popupHeight = 390;
                    const left = rect.left + popupWidth > window.innerWidth ? window.innerWidth - popupWidth - 8 : rect.left;
                    const top = rect.bottom + 8 + popupHeight > window.innerHeight ? rect.top - popupHeight - 8 : rect.bottom - 8;
                    const hex = hslStringToHex(client.color || '#9103c6');
                    setClientOriginalColor(client.color || '#9103c6');
                    setClientPickerColor(hex);
                    clientPendingColorRef.current = hex;
                    setClientPickerClientId(client.id);
                    setClientPickerPos({ top, left });
                    setShowClientPicker(true);
                  }}
                  className="w-full h-9 rounded-lg border-2 border-white/20 hover:border-white/40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: client.color || '#9103c6' }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-white/80" />
                  <span className="text-xs font-medium text-white/90">Click to change color</span>
                </button>

                {/* Form Fields */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-text-muted">Description</label>
                    <textarea
                      value={client.description || ''}
                      onChange={(e) => updateClient(client.id, { description: e.target.value })}
                      placeholder="Brief description..."
                      rows={2}
                      className="w-full text-sm bg-app-bg/50 border border-border-primary/50 rounded-button px-3 py-2 focus:outline-none focus:border-accent focus:bg-app-bg resize-none transition-all placeholder:text-text-dim"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-text-muted">Website</label>
                    <input
                      type="url"
                      value={client.website || ''}
                      onChange={(e) => updateClient(client.id, { website: e.target.value })}
                      placeholder="https://..."
                      className="w-full text-sm bg-app-bg/50 border border-border-primary/50 rounded-button px-3 py-2 focus:outline-none focus:border-accent focus:bg-app-bg transition-all placeholder:text-text-dim"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 text-text-muted">Telegram</label>
                      <input
                        type="text"
                        value={client.telegram || ''}
                        onChange={(e) => updateClient(client.id, { telegram: e.target.value })}
                        placeholder="@username"
                        className="w-full text-sm bg-app-bg/50 border border-border-primary/50 rounded-button px-3 py-2 focus:outline-none focus:border-accent focus:bg-app-bg transition-all placeholder:text-text-dim"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 text-text-muted">Instagram</label>
                      <input
                        type="text"
                        value={client.instagram || ''}
                        onChange={(e) => updateClient(client.id, { instagram: e.target.value })}
                        placeholder="@username"
                        className="w-full text-sm bg-app-bg/50 border border-border-primary/50 rounded-button px-3 py-2 focus:outline-none focus:border-accent focus:bg-app-bg transition-all placeholder:text-text-dim"
                      />
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const clientName = client.name;
                    const clientId = client.id;

                    // Close editing mode
                    setEditingClient(null);

                    // Use custom confirm dialog if provided, otherwise use native confirm
                    if (onDeleteClient) {
                      onDeleteClient(clientId, clientName);
                    } else {
                      const confirmed = confirm(`Delete client "${clientName}"?`);
                      if (confirmed) {
                        deleteClient(clientId);
                      }
                    }
                  }}
                  className="w-full px-4 py-2.5 text-sm bg-red-600/90 hover:bg-red-600 rounded-lg transition-all font-medium shadow-lg shadow-red-900/20 hover:shadow-red-900/40"
                >
                  Delete Client
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {clients.length === 0 && !showAddClient && (
        <div className="text-center py-8">
          <p className="text-text-muted mb-4">No clients yet</p>
          <button
            onClick={() => setShowAddClient(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Your First Client
          </button>
        </div>
      )}

      <ColorPickerPopup
        isOpen={showClientPicker}
        color={clientPickerColor}
        position={clientPickerPos}
        triggerRef={clientPickerTriggerRef as React.RefObject<HTMLElement>}
        onChange={(hex) => {
          clientPendingColorRef.current = hex;
          if (clientPickerTriggerRef.current) clientPickerTriggerRef.current.style.backgroundColor = hex;
        }}
        onApply={() => {
          if (clientPickerClientId) updateClient(clientPickerClientId, { color: clientPendingColorRef.current });
          setShowClientPicker(false);
        }}
        onCancel={() => {
          if (clientPickerClientId) updateClient(clientPickerClientId, { color: clientOriginalColor });
          if (clientPickerTriggerRef.current) clientPickerTriggerRef.current.style.backgroundColor = clientOriginalColor;
          setShowClientPicker(false);
        }}
      />
    </div>
  );
}

function FinanceSettings() {
  const [baseCurrency, setBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('baseCurrency');
    return saved || 'USD';
  });
  const [convertToBaseCurrency, setConvertToBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('convertToBaseCurrency');
    return saved ? JSON.parse(saved) : false;
  });
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>(() => {
    const saved = localStorage.getItem('exchangeRateMode');
    return (saved as 'auto' | 'manual') || 'auto';
  });
  const [exchangeRates, setExchangeRates] = useState<Record<string, Record<string, number>>>(() => {
    const saved = localStorage.getItem('manualExchangeRates');
    return saved ? JSON.parse(saved) : {
      USD: { USD: 1, RUB: 90, EUR: 0.92 },
      RUB: { USD: 0.011, RUB: 1, EUR: 0.01 },
      EUR: { USD: 1.09, RUB: 100, EUR: 1 }
    };
  });
  const [autoRates, setAutoRates] = useState<Record<string, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<{ from: string; to: string } | null>(null);
  const [revenueThresholds, setRevenueThresholds] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('revenueNormalizationThresholds');
    return saved ? JSON.parse(saved) : {
      RUB: 250000,
      USD: 2500,
      EUR: 2500
    };
  });

  const currencySymbols: Record<string, string> = {
    USD: '$',
    RUB: '₽',
    EUR: '€'
  };

  const handleBaseCurrencyChange = (currency: string) => {
    setBaseCurrency(currency);
    localStorage.setItem('baseCurrency', currency);
    window.dispatchEvent(new Event('storage'));

    // Если режим авто, обновить курсы для новой валюты
    if (rateMode === 'auto') {
      fetchAutoRates(currency);
    }
  };

  const handleConvertToggle = () => {
    const newValue = !convertToBaseCurrency;
    setConvertToBaseCurrency(newValue);
    localStorage.setItem('convertToBaseCurrency', JSON.stringify(newValue));
    window.dispatchEvent(new Event('storage'));
  };

  const handleRateModeChange = (mode: 'auto' | 'manual') => {
    setRateMode(mode);
    localStorage.setItem('exchangeRateMode', mode);

    if (mode === 'auto') {
      fetchAutoRates(baseCurrency);
    }

    // Уведомить другие компоненты об изменении режима
    window.dispatchEvent(new Event('storage'));
  };

  const fetchAutoRates = async (currency: string) => {
    let loadingTimeout: number | null = null;

    try {
      // Устанавливаем состояние загрузки только если запрос занимает больше 200мс
      loadingTimeout = window.setTimeout(() => {
        setIsLoadingRates(true);
      }, 200);

      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
      if (!response.ok) throw new Error('Failed to fetch rates');

      const data = await response.json();
      setAutoRates(data.rates);
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
      // Использовать дефолтные курсы при ошибке
      setAutoRates(exchangeRates[currency]);
    } finally {
      // Отменяем таймер, если запрос завершился быстро
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      setIsLoadingRates(false);
    }
  };

  const handleManualRateChange = (from: string, to: string, newRate: number) => {
    setExchangeRates(prev => {
      const updated = { ...prev };
      if (!updated[from]) {
        updated[from] = {};
      }
      updated[from][to] = newRate;

      // Также обновить обратный курс
      if (!updated[to]) {
        updated[to] = {};
      }
      updated[to][from] = 1 / newRate;

      localStorage.setItem('manualExchangeRates', JSON.stringify(updated));
      return updated;
    });
    setEditingRate(null);
  };

  // const getCurrentRates = () => {
  //   if (rateMode === 'auto' && autoRates) {
  //     return autoRates;
  //   }
  //   return exchangeRates[baseCurrency] || exchangeRates.USD;
  // };

  // const currentRates = getCurrentRates(); // Unused for now

  return (
    <div className="space-y-6">
      {/* Currency Settings */}
      <div>
        <div className="mb-3">
          <label className="block font-medium mb-1">Base Currency</label>
          <p className="text-sm text-text-muted">
            Select the base currency for financial reports
          </p>
        </div>
        <CustomSelect
          value={baseCurrency}
          onChange={handleBaseCurrencyChange}
          options={[
            { value: 'USD', label: 'USD ($)' },
            { value: 'RUB', label: 'RUB (₽)' },
            { value: 'EUR', label: 'EUR (€)' },
          ]}
        />
      </div>

      {/* Convert to Base Currency */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Convert to Base Currency</div>
          <p className="text-sm text-text-muted">
            Automatically convert all revenue to the selected currency
          </p>
        </div>
        <button
          onClick={handleConvertToggle}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            convertToBaseCurrency ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              convertToBaseCurrency ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Exchange Rate Mode */}
      {convertToBaseCurrency && (
        <div className="border-t border-border-secondary pt-6">
          <label className="block text-sm font-medium mb-3">Exchange Rate Source</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleRateModeChange('auto')}
              className={`p-4 rounded-button border-2 transition-colors text-left ${
                rateMode === 'auto'
                  ? 'border-accent bg-accent/10'
                  : 'border-border-primary bg-sidebar-bg hover:border-border-hover'
              }`}
            >
              <div className="font-medium mb-1">Automatic</div>
              <p className="text-xs text-text-muted">
                Get real-time rates from the internet
              </p>
            </button>
            <button
              onClick={() => handleRateModeChange('manual')}
              className={`p-4 rounded-button border-2 transition-colors text-left ${
                rateMode === 'manual'
                  ? 'border-accent bg-accent/10'
                  : 'border-border-primary bg-sidebar-bg hover:border-border-hover'
              }`}
            >
              <div className="font-medium mb-1">Manual</div>
              <p className="text-xs text-text-muted">
                Set custom exchange rates
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Exchange Rates Display */}
      {convertToBaseCurrency && (
        <div className="border-t border-border-secondary pt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Exchange Rates</label>
            {rateMode === 'auto' && (
              <button
                onClick={() => fetchAutoRates(baseCurrency)}
                disabled={isLoadingRates}
                className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 rounded-button transition-colors text-sm flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRates ? 'animate-spin' : ''}`} />
                {isLoadingRates ? 'Updating...' : 'Update'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {Object.keys(currencySymbols).map(currency => {
              if (currency === baseCurrency) return null;

              // В авто режиме берем курсы из autoRates, в ручном из exchangeRates
              let rate = 0;
              if (rateMode === 'auto' && autoRates) {
                // autoRates содержит прямые курсы от базовой валюты
                // Нужно инвертировать для отображения "сколько базовой за 1 другую"
                rate = autoRates[currency] ? 1 / autoRates[currency] : 0;
              } else {
                // В ручном режиме: exchangeRates[baseCurrency][currency] = сколько базовой за 1 другую
                rate = exchangeRates[baseCurrency]?.[currency] || 0;
              }

              const isEditing = editingRate?.from === baseCurrency && editingRate?.to === currency;
              const isDisabled = rateMode === 'auto';

              return (
                <div
                  key={currency}
                  className={`flex items-center justify-between rounded-button px-4 py-3 transition-colors ${
                    isDisabled ? 'bg-sidebar-bg/50' : 'bg-sidebar-bg'
                  }`}
                >
                  <span className={`text-sm ${isDisabled ? 'text-text-muted' : ''}`}>
                    1 {currencySymbols[currency]} ({currency})
                  </span>
                  <div className="flex items-center gap-2">
                    {rateMode === 'manual' && isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={rate.toFixed(2)}
                        onBlur={(e) => handleManualRateChange(baseCurrency, currency, parseFloat(e.target.value) || rate)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleManualRateChange(baseCurrency, currency, parseFloat(e.currentTarget.value) || rate);
                          }
                        }}
                        className="w-24 bg-app-bg border border-border-primary rounded px-2 py-1 text-sm focus:outline-none focus:border-accent text-right"
                        autoFocus
                      />
                    ) : (
                      <span className={`text-sm font-medium ${isDisabled ? 'text-text-muted' : ''}`}>
                        {rate.toFixed(2)} {currencySymbols[baseCurrency]}
                      </span>
                    )}
                    {rateMode === 'manual' && (
                      <button
                        onClick={() => setEditingRate(isEditing ? null : { from: baseCurrency, to: currency })}
                        className="p-1.5 hover:bg-hover-bg rounded transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 animate-settings-icon" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {lastUpdated && rateMode === 'auto' && (
            <p className="text-xs text-text-muted mt-3">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}

          {rateMode === 'manual' && (
            <p className="text-xs text-text-muted mt-3">
              Click the settings icon to edit exchange rates
            </p>
          )}
        </div>
      )}

      {/* Revenue Normalization Threshold */}
      <div className="border-t border-border-secondary pt-6">
        <div className="mb-3">
          <label className="block font-medium mb-1">Revenue Normalization Threshold</label>
          <p className="text-sm text-text-muted">
            Set minimum threshold for revenue chart normalization. Charts will scale to at least this value.
          </p>
        </div>

        <div className="flex items-center justify-between bg-sidebar-bg rounded-button px-4 py-2.5">
          <span className="text-sm">
            {baseCurrency} ({currencySymbols[baseCurrency]})
          </span>
          <input
            type="number"
            min="0"
            step={baseCurrency === 'RUB' ? '10000' : '100'}
            value={revenueThresholds[baseCurrency]}
            onChange={(e) => {
              const newValue = parseInt(e.target.value) || 0;
              const updated = { ...revenueThresholds, [baseCurrency]: newValue };
              setRevenueThresholds(updated);
              localStorage.setItem('revenueNormalizationThresholds', JSON.stringify(updated));
              window.dispatchEvent(new Event('storage'));
            }}
            className="w-32 bg-app-bg border border-border-primary rounded-button px-3 py-1.5 text-sm focus:outline-none focus:border-accent text-right"
          />
        </div>
      </div>
    </div>
  );
}
// src/components/modals/SettingsPanel.tsx
import { useProjectStore } from '../../store/projectStore';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Check, AlertCircle, Plus, Settings, Trash2, RefreshCw, Download, Upload, Cpu, Palette, Users, DollarSign, Database, Rocket, Loader2, Globe, ChevronDown } from 'lucide-react';
import { selectProjectDirectory, selectExecutable } from '../../utils/tauri';
import { getCustomItems, saveCustomItems, getSoftwareEnabled, saveSoftwareEnabled, getExeIcon, sampleColorFromDataUrl, extractNameFromPath } from '../../utils/launcherUtils';
import { getSoftwareMeta } from '../../utils/softwareMeta';
import { SoftwareAppIcon } from '../shared/SoftwareAppIcon';
import type { CustomLauncherItem } from '../../types/launcher';
import type { SoftwareName } from '../../types/project';
import { useThumbnailCache } from '../../hooks/useThumbnailCache';
import { CustomSelect } from '../ui/CustomSelect';
import { ColorPickerPopup } from '../ui/ColorPickerPopup';
import { getVersion } from '@tauri-apps/api/app';
import { SupportButton } from '../ui/SupportButton';
import { invoke } from '@tauri-apps/api/tauri';
import { useModalBlur } from '../../hooks/useModalBlur';
import { clearAllTimeTrackingData } from '../../utils/clearAllData';
import { exportData, readExportFile, applyImport, type ExportData } from '../../utils/dataExportImport';
import { open } from '@tauri-apps/api/dialog';
import { hslStringToHex } from '../../utils/colorUtils';
import { getHoursPerWorkDay, saveHoursPerWorkDay } from '../../utils/financeSettings';
import SimpleBar from 'simplebar-react';

export type SettingsTab = 'general' | 'software' | 'launcher' | 'appearance' | 'clients' | 'finance' | 'categories' | 'data';

interface SettingsPanelProps {
  onClose: () => void;
  onDeleteClient?: (clientId: string, clientName: string) => void;
  initialTab?: SettingsTab;
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
  { name: 'cinema4d', displayName: 'Cinema 4D' },
  { name: 'substance', displayName: 'Substance Painter' },
  { name: 'unreal', displayName: 'Unreal Engine' },
  { name: 'davinci', displayName: 'DaVinci Resolve' },
  // { name: 'unity', displayName: 'Unity' },
  // { name: 'zbrush', displayName: 'ZBrush' },
  // { name: 'marmoset', displayName: 'Marmoset Toolbag' },
];

// Helper function to check if path is a valid executable
function isValidExecutablePath(path: string): boolean {
  if (!path) return false;
  return path.toLowerCase().endsWith('.exe');
}

export function SettingsPanel({ onClose, onDeleteClient, initialTab }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'general');
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
      window.dispatchEvent(new CustomEvent('softwarePaths:updated'));
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
      <div data-settings-panel className="bg-card-bg border border-border-secondary rounded-[12px] max-w-[860px] w-full h-[80vh] min-h-[520px] flex flex-col overflow-hidden animate-modal" onClick={(e) => e.stopPropagation()}>

        {/* Top header — "Settings" title + X */}
        <div className="flex items-center justify-between px-5 py-[14px] border-b border-border-primary flex-shrink-0">
          <span className="text-base font-semibold">Settings</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors"
          >
            <X className="w-[15px] h-[15px] close-button-red" />
          </button>
        </div>

        {/* Body: nav + content side by side */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[180px] border-r border-border-primary px-3 py-5 flex flex-col flex-shrink-0">
            <nav className="flex flex-col gap-[9px] flex-1">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'general'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Settings className="w-[17px] h-[17px] flex-shrink-0" />
                General
              </button>
              <button
                onClick={() => setActiveTab('software')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'software'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Cpu className="w-[17px] h-[17px] flex-shrink-0" />
                Software Paths
              </button>
              <button
                onClick={() => setActiveTab('launcher')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'launcher'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Rocket className="w-[17px] h-[17px] flex-shrink-0" />
                Tool Launcher
              </button>
              <button
                onClick={() => setActiveTab('appearance')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'appearance'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Palette className="w-[17px] h-[17px] flex-shrink-0" />
                Appearance
              </button>
              <button
                onClick={() => setActiveTab('clients')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'clients'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Users className="w-[17px] h-[17px] flex-shrink-0" />
                Clients
              </button>
              <button
                onClick={() => setActiveTab('finance')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'finance'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <DollarSign className="w-[17px] h-[17px] flex-shrink-0" />
                Finance
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-[9px] text-[15px] transition-colors ${
                  activeTab === 'data'
                    ? 'bg-[var(--accent-color-subtle)] text-text-primary border border-accent'
                    : 'border border-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <Database className="w-[17px] h-[17px] flex-shrink-0" />
                Data
              </button>
            </nav>

            <div className="mt-auto pt-4">
              <SupportButton vertical accent className="mb-3 mx-auto w-[150px]" />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'monospace' }}>
                nullSpace v{appVersion || '0.6.0'}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Content Area */}
            <SimpleBar className="flex-1 custom-page-scrollbar" autoHide={false}>
              <div className="px-6 py-0">
                {activeTab === 'general' && <GeneralSettings />}
                {activeTab === 'software' && <SoftwareSettings softwarePaths={softwarePaths} setSoftwarePaths={setSoftwarePaths} />}
                {activeTab === 'launcher' && <LauncherSettings />}
                {activeTab === 'appearance' && <AppearanceSettings showTagIcons={showTagIcons} setShowTagIcons={setShowTagIcons} />}
                {activeTab === 'clients' && <ClientsSettings onDeleteClient={onDeleteClient} />}
                {activeTab === 'finance' && <FinanceSettings />}
                {activeTab === 'data' && <DataSettings />}
              </div>
            </SimpleBar>

            {/* Footer */}
            <div className="border-t border-border-primary px-6 py-[14px] flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={onClose}
                className="px-3 py-[7px] text-sm bg-card-bg hover:bg-hover-bg border border-border-secondary rounded-badge transition-colors animate-button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-[7px] text-sm bg-accent hover:bg-accent-hover rounded-badge transition-colors font-semibold animate-button"
              >
                Save Changes
              </button>
            </div>
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
  const [autoDeleteBlend1, setAutoDeleteBlend1] = useState(() => {
    const saved = localStorage.getItem('autoDeleteBlend1Backups');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [deadlineDays, setDeadlineDays] = useState(() => {
    const saved = localStorage.getItem('deadlineNotificationDays');
    return saved !== null ? parseInt(saved) : 3;
  });
  const [updateCheckFrequency, setUpdateCheckFrequency] = useState(() => {
    return localStorage.getItem('updateCheckFrequency') || 'launch';
  });
  type CheckStatus = 'idle' | 'checking' | 'up-to-date' | 'error';
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle');

  const handleCheckNow = async () => {
    setCheckStatus('checking');
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
        window.dispatchEvent(new CustomEvent('nullspace:update-available', { detail: info }));
        setCheckStatus('idle');
      } else {
        setCheckStatus('up-to-date');
        setTimeout(() => setCheckStatus('idle'), 3000);
      }
    } catch {
      setCheckStatus('error');
      setTimeout(() => setCheckStatus('idle'), 3000);
    }
  };

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
    <div>
      {/* Projects Directory */}
      <div className="py-4 border-b border-border-primary">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5">Projects Directory</div>
          <p className="text-xs text-text-muted">
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
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Time Tracking & Analytics</div>
          <p className="text-xs text-text-muted">
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
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
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

      {/* Auto-delete .blend1 backups */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Auto-delete .blend1 backups</div>
          <p className="text-xs text-text-muted">
            Automatically delete Blender backup files (.blend1) when a new version is saved
          </p>
        </div>
        <button
          onClick={() => {
            const newValue = !autoDeleteBlend1;
            setAutoDeleteBlend1(newValue);
            localStorage.setItem('autoDeleteBlend1Backups', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            autoDeleteBlend1 ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              autoDeleteBlend1 ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Deadline Notifications */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Deadline Notifications</div>
          <p className="text-xs text-text-muted">
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
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
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
        <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
          <div>
            <div className="text-sm font-semibold mb-0.5">Days Before Deadline</div>
            <p className="text-xs text-text-muted">
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
      )}

      {/* Software Update Check */}
      <div className="flex items-center justify-between py-4 gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Software Update Check</div>
          <p className="text-xs text-text-muted">
            How often to check for new versions
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCheckNow}
            disabled={checkStatus !== 'idle'}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-button bg-sidebar-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkStatus === 'checking' && <RefreshCw className="w-4 h-4 animate-spin" />}
            {checkStatus === 'idle' && <RefreshCw className="w-4 h-4" />}
            {checkStatus === 'up-to-date' && <Check className="w-4 h-4 text-green-400" />}
            {checkStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
            <span className={
              checkStatus === 'up-to-date' ? 'text-green-400' :
              checkStatus === 'error' ? 'text-red-400' : ''
            }>
              {checkStatus === 'idle' && 'Check Now'}
              {checkStatus === 'checking' && 'Checking...'}
              {checkStatus === 'up-to-date' && 'Up to date'}
              {checkStatus === 'error' && 'Check failed'}
            </span>
          </button>
          <CustomSelect
            value={updateCheckFrequency}
            onChange={(val) => {
              setUpdateCheckFrequency(val);
              localStorage.setItem('updateCheckFrequency', val);
              window.dispatchEvent(new Event('storage'));
            }}
            options={[
              { value: 'launch', label: 'Every launch' },
              { value: '1h', label: 'Every hour' },
              { value: '24h', label: 'Every 24 hours' },
              { value: '7d', label: 'Every week' },
              { value: 'never', label: 'Never' },
            ]}
            className="w-40"
          />
        </div>
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
    <div>
      {/* Thumbnail Cache */}
      <div className="py-4 border-b border-border-primary">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5">Thumbnail Cache</div>
          <p className="text-xs text-text-muted">
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
      <div className="py-4 border-b border-border-primary">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5 text-red-400">Clear Time Tracking Data</div>
          <p className="text-xs text-text-muted">
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
      <div className="py-4">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5">Export & Import</div>
          <p className="text-xs text-text-muted">
            Export all settings, clients, financial data, time statistics, and archived project backups to a file. Use this to transfer data between devices or before reinstalling.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors flex items-center gap-2 text-sm font-medium animate-button"
          >
            <Upload className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export Data'}
          </button>
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors flex items-center gap-2 text-sm font-medium animate-button"
          >
            <Download className="w-4 h-4" />
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
  useEffect(() => {
    const savedPaths = localStorage.getItem('softwarePaths');
    const pathsMap: Record<string, string> = savedPaths ? JSON.parse(savedPaths) : {};
    setSoftwarePaths(DEFAULT_SOFTWARE.map(sw => ({ ...sw, path: pathsMap[sw.name] || '' })));
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

  const handleClearPath = (index: number) => {
    setSoftwarePaths(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], path: '' };
      return updated;
    });
  };

  return (
    <div className="pt-4 pb-2">
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-1">
        Configure paths to installed software
      </p>

      <div className="space-y-2">
        {softwarePaths.map((sw, index) => {
          const valid = isValidExecutablePath(sw.path);
          return (
            <div
              key={sw.name}
              className="group flex items-center gap-[14px] px-[14px] py-3 rounded-[10px] border transition-colors"
              style={{
                background: valid ? '#0f0f12' : '#120f0c',
                borderColor: valid ? '#202026' : '#3a2a18',
              }}
            >
              {/* Icon */}
              {/* Icon of the picked exe; path not set → dashed frame with the abbreviation */}
              <SoftwareAppIcon softwareKey={sw.name} path={sw.path} unset={!valid} box={40} iconSize={28} radius={11} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[7px]">
                  <span className="text-[13px] font-semibold text-text-primary">{sw.displayName}</span>
                  {valid ? (
                    <Check style={{ width: 11, height: 11, color: '#5fbf7a', flexShrink: 0 }} />
                  ) : (
                    <span className="flex items-center gap-[4px] text-[10px] font-semibold" style={{ color: '#d99a3d' }}>
                      <AlertCircle style={{ width: 10, height: 10 }} />
                      Path not set
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono truncate mt-0.5" style={{ color: '#66666e' }}>
                  {sw.path || `Path to ${sw.displayName} executable…`}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-none">
                {valid && (
                  <button
                    onClick={() => handleClearPath(index)}
                    className="w-[30px] h-[30px] flex items-center justify-center rounded-[7px]
                               text-text-muted hover:bg-red-500/15 hover:text-red-400
                               opacity-0 pointer-events-none
                               group-hover:opacity-100 group-hover:pointer-events-auto
                               transition-all duration-150"
                  >
                    <X className="w-[14px] h-[14px]" />
                  </button>
                )}
                <button
                  onClick={() => handleBrowseExecutable(index)}
                  className="w-[30px] h-[30px] flex items-center justify-center rounded-[7px] text-text-muted hover:bg-hover-bg hover:text-text-primary transition-colors"
                >
                  <FolderOpen className="w-[14px] h-[14px]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Toggle UI helper ----

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      className="flex-none cursor-pointer"
      style={{
        width: 38, height: 22, borderRadius: 11,
        background: on ? 'linear-gradient(180deg,#7c3aed,#6d28d9)' : '#242429',
        position: 'relative',
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 19 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: on ? '#fff' : '#7a7a83',
        boxShadow: '0 1px 3px rgba(0,0,0,.4)',
        transition: 'left 0.15s ease, background 0.15s ease',
      }} />
    </div>
  );
}

// ---- LauncherSettings ----

function LauncherSettings() {
  const [swPaths, setSwPaths] = useState<Record<string, string>>({});
  const [swEnabled, setSwEnabled] = useState<Record<string, boolean>>({});
  const [customItems, setCustomItems] = useState<CustomLauncherItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const [launcherEnabled, setLauncherEnabled] = useState(() =>
    JSON.parse(localStorage.getItem('toolLauncherEnabled') ?? 'false')
  );
  const [showLauncherWarning, setShowLauncherWarning] = useState(false);

  const handleLauncherToggle = () => {
    if (!launcherEnabled) {
      const timeTracking = JSON.parse(localStorage.getItem('timeTrackingEnabled') ?? 'true');
      if (timeTracking) {
        setShowLauncherWarning(true);
        return;
      }
    }
    const newVal = !launcherEnabled;
    setLauncherEnabled(newVal);
    localStorage.setItem('toolLauncherEnabled', JSON.stringify(newVal));
    window.dispatchEvent(new Event('storage'));
  };

  useEffect(() => {
    mountedRef.current = true;
    try { setSwPaths(JSON.parse(localStorage.getItem('softwarePaths') ?? '{}')); } catch { setSwPaths({}); }
    setSwEnabled(getSoftwareEnabled());
    setCustomItems(getCustomItems());
    return () => { mountedRef.current = false; };
  }, []);

  const configuredSw = Object.entries(swPaths).filter(([, p]) => p && p.trim());

  const handleSwToggle = (key: string, val: boolean) => {
    const next = { ...swEnabled, [key]: val };
    setSwEnabled(next);
    saveSoftwareEnabled(next);
  };

  const handleCustomToggle = (id: string, val: boolean) => {
    const next = customItems.map(i => i.id === id ? { ...i, enabled: val } : i);
    setCustomItems(next);
    saveCustomItems(next);
  };

  const handleCustomDelete = (id: string) => {
    const next = customItems.filter(i => i.id !== id);
    setCustomItems(next);
    saveCustomItems(next);
  };

  const extractAndStore = async (path: string): Promise<{ iconBase64?: string; brandColor: string }> => {
    const raw = await getExeIcon(path).catch(() => undefined);
    const iconBase64 = raw?.startsWith('data:image/') ? raw : undefined;
    const brandColor = iconBase64 ? await sampleColorFromDataUrl(iconBase64) : '#6366f1';
    return { iconBase64, brandColor };
  };

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const path = await selectExecutable();
      if (!path || !mountedRef.current) return;
      if (customItems.some(i => i.path === path)) return;
      const { iconBase64, brandColor } = await extractAndStore(path);
      if (!mountedRef.current) return;
      const name = extractNameFromPath(path);
      const newItem: CustomLauncherItem = { id: crypto.randomUUID(), name, path, iconBase64, brandColor, enabled: true };
      const next = [...customItems, newItem];
      setCustomItems(next);
      saveCustomItems(next);
    } finally {
      if (mountedRef.current) setIsAdding(false);
    }
  };

  const handleBrowseExisting = async (id: string) => {
    setLoadingItemId(id);
    try {
      const path = await selectExecutable();
      if (!path || !mountedRef.current) return;
      const { iconBase64, brandColor } = await extractAndStore(path);
      if (!mountedRef.current) return;
      const name = extractNameFromPath(path);
      const next = customItems.map(i => i.id === id ? { ...i, path, name, iconBase64, brandColor } : i);
      setCustomItems(next);
      saveCustomItems(next);
    } finally {
      if (mountedRef.current) setLoadingItemId(null);
    }
  };

  const handleNameChange = (id: string, name: string) => {
    const next = customItems.map(i => i.id === id ? { ...i, name } : i);
    setCustomItems(next);
    saveCustomItems(next);
  };

  return (
    <div className="pt-4 pb-2 space-y-5">

      {/* Warning dialog — rendered via portal to cover full app */}
      {showLauncherWarning && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-[200]"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setShowLauncherWarning(false)}
        >
          <div
            className="bg-card-bg border border-orange-600 rounded-modal p-6 mx-4 text-text-primary"
            style={{ maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="font-bold text-base mb-2 text-text-primary">Tool Launcher</div>
            <p className="text-[13px] text-text-secondary leading-relaxed mb-5">
              Launching software through the Tool Launcher does not start the time tracker.
              To track time, open a project and use the software buttons there.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLauncherWarning(false)}
                className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors animate-button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLauncherWarning(false);
                  setLauncherEnabled(true);
                  localStorage.setItem('toolLauncherEnabled', 'true');
                  window.dispatchEvent(new Event('storage'));
                }}
                className="px-4 py-2 rounded-lg transition-colors font-medium animate-button bg-orange-600 hover:bg-orange-700"
              >
                Enable anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Enable/disable toggle — top of section */}
      <div className="flex items-center justify-between pb-5 border-b border-border-primary">
        <div>
          <div className="text-[13px] font-semibold text-text-primary">Enable Tool Launcher</div>
          <div className="text-[12px] text-text-muted mt-0.5">Show a software launcher when no project is open</div>
        </div>
        <Toggle on={launcherEnabled} onChange={handleLauncherToggle} />
      </div>

      {/* Custom items section — always shown */}
      <div>
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-1">Custom software</p>
          <div className="space-y-2">
            {customItems.map(item => {
              const isOn = item.enabled !== false;
              const abbr = (item.name || 'App').slice(0, 2).toUpperCase();
              const isLoading = loadingItemId === item.id;
              return (
                <div key={item.id} className="flex items-center gap-[14px] px-[14px] py-3 rounded-[10px] border"
                  style={{ background: '#0f0f12', borderColor: '#202026' }}>
                  {/* Icon */}
                  {item.iconBase64 ? (
                    <div className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none bg-card-bg">
                      <img src={item.iconBase64} alt={item.name} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none select-none font-bold text-white text-[13px]"
                      style={{ background: `radial-gradient(circle at 30% 30%, ${item.brandColor ?? '#6366f1'}88, ${item.brandColor ?? '#6366f1'}44)` }}>
                      {abbr}
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={item.name ?? ''}
                      onChange={(e) => handleNameChange(item.id, e.target.value)}
                      placeholder="App name…"
                      className="text-[13px] font-semibold text-text-primary bg-transparent border-0 focus:outline-none w-full p-0 leading-none"
                    />
                    <div className="text-[11px] font-mono truncate mt-0.5" style={{ color: '#66666e' }}>{item.path}</div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={() => handleBrowseExisting(item.id)}
                      disabled={isLoading}
                      className="w-[30px] h-[30px] flex items-center justify-center rounded-[7px] text-text-muted hover:bg-hover-bg hover:text-text-primary transition-colors disabled:opacity-40"
                    >
                      {isLoading ? <Loader2 className="w-[14px] h-[14px] animate-spin" /> : <FolderOpen className="w-[14px] h-[14px]" />}
                    </button>
                    <button
                      onClick={() => handleCustomDelete(item.id)}
                      className="w-[30px] h-[30px] flex items-center justify-center rounded-[7px] text-text-muted hover:bg-red-500/15 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-[14px] h-[14px]" />
                    </button>
                    <Toggle on={isOn} onChange={v => handleCustomToggle(item.id, v)} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add software button — inside Custom section */}
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="w-full mt-2 flex items-center justify-center gap-[9px] py-[14px] rounded-[10px] border border-dashed border-border-secondary
                       text-[13px] font-semibold text-text-muted transition-colors
                       hover:border-border-hover hover:text-text-primary
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add software…
          </button>
        </div>

      {/* Software Paths section */}
      {configuredSw.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-1">From Software Paths</p>
          <div className="space-y-2">
            {configuredSw.map(([key]) => {
              const meta = getSoftwareMeta(key);
              const isOn = swEnabled[key] !== false;
              return (
                <div key={key} className="flex items-center gap-[12px] px-[14px] py-[9px] rounded-[10px] border"
                  style={{ background: '#0f0f12', borderColor: '#202026' }}>
                  <SoftwareAppIcon softwareKey={key} box={32} iconSize={22} radius={9} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary">{meta.display}</div>
                  </div>
                  <Toggle on={isOn} onChange={v => handleSwToggle(key, v)} />
                </div>
              );
            })}
          </div>
        </div>
      )}


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
  const [taskAttachmentPreview, setTaskAttachmentPreview] = useState(() => {
    const saved = localStorage.getItem('taskAttachmentPreview');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [treeImagePreviews, setTreeImagePreviews] = useState(() => {
    const saved = localStorage.getItem('treeImagePreviews');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showShotsBrowserSearch, setShowShotsBrowserSearch] = useState(() => {
    const saved = localStorage.getItem('shotsbrowser_showSearchFilter');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showShotsBrowserAssetButtons, setShowShotsBrowserAssetButtons] = useState(() => {
    const saved = localStorage.getItem('shotsbrowser_showSpecialContextButtons');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [shotsBrowserHoverDelay, setShotsBrowserHoverDelay] = useState(() => {
    const saved = localStorage.getItem('shotsbrowser_hoverDelay');
    return saved !== null ? (parseInt(saved) || 100) : 100;
  });
  const [shotsBrowserHideDelay, setShotsBrowserHideDelay] = useState(() => {
    const saved = localStorage.getItem('shotsbrowser_hideDelay');
    return saved !== null ? (parseInt(saved) || 250) : 250;
  });
  const [autoHideProjectFiles, setAutoHideProjectFiles] = useState(() => {
    const saved = localStorage.getItem('autoHideProjectFiles');
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
    <div>
      {/* Theme */}
      <div className="py-4 border-b border-border-primary">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Theme</div>
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
            className="p-4 rounded-button border-2 border-border-primary/50 bg-sidebar-bg/30 cursor-not-allowed opacity-50"
          >
            <div className="w-full h-20 bg-zinc-950/50 rounded mb-2" />
            <div className="text-sm font-medium text-text-muted">Dark</div>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div className="py-4 border-b border-border-primary">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Accent Color</div>
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
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Animations</div>
          <p className="text-xs text-text-muted">Enable smooth transitions and animations</p>
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
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            animationsEnabled ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${animationsEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Modal Blur */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Modal Blur Effect</div>
          <p className="text-xs text-text-muted">Add subtle blur to background when modals are open</p>
        </div>
        <button
          onClick={() => {
            const newValue = !modalBlurEnabled;
            setModalBlurEnabled(newValue);
            localStorage.setItem('modalBlurEnabled', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            modalBlurEnabled ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${modalBlurEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Tag Icons */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Tag Icons</div>
          <p className="text-xs text-text-muted">Display icons in client and payment status tags</p>
        </div>
        <button
          onClick={() => {
            const newValue = !showTagIcons;
            setShowTagIcons(newValue);
            localStorage.setItem('showTagIcons', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${showTagIcons ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${showTagIcons ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Project File Previews (Blender, Photoshop, Cinema 4D) */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Project File Previews</div>
          <p className="text-xs text-text-muted">Show thumbnails embedded in Blender, Photoshop and Cinema 4D files in versions and shots</p>
        </div>
        <button
          onClick={() => {
            const newValue = !blendPreviewsEnabled;
            setBlendPreviewsEnabled(newValue);
            localStorage.setItem('blendPreviewsEnabled', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${blendPreviewsEnabled ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${blendPreviewsEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Task Attachment Preview */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Attachment Preview</div>
          <p className="text-xs text-text-muted">Show file preview on hover in task attachments</p>
        </div>
        <button
          onClick={() => {
            const newValue = !taskAttachmentPreview;
            setTaskAttachmentPreview(newValue);
            localStorage.setItem('taskAttachmentPreview', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${taskAttachmentPreview ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${taskAttachmentPreview ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Project Structure image previews */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Project Structure Image Previews</div>
          <p className="text-xs text-text-muted">Show image thumbnails and a preview on hover in Project Structure</p>
        </div>
        <button
          onClick={() => {
            const newValue = !treeImagePreviews;
            setTreeImagePreviews(newValue);
            localStorage.setItem('treeImagePreviews', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${treeImagePreviews ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${treeImagePreviews ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Shots Browser Settings */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }} className="mt-6 mb-2">
        Shots Browser Settings
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Button Reveal Delay</div>
          <p className="text-xs text-text-muted">Delay before Add Shot / Add Scene buttons appear on hover (ms)</p>
        </div>
        <input
          type="number"
          min="0"
          max="2000"
          step="100"
          value={shotsBrowserHoverDelay}
          onChange={(e) => {
            const newValue = Math.min(2000, Math.max(0, parseInt(e.target.value) || 0));
            setShotsBrowserHoverDelay(newValue);
            localStorage.setItem('shotsbrowser_hoverDelay', newValue.toString());
            window.dispatchEvent(new Event('storage'));
          }}
          className="w-20 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent text-center"
        />
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Button Hide Delay</div>
          <p className="text-xs text-text-muted">Delay before Add Shot / Add Scene buttons disappear (ms)</p>
        </div>
        <input
          type="number"
          min="0"
          max="2000"
          step="50"
          value={shotsBrowserHideDelay}
          onChange={(e) => {
            const newValue = Math.min(2000, Math.max(0, parseInt(e.target.value) || 0));
            setShotsBrowserHideDelay(newValue);
            localStorage.setItem('shotsbrowser_hideDelay', newValue.toString());
            window.dispatchEvent(new Event('storage'));
          }}
          className="w-20 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent text-center"
        />
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Show Search & Filter</div>
          <p className="text-xs text-text-muted">Show search bar and filter controls in Shots Browser</p>
        </div>
        <button
          onClick={() => {
            const newValue = !showShotsBrowserSearch;
            setShowShotsBrowserSearch(newValue);
            localStorage.setItem('shotsbrowser_showSearchFilter', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${showShotsBrowserSearch ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${showShotsBrowserSearch ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Show Asset/Compose Buttons</div>
          <p className="text-xs text-text-muted">Show Asset Projects and Compose buttons in Shots Browser</p>
        </div>
        <button
          onClick={() => {
            const newValue = !showShotsBrowserAssetButtons;
            setShowShotsBrowserAssetButtons(newValue);
            localStorage.setItem('shotsbrowser_showSpecialContextButtons', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${showShotsBrowserAssetButtons ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${showShotsBrowserAssetButtons ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Project Structure */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }} className="mt-6 mb-2">
        Project Structure
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Auto-hide Project Files</div>
          <p className="text-xs text-text-muted">Automatically hide project files (.blend, .hip, .ma, etc.) in the project structure</p>
        </div>
        <button
          onClick={() => {
            const newValue = !autoHideProjectFiles;
            setAutoHideProjectFiles(newValue);
            localStorage.setItem('autoHideProjectFiles', JSON.stringify(newValue));
            window.dispatchEvent(new Event('storage'));
          }}
          className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${autoHideProjectFiles ? 'bg-accent' : 'bg-border-secondary'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${autoHideProjectFiles ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Window Settings */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }} className="mt-6 mb-2">
        Window Settings
      </div>

      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Auto-Maximize on Launch</div>
          <p className="text-xs text-text-muted">Automatically maximize nullSpace window on startup</p>
        </div>
        <button
          onClick={() => {
            const newValue = !autoMaximizeOnLaunch;
            setAutoMaximizeOnLaunch(newValue);
            updateWindowSettings({ autoMaximizeOnLaunch: newValue });
          }}
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            autoMaximizeOnLaunch ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${autoMaximizeOnLaunch ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {autoMaximizeOnLaunch && monitors.length > 0 && (
        <div className="py-4 border-b border-border-primary">
          <div className="mb-3">
            <div className="text-sm font-semibold mb-0.5">Preferred Monitor</div>
            <p className="text-xs text-text-muted">Select monitor for auto-maximized window</p>
          </div>
          <CustomSelect
            value={String(preferredMonitor)}
            onChange={(val) => {
              const index = parseInt(val);
              setPreferredMonitor(index);
              const monitor = monitors[index];
              updateWindowSettings({
                preferredMonitor: index,
                preferredMonitorName: monitor?.name || '',
              });
            }}
            options={monitors.map((monitor) => {
              const displayNum = monitor.name.match(/DISPLAY(\d+)/)?.[1] || (monitor.index + 1);
              const displayName = `Display ${displayNum}`;
              return {
                value: String(monitor.index),
                label: `${monitor.index + 1}. ${displayName}${monitor.is_primary ? ' (Primary)' : ''} - ${monitor.width}x${monitor.height}`,
              };
            })}
          />
        </div>
      )}

      {autoMaximizeOnLaunch && monitors.length > 1 && (
        <div className="py-4 border-b border-border-primary">
          <div className="text-sm font-semibold mb-2">Monitor Layout</div>
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
                      <span className="text-[10px] bg-card-bg px-1 rounded text-text-muted">Primary</span>
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

      <div className="py-4">
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
  );
}

function clientSubtitle(c: { telegram?: string; instagram?: string; website?: string }): string {
  const links: string[] = [];
  if (c.telegram) links.push(`tg ${c.telegram}`);
  if (c.instagram) links.push(`ig ${c.instagram}`);
  if (c.website) links.push(c.website.replace(/^https?:\/\//, ''));
  if (links.length === 0) return 'no links';
  return `${links.length} link${links.length > 1 ? 's' : ''} · ${links.join(' · ')}`;
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
    <div className="pt-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-[14px]">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider px-1">
          Manage clients · {clients.length} total
        </p>
        <button
          onClick={() => setShowAddClient(!showAddClient)}
          className="flex items-center gap-[8px] h-[34px] px-[14px] rounded-[9px] text-white font-bold text-[12.5px] cursor-pointer border-0 flex-none"
          style={{ background: 'linear-gradient(180deg,#7c3aed,#6d28d9)' }}
        >
          <Plus className="w-[14px] h-[14px]" />
          Add Client
        </button>
      </div>

      {/* Add Client Form */}
      {showAddClient && (
        <div className="bg-card-bg border border-[#262633] rounded-[12px] p-[14px_16px] mb-[10px]">
          <div className="text-[11px] font-semibold text-text-muted mb-[8px]">Client name</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              placeholder="Enter client name…"
              className="flex-1 bg-app-bg border border-[#232329] rounded-[9px] px-[12px] h-[38px] text-[13px] focus:outline-none focus:border-accent text-text-primary placeholder:text-[#5c5c64]"
              autoFocus
            />
            <button
              onClick={handleAddClient}
              className="h-[38px] px-[14px] rounded-[9px] text-white font-bold text-[12.5px] cursor-pointer border-0 flex-none"
              style={{ background: 'linear-gradient(180deg,#7c3aed,#6d28d9)' }}
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddClient(false); setNewClientName(''); }}
              className="h-[38px] px-[14px] bg-card-bg border border-[#2a2a31] rounded-[9px] text-text-secondary text-[12.5px] font-semibold cursor-pointer hover:border-[#3a3a44] hover:text-text-primary transition-colors flex-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Client List */}
      <div className="flex flex-col gap-[10px]">
        {clients.map(client => {
          const isExpanded = editingClient === client.id;
          return (
            <div
              key={client.id}
              className={`border rounded-[10px] overflow-hidden transition-colors ${
                isExpanded ? 'border-[#262633]' : 'border-[#202026]'
              }`}
              style={{ background: '#0f0f12' }}
            >
              {/* Header row */}
              <div
                className="flex items-center gap-[14px] px-[14px] py-3 cursor-pointer hover:bg-hover-bg transition-colors"
                onClick={() => setEditingClient(isExpanded ? null : client.id)}
              >
                <div
                  className="w-[34px] h-[34px] flex-none rounded-[9px] flex items-center justify-center font-bold text-[14px] text-white"
                  style={{ background: client.color || '#7c3aed' }}
                >
                  {client.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13.5px] text-text-primary truncate">{client.name}</div>
                  <div className="text-[11px] text-[#6f6f78] mt-[2px]">{clientSubtitle(client)}</div>
                </div>
                <div className="w-[30px] h-[30px] flex items-center justify-center rounded-[7px] text-text-muted flex-none">
                  <ChevronDown className={`w-[16px] h-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded body */}
              <div style={{
                display: 'grid',
                gridTemplateRows: isExpanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.22s ease',
              }}>
              <div className="overflow-hidden">
                <div className="px-[14px] pb-[14px] flex flex-col gap-[14px]">

                  {/* Accent color */}
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted mb-[8px]">Accent color</div>
                    <button
                      onClick={(e) => {
                        if (showClientPicker && clientPickerClientId === client.id) {
                          if (clientPickerClientId) updateClient(clientPickerClientId, { color: clientOriginalColor });
                          const sw = clientPickerTriggerRef.current?.querySelector<HTMLElement>('[data-swatch]');
                          if (sw) sw.style.background = clientOriginalColor;
                          setShowClientPicker(false);
                          return;
                        }
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
                      className="flex items-center gap-[10px] h-[36px] pl-[9px] pr-[11px] bg-app-bg border border-[#232329] rounded-[9px] hover:border-[#3a3a44] transition-colors cursor-pointer"
                    >
                      <span
                        data-swatch=""
                        className="w-[20px] h-[20px] rounded-[6px] flex-none"
                        style={{ background: client.color || '#7c3aed' }}
                      />
                      <span className="text-[12.5px] font-semibold text-[#d3d3d9]">
                        {hslStringToHex(client.color || '#7c3aed').toUpperCase()}
                      </span>
                      <ChevronDown className="w-[14px] h-[14px] text-[#6a6a73] ml-[1px]" />
                    </button>
                  </div>

                  {/* Description */}
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted mb-[6px]">Description</div>
                    <textarea
                      value={client.description || ''}
                      onChange={(e) => updateClient(client.id, { description: e.target.value })}
                      placeholder="Brief description…"
                      rows={2}
                      className="w-full min-h-[56px] p-[10px_12px] bg-app-bg border border-[#232329] rounded-[9px]
                                 text-[12.5px] text-text-secondary placeholder:text-[#5c5c64]
                                 focus:border-accent focus:outline-none resize-none transition-colors"
                    />
                  </div>

                  {/* Website */}
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted mb-[6px]">Website</div>
                    <div className="flex items-center gap-[9px] h-[38px] px-[12px] bg-app-bg border border-[#232329] rounded-[9px] transition-colors focus-within:border-accent">
                      <Globe className="w-[14px] h-[14px] text-[#5c5c64] flex-none" />
                      <input
                        type="url"
                        value={client.website || ''}
                        onChange={(e) => updateClient(client.id, { website: e.target.value })}
                        placeholder="https://…"
                        className="flex-1 text-[12.5px] bg-transparent border-0 focus:outline-none text-text-secondary placeholder:text-[#5c5c64]"
                      />
                    </div>
                  </div>

                  {/* Social */}
                  <div className="flex gap-[12px]">
                    <div className="flex-1">
                      <div className="text-[11px] font-semibold text-text-muted mb-[6px]">Telegram</div>
                      <div className="flex items-center gap-[9px] h-[38px] px-[12px] bg-app-bg border border-[#232329] rounded-[9px] transition-colors focus-within:border-accent">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5c5c64" strokeWidth="1.8" strokeLinejoin="round">
                          <path d="M21 4 3 11l6 2 2 6 3-4 4 3z" />
                        </svg>
                        <input
                          type="text"
                          value={client.telegram || ''}
                          onChange={(e) => updateClient(client.id, { telegram: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-[12.5px] bg-transparent border-0 focus:outline-none text-text-secondary placeholder:text-[#5c5c64]"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] font-semibold text-text-muted mb-[6px]">Instagram</div>
                      <div className="flex items-center gap-[9px] h-[38px] px-[12px] bg-app-bg border border-[#232329] rounded-[9px] transition-colors focus-within:border-accent">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5c5c64" strokeWidth="1.8">
                          <rect x="3" y="3" width="18" height="18" rx="5" />
                          <circle cx="12" cy="12" r="4" />
                          <circle cx="17.5" cy="6.5" r="1" fill="#5c5c64" stroke="none" />
                        </svg>
                        <input
                          type="text"
                          value={client.instagram || ''}
                          onChange={(e) => updateClient(client.id, { instagram: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-[12.5px] bg-transparent border-0 focus:outline-none text-text-secondary placeholder:text-[#5c5c64]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="flex justify-end pt-[2px]">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const clientName = client.name;
                        const clientId = client.id;
                        setEditingClient(null);
                        if (onDeleteClient) {
                          onDeleteClient(clientId, clientName);
                        } else {
                          const confirmed = confirm(`Delete client "${clientName}"?`);
                          if (confirmed) deleteClient(clientId);
                        }
                      }}
                      className="flex items-center gap-[7px] h-[32px] px-[12px] border border-[#3a2020] rounded-[8px]
                                 text-[#d97575] text-[12px] font-semibold cursor-pointer
                                 hover:bg-[#2a1414] hover:border-[#5a2828] hover:text-[#ef8888] transition-all"
                    >
                      <Trash2 className="w-[13px] h-[13px]" />
                      Delete client
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {clients.length === 0 && !showAddClient && (
        <div className="text-center py-10">
          <p className="text-[13px] text-text-muted mb-4">No clients yet</p>
          <button
            onClick={() => setShowAddClient(true)}
            className="inline-flex items-center gap-[8px] h-[38px] px-[18px] rounded-[10px] text-white font-bold text-[13px] cursor-pointer border-0"
            style={{ background: 'linear-gradient(180deg,#7c3aed,#6d28d9)' }}
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
          const swatch = clientPickerTriggerRef.current?.querySelector<HTMLElement>('[data-swatch]');
          if (swatch) swatch.style.background = hex;
        }}
        onApply={() => {
          if (clientPickerClientId) updateClient(clientPickerClientId, { color: clientPendingColorRef.current });
          setShowClientPicker(false);
        }}
        onCancel={() => {
          if (clientPickerClientId) updateClient(clientPickerClientId, { color: clientOriginalColor });
          const swatch = clientPickerTriggerRef.current?.querySelector<HTMLElement>('[data-swatch]');
          if (swatch) swatch.style.background = clientOriginalColor;
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
  const [hoursPerWorkDay, setHoursPerWorkDay] = useState(() => getHoursPerWorkDay());
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
    <div>
      {/* Base Currency */}
      <div className="py-4 border-b border-border-primary">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5">Base Currency</div>
          <p className="text-xs text-text-muted">Select the base currency for financial reports</p>
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
      <div className="flex items-center justify-between py-4 border-b border-border-primary gap-4">
        <div>
          <div className="text-sm font-semibold mb-0.5">Convert to Base Currency</div>
          <p className="text-xs text-text-muted">Automatically convert all revenue to the selected currency</p>
        </div>
        <button
          onClick={handleConvertToggle}
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            convertToBaseCurrency ? 'bg-accent' : 'bg-border-secondary'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${convertToBaseCurrency ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Exchange Rate Mode */}
      {convertToBaseCurrency && (
        <div className="py-4 border-b border-border-primary">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }} className="mb-3">
            Exchange Rate Source
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleRateModeChange('auto')}
              className={`p-4 rounded-button border-2 transition-colors text-left ${
                rateMode === 'auto'
                  ? 'border-accent bg-accent/10'
                  : 'border-border-primary bg-sidebar-bg hover:border-border-hover'
              }`}
            >
              <div className="text-sm font-semibold mb-0.5">Automatic</div>
              <p className="text-xs text-text-muted">Get real-time rates from the internet</p>
            </button>
            <button
              onClick={() => handleRateModeChange('manual')}
              className={`p-4 rounded-button border-2 transition-colors text-left ${
                rateMode === 'manual'
                  ? 'border-accent bg-accent/10'
                  : 'border-border-primary bg-sidebar-bg hover:border-border-hover'
              }`}
            >
              <div className="text-sm font-semibold mb-0.5">Manual</div>
              <p className="text-xs text-text-muted">Set custom exchange rates</p>
            </button>
          </div>
        </div>
      )}

      {/* Exchange Rates Display */}
      {convertToBaseCurrency && (
        <div className="py-4 border-b border-border-primary">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Exchange Rates
            </div>
            {rateMode === 'auto' && (
              <button
                onClick={() => fetchAutoRates(baseCurrency)}
                disabled={isLoadingRates}
                className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg disabled:opacity-40 rounded-button transition-colors text-xs flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRates ? 'animate-spin' : ''}`} />
                {isLoadingRates ? 'Updating...' : 'Update'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {Object.keys(currencySymbols).map(currency => {
              if (currency === baseCurrency) return null;

              let rate = 0;
              if (rateMode === 'auto' && autoRates) {
                rate = autoRates[currency] ? 1 / autoRates[currency] : 0;
              } else {
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

      {/* Hours per Work Day */}
      <div className="flex items-center justify-between py-4 border-b border-border-primary">
        <div>
          <p className="text-sm text-[#e8e8f0]">Hours per Work Day</p>
          <p className="text-xs text-text-muted mt-0.5">Used to calculate Revenue per Day</p>
        </div>
        <input
          type="number"
          min="1"
          max="24"
          value={hoursPerWorkDay}
          onChange={(e) => {
            const v = Math.min(24, Math.max(1, parseInt(e.target.value) || 8));
            setHoursPerWorkDay(v);
            saveHoursPerWorkDay(v);
          }}
          className="w-20 bg-app-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent text-center"
        />
      </div>

      {/* Revenue Normalization Threshold */}
      <div className="py-4">
        <div className="mb-3">
          <div className="text-sm font-semibold mb-0.5">Revenue Normalization Threshold</div>
          <p className="text-xs text-text-muted">
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
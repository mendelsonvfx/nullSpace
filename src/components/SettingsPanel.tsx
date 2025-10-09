// src/components/SettingsPanel.tsx
import { useProjectStore } from '../store/projectStore';
import { useState, useEffect } from 'react';
import { X, FolderOpen, Check, AlertCircle, Plus, Settings, Trash2, RefreshCw } from 'lucide-react';
import { selectProjectDirectory, selectExecutable, getSoftwarePaths } from '../utils/tauri';
import type { SoftwareName } from '../types/project';
import { useThumbnailCache } from '../hooks/useThumbnailCache';
import { getVersion } from '@tauri-apps/api/app';

interface SettingsPanelProps {
  onClose: () => void;
  onDeleteClient?: (clientId: string, clientName: string) => void;
}

interface SoftwarePathConfig {
  name: SoftwareName;
  displayName: string;
  path: string;
  isValid: boolean;
}

const DEFAULT_SOFTWARE: Array<{ name: SoftwareName; displayName: string }> = [
  { name: 'blender', displayName: 'Blender' },
  { name: 'houdini', displayName: 'Houdini' },
  // { name: 'maya', displayName: 'Maya' },
  { name: 'after-effects', displayName: 'After Effects' },
  // { name: 'cinema4d', displayName: 'Cinema 4D' },
  // { name: 'substance', displayName: 'Substance Painter' },
  // { name: 'unreal', displayName: 'Unreal Engine' },
  // { name: 'unity', displayName: 'Unity' },
  // { name: 'zbrush', displayName: 'ZBrush' },
  // { name: 'marmoset', displayName: 'Marmoset Toolbag' },
];

export function SettingsPanel({ onClose, onDeleteClient }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'software' | 'appearance' | 'clients' | 'finance' | 'categories'>('general');
  const [softwarePaths, setSoftwarePaths] = useState<SoftwarePathConfig[]>([]);
  const [appVersion, setAppVersion] = useState<string>('');
  const [showTagIcons, setShowTagIcons] = useState(() => {
    const saved = localStorage.getItem('showTagIcons');
    return saved !== null ? JSON.parse(saved) : true;
  });

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
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div data-settings-panel className="bg-zinc-900 rounded-xl max-w-4xl w-full h-[80vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="w-48 border-r border-zinc-800 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>

          <nav className="space-y-1 flex-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'general'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('software')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'software'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Software Paths
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'appearance'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Appearance
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'clients'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Clients
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'finance'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Finance
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'categories'
                  ? 'bg-accent'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Categories
            </button>
          </nav>

          {/* Version info at bottom */}
          <div className="mt-4">
            <div className="text-xs text-zinc-500 text-center">
              nullSpace v{appVersion || '0.6.0'}-beta
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-zinc-800">
            <h3 className="text-xl font-semibold">
              {activeTab === 'general' && 'General Settings'}
              {activeTab === 'software' && 'Software Paths'}
              {activeTab === 'appearance' && 'Appearance'}
              {activeTab === 'categories' && 'Categories'}
              {activeTab === 'clients' && 'Clients'}
              {activeTab === 'finance' && 'Finance Settings'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'software' && <SoftwareSettings softwarePaths={softwarePaths} setSoftwarePaths={setSoftwarePaths} />}
            {activeTab === 'appearance' && <AppearanceSettings showTagIcons={showTagIcons} setShowTagIcons={setShowTagIcons} />}
            {activeTab === 'clients' && <ClientsSettings onDeleteClient={onDeleteClient} />}
            {activeTab === 'finance' && <FinanceSettings />}
            {activeTab === 'categories' && <CategoriesSettings />}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-800 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium"
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
  const { clearAllThumbnails, getCacheSize } = useThumbnailCache();
  const [projectsDir, setProjectsDir] = useState(defaultProjectsPath);
  const [autoSave, setAutoSave] = useState(true);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('deadlineNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleBrowseDirectory = async () => {
    const selected = await selectProjectDirectory();
    if (selected) {
      setProjectsDir(selected);
      setDefaultProjectsPath(selected);
      // Перезагрузить проекты после изменения пути
      setTimeout(() => {
        loadProjects();
      }, 100);
    }
  };

  const handleSave = () => {
    setDefaultProjectsPath(projectsDir);
    setTimeout(() => {
      loadProjects();
    }, 100);
  };

  const handleClearCache = () => {
    const cacheSize = getCacheSize();
    if (cacheSize === 0) {
      return;
    }
    clearAllThumbnails();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
    // Reload projects to force thumbnails reload
    loadProjects();
  };

  return (
    <div className="space-y-6">
      {/* Projects Directory */}
      <div>
        <label className="block text-sm font-medium mb-2">Projects Directory</label>
        <p className="text-sm text-zinc-400 mb-3">
          Default location where projects are stored and loaded from
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectsDir}
            onChange={(e) => setProjectsDir(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleBrowseDirectory}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            Browse
          </button>
        </div>
        <button
          onClick={handleSave}
          className="mt-3 px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium"
        >
          Apply & Reload Projects
        </button>
      </div>

      {/* Auto Save */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Auto Save</div>
          <p className="text-sm text-zinc-400">
            Automatically save project metadata on changes
          </p>
        </div>
        <button
          onClick={() => setAutoSave(!autoSave)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            autoSave ? 'bg-accent' : 'bg-zinc-700'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              autoSave ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Notifications */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Deadline Notifications</div>
          <p className="text-sm text-zinc-400">
            Show notifications for projects with upcoming deadlines (≤ 3 days)
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
            notifications ? 'bg-accent' : 'bg-zinc-700'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              notifications ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Thumbnail Cache */}
      <div className="border-t border-zinc-800 pt-6">
        <div className="mb-3">
          <div className="font-medium mb-1">Thumbnail Cache</div>
          <p className="text-sm text-zinc-400">
            Clear cached thumbnails to force reload. Useful if thumbnails appear outdated.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearCache}
            disabled={getCacheSize() === 0}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Clear Cache ({getCacheSize()} thumbnails)
          </button>
          {cacheCleared && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <Check className="w-4 h-4" />
              Cache cleared
            </div>
          )}
        </div>
      </div>

      {/* Clear Cache */}
      <div>
        <label className="block text-sm font-medium mb-2">Cache & Data</label>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            Clear Cache
          </button>
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
            Reset All Settings
          </button>
        </div>
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
      path: pathsMap[sw.name] || '',
      isValid: !!pathsMap[sw.name]
    }));

    setSoftwarePaths(initialPaths);
  }, []);

  const handleBrowseExecutable = async (index: number) => {
    const selected = await selectExecutable();
    if (selected) {
      setSoftwarePaths(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], path: selected, isValid: true };
        return updated;
      });
    }
  };

  const handleAutoDetect = async () => {
    // Здесь будет логика автоопределения установленного софта
    console.log('Auto-detecting software...');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Configure paths to installed 3D software applications
        </p>
        <button
          onClick={handleAutoDetect}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium"
        >
          Auto-Detect
        </button>
      </div>

      <div className="space-y-3">
        {softwarePaths.map((sw, index) => (
          <div key={sw.name} className="bg-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{sw.displayName}</h4>
                {sw.path && (
                  sw.isValid ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  )
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={sw.path}
                onChange={(e) => {
                  setSoftwarePaths(prev => {
                    const updated = [...prev];
                    updated[index] = { ...updated[index], path: e.target.value };
                    return updated;
                  });
                }}
                placeholder={`Path to ${sw.displayName} executable...`}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => handleBrowseExecutable(index)}
                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>

            {/* Suggested paths */}
            {!sw.path && (
              <div className="mt-2">
                <p className="text-xs text-zinc-500 mb-1">Common locations:</p>
                <div className="flex flex-wrap gap-1">
                  {getSoftwarePaths(sw.name).slice(0, 2).map((path, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSoftwarePaths(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], path, isValid: true };
                          return updated;
                        });
                      }}
                      className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors"
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettings({ showTagIcons, setShowTagIcons }: { showTagIcons: boolean; setShowTagIcons: (value: boolean) => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [accentColor, setAccentColor] = useState(() => {
    const saved = localStorage.getItem('accentColor');
    return saved || '#a855f7';
  });
  const [customColor, setCustomColor] = useState('');
  const [showCustomColorInput, setShowCustomColorInput] = useState(false);

  const accentColors = [
    { name: 'Purple', value: '#a855f7' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Orange', value: '#f97316' },
  ];

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
    if (customColor && /^#[0-9A-F]{6}$/i.test(customColor)) {
      handleColorChange(customColor);
      setShowCustomColorInput(false);
      setCustomColor('');
    }
  };

  useEffect(() => {
    // Apply saved accent color on mount
    const savedColor = localStorage.getItem('accentColor');
    if (savedColor) {
      document.documentElement.style.setProperty('--accent-color', savedColor);
      const hoverColor = adjustColorBrightness(savedColor, -20);
      document.documentElement.style.setProperty('--accent-color-hover', hoverColor);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium mb-3">Theme</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme('light')}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === 'light'
                ? 'border-accent bg-zinc-800'
                : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
            }`}
          >
            <div className="w-full h-20 bg-white rounded mb-2" />
            <div className="text-sm font-medium">Light</div>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === 'dark'
                ? 'border-accent bg-zinc-800'
                : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
            }`}
          >
            <div className="w-full h-20 bg-zinc-950 rounded mb-2" />
            <div className="text-sm font-medium">Dark</div>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <label className="block text-sm font-medium mb-3">Accent Color</label>
        <div className="flex gap-3 flex-wrap items-center">
          {accentColors.map(color => (
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
          {!showCustomColorInput ? (
            <button
              onClick={() => setShowCustomColorInput(true)}
              className="w-12 h-12 rounded-lg border-2 border-dashed border-zinc-600 hover:border-zinc-500 flex items-center justify-center text-zinc-500 hover:text-zinc-400 transition-colors"
              title="Add custom color"
            >
              +
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value.toUpperCase())}
                placeholder="#A855F7"
                className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
                maxLength={7}
              />
              <button
                onClick={handleCustomColorAdd}
                className="px-3 py-1 bg-accent hover:bg-accent-hover rounded text-sm transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowCustomColorInput(false);
                  setCustomColor('');
                }}
                className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Mode */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Compact Mode</div>
          <p className="text-sm text-zinc-400">
            Use smaller spacing and UI elements
          </p>
        </div>
        <button
          className="w-12 h-6 rounded-full bg-zinc-700 relative"
        >
          <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5" />
        </button>
      </div>

      {/* Animations */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Animations</div>
          <p className="text-sm text-zinc-400">
            Enable smooth transitions and animations
          </p>
        </div>
        <button
          className="w-12 h-6 rounded-full bg-accent relative"
        >
          <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 translate-x-6" />
        </button>
      </div>

      {/* Tag Icons */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Tag Icons</div>
          <p className="text-sm text-zinc-400">
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
            showTagIcons ? 'bg-accent' : 'bg-zinc-700'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
            showTagIcons ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
    </div>
  );
}

function ClientsSettings({ onDeleteClient }: { onDeleteClient?: (clientId: string, clientName: string) => void }) {
  const { clients, addClient, updateClient, deleteClient } = useProjectStore();
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Manage your clients and their contact information
        </p>
        <button
          onClick={() => setShowAddClient(!showAddClient)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {showAddClient && (
        <div className="bg-zinc-800 rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">Client Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              placeholder="Enter client name..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleAddClient}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddClient(false);
                setNewClientName('');
              }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {clients.map(client => (
          <div
            key={client.id}
            className="bg-zinc-800 rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: client.color || '#ffffff' }}
              />
              <span className="text-base font-medium flex-1">{client.name}</span>
              <button
                onClick={() => setEditingClient(editingClient === client.id ? null : client.id)}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {editingClient === client.id && (
              <div className="mt-4 pt-4 border-t border-zinc-700 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <input
                    type="color"
                    value={client.color || '#ffffff'}
                    onChange={(e) => updateClient(client.id, { color: e.target.value })}
                    className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={client.description || ''}
                    onChange={(e) => updateClient(client.id, { description: e.target.value })}
                    placeholder="Brief description..."
                    rows={3}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Website</label>
                  <input
                    type="url"
                    value={client.website || ''}
                    onChange={(e) => updateClient(client.id, { website: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Telegram</label>
                  <input
                    type="text"
                    value={client.telegram || ''}
                    onChange={(e) => updateClient(client.id, { telegram: e.target.value })}
                    placeholder="@username"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Instagram</label>
                  <input
                    type="text"
                    value={client.instagram || ''}
                    onChange={(e) => updateClient(client.id, { instagram: e.target.value })}
                    placeholder="@username"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  />
                </div>
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
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
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
          <p className="text-zinc-500 mb-4">No clients yet</p>
          <button
            onClick={() => setShowAddClient(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Your First Client
          </button>
        </div>
      )}
    </div>
  );
}

function CategoriesSettings() {
  const { categories, removeCategory, addCategory } = useProjectStore();
  const defaultCategories = ['Commercial', 'Personal'];
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleDeleteCategory = (categoryName: string) => {
    if (defaultCategories.includes(categoryName)) {
      return; // Don't delete default categories
    }

    if (window.confirm(`Are you sure you want to delete the "${categoryName}" category? Projects in this category will be moved to "Personal".`)) {
      removeCategory(categoryName);
    }
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setShowAddCategory(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Manage your project categories. Default categories (Commercial, Personal) cannot be deleted.
        </p>
        <button
          onClick={() => setShowAddCategory(!showAddCategory)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {showAddCategory && (
        <div className="bg-zinc-800 rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">Category Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Enter category name..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleAddCategory}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddCategory(false);
                setNewCategoryName('');
              }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((category) => {
          const isDefault = defaultCategories.includes(category);
          return (
            <div
              key={category}
              className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{category}</span>
                {isDefault && (
                  <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-1 rounded">
                    Default
                  </span>
                )}
              </div>
              {!isDefault && (
                <button
                  onClick={() => handleDeleteCategory(category)}
                  className="p-2 hover:bg-red-600/20 rounded-lg transition-colors text-red-400 hover:text-red-300"
                  title="Delete category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

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

  const getCurrentRates = () => {
    if (rateMode === 'auto' && autoRates) {
      return autoRates;
    }
    return exchangeRates[baseCurrency] || exchangeRates.USD;
  };

  const currentRates = getCurrentRates();

  return (
    <div className="space-y-6">
      {/* Currency Settings */}
      <div>
        <label className="block text-sm font-medium mb-2">Base Currency</label>
        <p className="text-sm text-zinc-400 mb-3">
          Select the base currency for financial reports
        </p>
        <select
          value={baseCurrency}
          onChange={(e) => handleBaseCurrencyChange(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
        >
          <option value="USD">USD ($)</option>
          <option value="RUB">RUB (₽)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

      {/* Convert to Base Currency */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium mb-1">Convert to Base Currency</div>
          <p className="text-sm text-zinc-400">
            Automatically convert all revenue to the selected currency
          </p>
        </div>
        <button
          onClick={handleConvertToggle}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            convertToBaseCurrency ? 'bg-accent' : 'bg-zinc-700'
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
        <div className="border-t border-zinc-800 pt-6">
          <label className="block text-sm font-medium mb-3">Exchange Rate Source</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleRateModeChange('auto')}
              className={`p-4 rounded-lg border-2 transition-colors text-left ${
                rateMode === 'auto'
                  ? 'border-accent bg-accent/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="font-medium mb-1">Automatic</div>
              <p className="text-xs text-zinc-400">
                Get real-time rates from the internet
              </p>
            </button>
            <button
              onClick={() => handleRateModeChange('manual')}
              className={`p-4 rounded-lg border-2 transition-colors text-left ${
                rateMode === 'manual'
                  ? 'border-accent bg-accent/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="font-medium mb-1">Manual</div>
              <p className="text-xs text-zinc-400">
                Set custom exchange rates
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Exchange Rates Display */}
      {convertToBaseCurrency && (
        <div className="border-t border-zinc-800 pt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Exchange Rates</label>
            {rateMode === 'auto' && (
              <button
                onClick={() => fetchAutoRates(baseCurrency)}
                disabled={isLoadingRates}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRates ? 'animate-spin' : ''}`} />
                {isLoadingRates ? 'Updating...' : 'Update'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {Object.keys(currencySymbols).map(from => {
              if (from === baseCurrency) return null;
              const rate = currentRates[from] || 0;
              const isEditing = editingRate?.from === baseCurrency && editingRate?.to === from;

              return (
                <div key={from} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                  <span className="text-sm">
                    1 {currencySymbols[from]} ({from})
                  </span>
                  <div className="flex items-center gap-2">
                    {rateMode === 'manual' && isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={rate.toFixed(4)}
                        onBlur={(e) => handleManualRateChange(baseCurrency, from, parseFloat(e.target.value) || rate)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleManualRateChange(baseCurrency, from, parseFloat(e.currentTarget.value) || rate);
                          }
                        }}
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-accent text-right"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium">
                        {rate.toFixed(4)} {currencySymbols[baseCurrency]}
                      </span>
                    )}
                    {rateMode === 'manual' && (
                      <button
                        onClick={() => setEditingRate(isEditing ? null : { from: baseCurrency, to: from })}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {lastUpdated && rateMode === 'auto' && (
            <p className="text-xs text-zinc-500 mt-3">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}

          {rateMode === 'manual' && (
            <p className="text-xs text-zinc-500 mt-3">
              Click the settings icon to edit exchange rates
            </p>
          )}
        </div>
      )}
    </div>
  );
}
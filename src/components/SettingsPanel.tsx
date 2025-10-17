// src/components/SettingsPanel.tsx
import { useProjectStore } from '../store/projectStore';
import { useState, useEffect, useRef } from 'react';
import { X, FolderOpen, Check, AlertCircle, Plus, Settings, Trash2, RefreshCw } from 'lucide-react';
import { selectProjectDirectory, selectExecutable, getSoftwarePaths } from '../utils/tauri';
import type { SoftwareName } from '../types/project';
import { useThumbnailCache } from '../hooks/useThumbnailCache';
import { getVersion } from '@tauri-apps/api/app';

interface SettingsPanelProps {
  onClose: () => void;
  onDeleteClient?: (clientId: string, clientName: string) => void;
  onDeleteCategory?: (categoryName: string) => void;
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

export function SettingsPanel({ onClose, onDeleteClient, onDeleteCategory }: SettingsPanelProps) {
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
      <div data-settings-panel className="bg-zinc-900 rounded-xl max-w-4xl w-full h-[80vh] flex overflow-hidden animate-modal" onClick={(e) => e.stopPropagation()}>
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
              <X className="w-5 h-5 close-button-red" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'software' && <SoftwareSettings softwarePaths={softwarePaths} setSoftwarePaths={setSoftwarePaths} />}
            {activeTab === 'appearance' && <AppearanceSettings showTagIcons={showTagIcons} setShowTagIcons={setShowTagIcons} />}
            {activeTab === 'clients' && <ClientsSettings onDeleteClient={onDeleteClient} />}
            {activeTab === 'finance' && <FinanceSettings />}
            {activeTab === 'categories' && <CategoriesSettings onDeleteCategory={onDeleteCategory} />}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-800 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
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
  const { clearAllThumbnails, getCacheSize } = useThumbnailCache();
  const [projectsDir, setProjectsDir] = useState(defaultProjectsPath);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheSize, setCacheSize] = useState(0);
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('deadlineNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [deadlineDays, setDeadlineDays] = useState(() => {
    const saved = localStorage.getItem('deadlineNotificationDays');
    return saved !== null ? parseInt(saved) : 3;
  });

  // Load cache size on mount
  useEffect(() => {
    getCacheSize().then(setCacheSize);
  }, [getCacheSize]);

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

  const handleClearCache = async () => {
    if (cacheSize === 0) {
      return;
    }
    await clearAllThumbnails();
    setCacheSize(0);
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
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 animate-button"
          >
            <FolderOpen className="w-4 h-4" />
            Browse
          </button>
        </div>
        <button
          onClick={handleSave}
          className="mt-3 px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium animate-button"
        >
          Apply & Reload Projects
        </button>
      </div>

      {/* Notifications */}
      <div className="border-t border-zinc-800 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium mb-1">Deadline Notifications</div>
            <p className="text-sm text-zinc-400">
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

        {notifications && (
          <div className="ml-0 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium mb-1">Days Before Deadline</div>
                <p className="text-sm text-zinc-400">
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
                className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent text-center"
              />
            </div>
          </div>
        )}
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
            disabled={cacheSize === 0}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 text-sm font-medium animate-button"
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
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium animate-button"
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
  const [accentColor, setAccentColor] = useState(() => {
    const saved = localStorage.getItem('accentColor');
    return saved || '#9103c6';
  });
  const [customColor, setCustomColor] = useState('#9103C6');
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    const saved = localStorage.getItem('animationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

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
    if (customColor && /^#[0-9A-F]{6}$/i.test(customColor)) {
      // Добавить кастомный цвет в список, если его там еще нет
      if (!customColors.includes(customColor.toUpperCase())) {
        const updatedColors = [...customColors, customColor.toUpperCase()];
        setCustomColors(updatedColors);
        localStorage.setItem('customAccentColors', JSON.stringify(updatedColors));
      }
      handleColorChange(customColor);
      setShowCustomColorPicker(false);
      setCustomColor('#9103C6');
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
        <label className="block text-sm font-medium mb-3 text-zinc-500">Theme</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled
            className="p-4 rounded-lg border-2 border-zinc-700/50 bg-zinc-800/30 cursor-not-allowed opacity-50"
          >
            <div className="w-full h-20 bg-white/20 rounded mb-2" />
            <div className="text-sm font-medium text-zinc-500">Light</div>
          </button>
          <button
            disabled
            className="p-4 rounded-lg border-2 border-accent/50 bg-zinc-800/30 cursor-not-allowed opacity-50"
          >
            <div className="w-full h-20 bg-zinc-950/50 rounded mb-2" />
            <div className="text-sm font-medium text-zinc-500">Dark</div>
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
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove custom color"
              >
                ×
              </button>
            </div>
          ))}
          {!showCustomColorPicker ? (
            <button
              onClick={() => {
                setShowCustomColorPicker(true);
                setTimeout(() => colorInputRef.current?.click(), 0);
              }}
              className="w-12 h-12 rounded-lg border-2 border-dashed border-zinc-600 hover:border-zinc-500 flex items-center justify-center text-zinc-500 hover:text-zinc-400 transition-colors"
              title="Add custom color"
            >
              +
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                ref={colorInputRef}
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value.toUpperCase())}
                className="w-12 h-12 rounded-lg cursor-pointer bg-transparent"
                style={{
                  colorScheme: 'dark'
                }}
                title="Pick a color"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value.toUpperCase())}
                placeholder="#9103C6"
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
                  setShowCustomColorPicker(false);
                  setCustomColor('#9103C6');
                }}
                className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
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
            animationsEnabled ? 'bg-accent' : 'bg-zinc-700'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              animationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Compact Mode */}
      <div className="flex items-center justify-between opacity-50">
        <div>
          <div className="font-medium mb-1 text-zinc-500">Compact Mode</div>
          <p className="text-sm text-zinc-500">
            Use smaller spacing and UI elements
          </p>
        </div>
        <button
          disabled
          className="w-12 h-6 rounded-full bg-zinc-700/50 relative cursor-not-allowed"
        >
          <div className="w-5 h-5 bg-white/50 rounded-full absolute top-0.5 left-0.5" />
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
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
        <div className="bg-zinc-800 rounded-lg p-3">
          <label className="block text-xs font-medium mb-2">Client Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              placeholder="Enter client name..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
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
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm"
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
            className="bg-zinc-800 rounded-lg p-3"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: client.color || '#ffffff' }}
              />
              <span className="text-sm font-medium flex-1">{client.name}</span>
              <button
                onClick={() => setEditingClient(editingClient === client.id ? null : client.id)}
                className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <Settings className="w-3.5 h-3.5 animate-settings-icon" />
              </button>
            </div>

            {editingClient === client.id && (
              <div className="mt-3 pt-3 border-t border-zinc-700 space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5">Color</label>
                  <input
                    type="color"
                    value={client.color || '#ffffff'}
                    onChange={(e) => updateClient(client.id, { color: e.target.value })}
                    className="w-full h-8 bg-zinc-900 border border-zinc-700 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Description</label>
                  <textarea
                    value={client.description || ''}
                    onChange={(e) => updateClient(client.id, { description: e.target.value })}
                    placeholder="Brief description..."
                    rows={2}
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Website</label>
                  <input
                    type="url"
                    value={client.website || ''}
                    onChange={(e) => updateClient(client.id, { website: e.target.value })}
                    placeholder="https://..."
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Telegram</label>
                  <input
                    type="text"
                    value={client.telegram || ''}
                    onChange={(e) => updateClient(client.id, { telegram: e.target.value })}
                    placeholder="@username"
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Instagram</label>
                  <input
                    type="text"
                    value={client.instagram || ''}
                    onChange={(e) => updateClient(client.id, { instagram: e.target.value })}
                    placeholder="@username"
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
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
                  className="w-full px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
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

function CategoriesSettings({ onDeleteCategory }: { onDeleteCategory?: (categoryName: string) => void }) {
  const { categories, removeCategory, addCategory } = useProjectStore();
  const defaultCategories = ['Commercial', 'Personal'];
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleDeleteCategory = (categoryName: string) => {
    if (defaultCategories.includes(categoryName)) {
      return; // Don't delete default categories
    }

    // Use custom confirm dialog if provided, otherwise use native confirm
    if (onDeleteCategory) {
      onDeleteCategory(categoryName);
    } else {
      const confirmed = confirm(`Are you sure you want to delete the "${categoryName}" category? Projects in this category will be moved to "Personal".`);
      if (confirmed) {
        removeCategory(categoryName);
      }
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
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium flex items-center gap-2 animate-button"
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
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium animate-button"
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
            {Object.keys(currencySymbols).map(currency => {
              if (currency === baseCurrency) return null;

              // В авто режиме берем курсы из autoRates, в ручном из exchangeRates
              let rate = 0;
              if (rateMode === 'auto' && autoRates) {
                // autoRates содержит прямые курсы от базовой валюты
                // Нужно инвертировать для отображения "сколько базовой за 1 другую"
                rate = autoRates[currency] ? 1 / autoRates[currency] : 0;
              } else {
                rate = currentRates[currency] || 0;
              }

              const isEditing = editingRate?.from === baseCurrency && editingRate?.to === currency;
              const isDisabled = rateMode === 'auto';

              return (
                <div
                  key={currency}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                    isDisabled ? 'bg-zinc-800/50' : 'bg-zinc-800'
                  }`}
                >
                  <span className={`text-sm ${isDisabled ? 'text-zinc-500' : ''}`}>
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
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-accent text-right"
                        autoFocus
                      />
                    ) : (
                      <span className={`text-sm font-medium ${isDisabled ? 'text-zinc-500' : ''}`}>
                        {rate.toFixed(2)} {currencySymbols[baseCurrency]}
                      </span>
                    )}
                    {rateMode === 'manual' && (
                      <button
                        onClick={() => setEditingRate(isEditing ? null : { from: baseCurrency, to: currency })}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
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
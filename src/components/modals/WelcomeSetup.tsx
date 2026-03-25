// src/components/modals/WelcomeSetup.tsx
import { useState } from 'react';
import { FolderOpen, Rocket, Check, RefreshCw, Heart } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { selectProjectDirectory, selectExecutable, detectInstalledSoftware } from '../../utils/tauri';
import { useProjectStore } from '../../store/projectStore';
import type { SoftwareName } from '../../types/project';
import { useModalBlur } from '../../hooks/useModalBlur';
import { SoftwareIcon } from '../SoftwareIcon';
import appIcon from '../../appIcon';
import SimpleBar from 'simplebar-react';

interface WelcomeSetupProps {
  onComplete: () => void;
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
];

// Helper function to check if path is a valid executable
function isValidExecutablePath(path: string): boolean {
  if (!path) return false;
  return path.toLowerCase().endsWith('.exe');
}

export function WelcomeSetup({ onComplete }: WelcomeSetupProps) {
  const blurClass = useModalBlur();
  const { setDefaultProjectsPath, loadProjects } = useProjectStore();
  const [step, setStep] = useState(1);
  const [projectsDir, setProjectsDir] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [convertToBaseCurrency, setConvertToBaseCurrency] = useState(true);
  const [rateMode] = useState<'auto' | 'manual'>('auto');
  const [, setIsLoadingRates] = useState(false);
  const [softwarePaths, setSoftwarePaths] = useState<SoftwarePathConfig[]>(
    DEFAULT_SOFTWARE.map(sw => ({ ...sw, path: '' }))
  );
  const [isDetecting, setIsDetecting] = useState(false);

  const handleBrowseDirectory = async () => {
    const selected = await selectProjectDirectory();
    if (selected) {
      setProjectsDir(selected);
    }
  };

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

  const handleComplete = async () => {
    // Save projects directory
    if (projectsDir) {
      setDefaultProjectsPath(projectsDir);
      localStorage.setItem('defaultProjectsPath', projectsDir);
    }

    // Save currency
    localStorage.setItem('baseCurrency', currency);
    localStorage.setItem('convertToBaseCurrency', JSON.stringify(convertToBaseCurrency));
    localStorage.setItem('exchangeRateMode', rateMode);

    // Fetch initial exchange rates if auto mode is selected
    if (rateMode === 'auto' && convertToBaseCurrency) {
      setIsLoadingRates(true);
      try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
        if (response.ok) {
          const data = await response.json();
          // Cache the rates
          const cache = { [currency]: { data: { rates: data.rates, base: data.base, lastUpdated: new Date().toISOString() }, timestamp: Date.now() } };
          localStorage.setItem('exchangeRatesCache', JSON.stringify(cache));
        }
      } catch (error) {
        console.error('Failed to fetch initial exchange rates:', error);
      } finally {
        setIsLoadingRates(false);
      }
    }

    // Save software paths
    const pathsToSave: Record<string, string> = {};
    softwarePaths.forEach(sw => {
      if (sw.path) {
        pathsToSave[sw.name] = sw.path;
      }
    });
    if (Object.keys(pathsToSave).length > 0) {
      localStorage.setItem('softwarePaths', JSON.stringify(pathsToSave));
    }

    // Mark setup as completed
    localStorage.setItem('setupCompleted', 'true');

    // Reload projects with new settings
    setTimeout(() => {
      loadProjects();
    }, 100);

    onComplete();
  };

  const canProceedFromStep1 = projectsDir.trim() !== '';

  const getStepHeight = (s: number) => {
    if (s === 3) return 540;
    if (s === 4) return 400;
    return 320;
  };

  return (
    <>
    <style>{`
      @keyframes fadeSlideIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes popIn {
        0%   { opacity: 0; transform: scale(0.5); }
        70%  { transform: scale(1.1); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes modalIn {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1); }
      }
    `}</style>
    <div className={`fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4 rounded-lg ${blurClass}`}>
      <div className="bg-card-bg border border-border-secondary rounded-card max-w-3xl w-full overflow-hidden" data-modal-window style={{ animation: 'modalIn 0.2s ease-out' }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-accent to-card-bg px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <img src={appIcon} alt="nullSpace" className="w-7 h-7" />
                <h1 className="text-2xl font-bold">Welcome to nullSpace</h1>
              </div>
              <p className="text-sm text-white/80">Let's set up your workspace in just a few steps</p>
            </div>
            <Rocket className="w-8 h-8 text-white/70 flex-shrink-0" />
          </div>
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-3 bg-sidebar-bg border-b border-border-secondary flex items-center gap-3">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-accent' : 'text-text-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors duration-300 ${step >= 1 ? 'bg-accent' : 'bg-border-secondary'}`}>
              {step > 1 ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <span className="font-medium">Projects</span>
          </div>
          <div className="flex-1 h-0.5 bg-border-secondary relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-in-out" style={{ width: step >= 2 ? '100%' : '0%' }} />
          </div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-accent' : 'text-text-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${step >= 2 ? 'bg-accent' : 'bg-border-secondary'}`}>
              {step > 2 ? <Check className="w-5 h-5" /> : '2'}
            </div>
            <span className="font-medium">Currency</span>
          </div>
          <div className="flex-1 h-0.5 bg-border-secondary relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-in-out" style={{ width: step >= 3 ? '100%' : '0%' }} />
          </div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-accent' : 'text-text-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${step >= 3 ? 'bg-accent' : 'bg-border-secondary'}`}>
              {step > 3 ? <Check className="w-5 h-5" /> : '3'}
            </div>
            <span className="font-medium">Software</span>
          </div>
          <div className="flex-1 h-0.5 bg-border-secondary relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-in-out" style={{ width: step >= 4 ? '100%' : '0%' }} />
          </div>
          <div className={`flex items-center gap-2 ${step >= 4 ? 'text-accent' : 'text-text-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${step >= 4 ? 'bg-accent' : 'bg-border-secondary'}`}>
              4
            </div>
            <span className="font-medium">Ready</span>
          </div>
        </div>

        {/* Content */}
        <SimpleBar
          className="custom-scrollbar-fixed"
          style={{ height: getStepHeight(step), transition: 'height 0.3s ease' }}
          autoHide={false}
        >
          <div className="px-6">
          {step === 1 && (
            <div className="space-y-4 py-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
              <div>
                <h2 className="text-xl font-bold mb-1">Projects Directory</h2>
                <p className="text-sm text-text-muted mb-4">
                  Choose where your projects will be stored. This is where nullSpace will look for your project files.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Select Directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectsDir}
                    onChange={(e) => setProjectsDir(e.target.value)}
                    placeholder="e.g., C:\Projects or /home/user/Projects"
                    className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleBrowseDirectory}
                    className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors flex items-center gap-2 font-medium text-sm"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse
                  </button>
                </div>
              </div>

              {projectsDir && (
                <div className="bg-green-600/10 border border-green-600/30 rounded-lg px-3 py-2 flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-green-400">Directory Selected</div>
                    <div className="text-xs text-text-muted mt-0.5">{projectsDir}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
              <div>
                <h2 className="text-xl font-bold mb-1">Base Currency</h2>
                <p className="text-sm text-text-muted mb-4">
                  Select your preferred currency for financial tracking and reports.
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="grid grid-cols-3 gap-3 w-full">
                  {[
                    { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
                    { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
                    { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺' },
                  ].map((curr) => (
                    <button
                      key={curr.code}
                      onClick={() => setCurrency(curr.code)}
                      className={`relative p-4 rounded-xl border-2 transition-all group min-h-[120px] flex items-center justify-center ${
                        currency === curr.code
                          ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20'
                          : 'border-border-primary bg-sidebar-bg hover:border-border-hover hover:bg-hover-bg hover:scale-[1.02]'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="text-4xl">{curr.flag}</div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-0.5">
                            <span className="text-xl font-bold">{curr.symbol}</span>
                            <span className="text-base font-semibold text-text-primary">{curr.code}</span>
                          </div>
                          <div className="text-xs text-text-muted">{curr.name}</div>
                        </div>
                      </div>
                      {currency === curr.code && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Convert to Base Currency Toggle */}
              <div className="flex items-center justify-between bg-sidebar-bg border border-border-primary rounded-button px-4 py-3 mt-4">
                <div>
                  <div className="text-sm font-medium mb-0.5">Convert to Base Currency</div>
                  <p className="text-xs text-text-muted">
                    Automatically convert all revenue to the selected currency
                  </p>
                </div>
                <button
                  onClick={() => setConvertToBaseCurrency(!convertToBaseCurrency)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    convertToBaseCurrency ? 'bg-accent' : 'bg-border-secondary'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      convertToBaseCurrency ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 pt-3 pb-3" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold">Software Paths (Optional)</h2>
                    <button
                      onClick={handleAutoDetect}
                      disabled={isDetecting}
                      className="px-3 py-1 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-button transition-colors text-xs font-medium flex items-center gap-1.5 text-white flex-shrink-0"
                    >
                      {isDetecting && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {isDetecting ? 'Detecting...' : 'Auto-Detect'}
                    </button>
                  </div>
                  <p className="text-sm text-text-muted">
                    Configure paths to your 3D software. You can skip this step and configure it later in settings.
                  </p>
                </div>

                <div className="space-y-2">
                {softwarePaths.map((sw, index) => (
                  <div key={sw.name} className="bg-sidebar-bg rounded-button p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <SoftwareIcon name={sw.name} className="w-5 h-5" />
                        <h4 className="font-medium">{sw.displayName}</h4>
                        {isValidExecutablePath(sw.path) && <Check className="w-3 h-3 text-green-500" />}
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
          )}
          {step === 4 && (
            <div className="flex flex-col items-center py-6 text-center px-8 gap-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
              <div>
                <div className="w-[60px] h-[60px] rounded-full bg-green-600/20 grid place-items-center mb-4 mx-auto" style={{ animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                  <Check className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
                <p className="text-text-muted text-sm max-w-md">
                  nullSpace is ready to use. Start creating amazing projects and managing your creative workflow.
                </p>
              </div>

              <div className="w-full bg-sidebar-bg border border-border-secondary rounded-card px-5 py-4" style={{ animation: 'fadeSlideIn 0.3s ease-out 0.15s both' }}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-accent fill-accent" />
                  <span className="font-semibold">Support nullSpace</span>
                </div>
                <p className="text-text-muted text-xs mb-3 text-center">
                  If you find nullSpace useful, consider supporting the development to help keep improving and adding new features.
                </p>
                <button
                  onClick={() => invoke('open_url', { url: 'https://t.me/mendelsonvfx' })}
                  className="w-full py-2 bg-gradient-to-br from-accent to-accent-hover rounded-button font-semibold text-white text-sm transition-opacity hover:opacity-90"
                >
                  Support Development
                </button>
                <p className="text-text-muted text-xs mt-2 text-center">100% optional • Your support is appreciated</p>
              </div>
            </div>
          )}
          </div>
        </SimpleBar>

        {/* Footer */}
        <div className="px-6 py-4 bg-sidebar-bg flex justify-between items-center border-t border-border-secondary">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-1.5 text-sm bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors font-medium"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !canProceedFromStep1}
                className="px-4 py-1.5 text-sm bg-gradient-to-br from-accent to-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors font-medium text-white"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="px-4 py-1.5 text-sm bg-gradient-to-br from-accent to-accent-hover rounded-button transition-colors font-medium text-white flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Get Started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

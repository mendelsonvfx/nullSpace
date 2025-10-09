// src/components/WelcomeSetup.tsx
import { useState } from 'react';
import { FolderOpen, Rocket, Check } from 'lucide-react';
import { selectProjectDirectory, selectExecutable } from '../utils/tauri';
import { useProjectStore } from '../store/projectStore';
import type { SoftwareName } from '../types/project';

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
  // { name: 'cinema4d', displayName: 'Cinema 4D' },
  // { name: 'substance', displayName: 'Substance Painter' },
];

export function WelcomeSetup({ onComplete }: WelcomeSetupProps) {
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
  const hasSoftwarePathsConfigured = softwarePaths.some(sw => sw.path.trim() !== '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl max-w-3xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-zinc-800 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <img src="/icon.png" alt="nullSpace" className="w-7 h-7" />
                <h1 className="text-2xl font-bold">Welcome to nullSpace</h1>
              </div>
              <p className="text-sm text-purple-100">Let's set up your workspace in just a few steps</p>
            </div>
            <Rocket className="w-8 h-8 text-purple-200 flex-shrink-0" />
          </div>
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-3 bg-zinc-800 flex items-center gap-3">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-purple-400' : 'text-zinc-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-purple-600' : 'bg-zinc-700'}`}>
              {step > 1 ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <span className="font-medium">Projects</span>
          </div>
          <div className="flex-1 h-0.5 bg-zinc-700" />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-purple-400' : 'text-zinc-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-purple-600' : 'bg-zinc-700'}`}>
              {step > 2 ? <Check className="w-5 h-5" /> : '2'}
            </div>
            <span className="font-medium">Currency</span>
          </div>
          <div className="flex-1 h-0.5 bg-zinc-700" />
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-purple-400' : 'text-zinc-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-purple-600' : 'bg-zinc-700'}`}>
              3
            </div>
            <span className="font-medium">Software</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 h-[320px] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Projects Directory</h2>
                <p className="text-sm text-zinc-400 mb-4">
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
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleBrowseDirectory}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 font-medium text-sm"
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
                    <div className="text-xs text-zinc-400 mt-0.5">{projectsDir}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Base Currency</h2>
                <p className="text-sm text-zinc-400 mb-4">
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
                          ? 'border-purple-500 bg-purple-600/20 shadow-lg shadow-purple-500/20'
                          : 'border-zinc-700 bg-zinc-800 hover:border-purple-400/50 hover:bg-zinc-750'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="text-4xl">{curr.flag}</div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-0.5">
                            <span className="text-xl font-bold">{curr.symbol}</span>
                            <span className="text-base font-semibold text-zinc-300">{curr.code}</span>
                          </div>
                          <div className="text-xs text-zinc-400">{curr.name}</div>
                        </div>
                      </div>
                      {currency === curr.code && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Convert to Base Currency Toggle */}
              <div className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3 mt-4">
                <div>
                  <div className="text-sm font-medium mb-0.5">Convert to Base Currency</div>
                  <p className="text-xs text-zinc-400">
                    Automatically convert all revenue to the selected currency
                  </p>
                </div>
                <button
                  onClick={() => setConvertToBaseCurrency(!convertToBaseCurrency)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    convertToBaseCurrency ? 'bg-purple-600' : 'bg-zinc-700'
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
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Software Paths (Optional)</h2>
                <p className="text-sm text-zinc-400 mb-3">
                  Configure paths to your 3D software. You can skip this step and configure it later in settings.
                </p>
              </div>

              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2">
                {softwarePaths.map((sw, index) => (
                  <div key={sw.name} className="bg-zinc-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium">{sw.displayName}</h4>
                      {sw.path && <Check className="w-3 h-3 text-green-500" />}
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
                        placeholder={`Path to ${sw.displayName}...`}
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={() => handleBrowseExecutable(index)}
                        className="px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-800 flex justify-between items-center border-t border-zinc-700">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !canProceedFromStep1}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
              >
                Next
              </button>
            ) : (
              <>
                <button
                  onClick={handleComplete}
                  className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
                >
                  Skip This Step
                </button>
                <button
                  onClick={handleComplete}
                  disabled={!hasSoftwarePathsConfigured}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Complete Setup
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

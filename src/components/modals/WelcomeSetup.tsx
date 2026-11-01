// src/components/modals/WelcomeSetup.tsx
import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Check, AlertCircle, X, Heart, Rocket } from 'lucide-react';
import { open } from '@tauri-apps/api/shell';
import { selectProjectDirectory, selectExecutable } from '../../utils/tauri';
import { useProjectStore } from '../../store/projectStore';
import type { SoftwareName } from '../../types/project';
import { useModalBlur } from '../../hooks/useModalBlur';
import { getSoftwareMeta } from '../../utils/softwareMeta';
import { SUPPORT_COLOR, SUPPORT_COLOR_LIGHT } from '../../utils/constants';
import appIcon from '../../appIcon';

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
  { name: 'unreal', displayName: 'Unreal Engine' },
  { name: 'cinema4d', displayName: 'Cinema 4D' },
  { name: 'substance', displayName: 'Substance Painter' },
  { name: 'davinci', displayName: 'DaVinci Resolve' },
];

const STEP_LABELS = ['Projects', 'Currency', 'Software', 'Ready'];

const CURRENCIES = [
  { code: 'USD', abbr: 'US', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', abbr: 'EU', symbol: '€', name: 'Euro' },
  { code: 'RUB', abbr: 'RU', symbol: '₽', name: 'Russian Ruble' },
];

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

  const handleBrowseDirectory = async () => {
    const selected = await selectProjectDirectory();
    if (selected) setProjectsDir(selected);
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

  const handleClearPath = (index: number) => {
    setSoftwarePaths(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], path: '' };
      return updated;
    });
  };

  const handleComplete = async () => {
    if (projectsDir) {
      setDefaultProjectsPath(projectsDir);
      localStorage.setItem('defaultProjectsPath', projectsDir);
    }

    localStorage.setItem('baseCurrency', currency);
    localStorage.setItem('convertToBaseCurrency', JSON.stringify(convertToBaseCurrency));
    localStorage.setItem('exchangeRateMode', rateMode);

    if (rateMode === 'auto' && convertToBaseCurrency) {
      setIsLoadingRates(true);
      try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
        if (response.ok) {
          const data = await response.json();
          const cache = {
            [currency]: {
              data: { rates: data.rates, base: data.base, lastUpdated: new Date().toISOString() },
              timestamp: Date.now(),
            },
          };
          localStorage.setItem('exchangeRatesCache', JSON.stringify(cache));
        }
      } catch (error) {
        console.error('Failed to fetch initial exchange rates:', error);
      } finally {
        setIsLoadingRates(false);
      }
    }

    const pathsToSave: Record<string, string> = {};
    softwarePaths.forEach(sw => {
      if (sw.path) pathsToSave[sw.name] = sw.path;
    });
    if (Object.keys(pathsToSave).length > 0) {
      localStorage.setItem('softwarePaths', JSON.stringify(pathsToSave));
      window.dispatchEvent(new CustomEvent('softwarePaths:updated'));
    }

    localStorage.setItem('setupCompleted', 'true');
    setTimeout(() => { loadProjects(); }, 100);
    onComplete();
  };

  const canProceedFromStep1 = projectsDir.trim() !== '';
  const canProceedFromStep3 = softwarePaths.some(sw => isValidExecutablePath(sw.path));

  const bodyInnerRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = bodyInnerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBodyHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <style>{`
        @keyframes wzStepIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes wzDirIn {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes wzPop {
          0%   { opacity: 0; transform: scale(0.5); }
          70%  { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div className={`fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4 ${blurClass}`}>
        <div
          className="bg-card-bg border border-border-secondary rounded-modal max-w-3xl w-full overflow-hidden"
          data-modal-window
          style={{ animation: 'modalIn 0.2s ease-out' }}
        >
          {/* Header */}
          <div
            className="px-[26px] py-[22px] flex items-center justify-between border-b border-border-primary"
            style={{ background: 'linear-gradient(150deg,#20082b 0%,#140715 60%,#0c0710 100%)' }}
          >
            <div className="flex items-center gap-4">
              <img src={appIcon} alt="nullSpace" className="w-10 h-10 select-none pointer-events-none flex-shrink-0" />
              <div>
                <div className="text-xl font-extrabold text-text-primary">Welcome to nullSpace</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  Let's set up your workspace in just a few steps
                </div>
              </div>
            </div>
            <Rocket className="w-8 h-8 flex-shrink-0 opacity-35 text-text-secondary" />
          </div>

          {/* Stepper */}
          <div className="px-[26px] py-[18px] border-b border-border-primary flex gap-[10px]">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex-1">
                <div
                  className={`text-[11.5px] font-semibold mb-[8px] select-none transition-colors ${
                    i + 1 === step
                      ? 'text-white'
                      : i + 1 < step
                      ? 'text-text-muted cursor-pointer hover:text-text-secondary'
                      : 'text-text-muted'
                  }`}
                  onClick={() => { if (i + 1 < step) setStep(i + 1); }}
                >
                  {label}
                </div>
                <div className="h-[4px] rounded-full bg-border-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-[400ms]"
                    style={{
                      width: i + 1 <= step ? '100%' : '0%',
                      transitionTimingFunction: 'cubic-bezier(.22,.61,.36,1)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Body — outer div transitions height; undefined = auto (no transition/clip on first open) */}
          <div style={{ height: bodyHeight, overflow: bodyHeight !== undefined ? 'hidden' : 'visible', transition: 'height 0.25s cubic-bezier(.22,.61,.36,1)' }}>
            <div ref={bodyInnerRef} className="px-[26px] py-[24px]">
            <div key={step} style={{ animation: 'wzStepIn .28s cubic-bezier(.22,.61,.36,1)' }}>

              {/* Step 1: Projects Directory */}
              {step === 1 && (
                <div>
                  <h2 className="text-lg font-extrabold" style={{ color: '#f4f4f7' }}>Projects Directory</h2>
                  <p className="text-[13px] text-text-muted mt-[5px]" style={{ maxWidth: 560 }}>
                    Choose where your projects will be stored. This is where nullSpace will look for your project files.
                  </p>
                  <label className="block text-[12px] font-semibold text-text-primary mt-[22px] mb-[9px]">Select Directory</label>
                  <div className="flex gap-[10px]">
                    <input
                      type="text"
                      value={projectsDir}
                      onChange={(e) => setProjectsDir(e.target.value)}
                      placeholder="e.g., C:\Projects or /home/user/Projects"
                      className="flex-1 h-9 bg-app-bg border border-border-secondary rounded-button px-[14px] text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors"
                    />
                    <button
                      onClick={handleBrowseDirectory}
                      className="h-9 px-[15px] bg-hover-bg border border-border-secondary rounded-button text-[13px] font-semibold text-text-primary hover:border-border-hover hover:text-white transition-colors flex items-center gap-2"
                    >
                      <FolderOpen className="w-[15px] h-[15px]" />
                      Browse
                    </button>
                  </div>
                  {projectsDir && (
                    <div
                      className="flex items-center gap-[11px] px-[14px] py-[11px] rounded-button"
                      style={{
                        animation: 'wzDirIn 0.2s cubic-bezier(.22,.61,.36,1) 55ms both',
                        marginTop: 12,
                        background: '#0d1811',
                        border: '1px solid #234e2c',
                      }}
                    >
                      <span
                        className="flex items-center justify-center flex-none"
                        style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(74,222,128,.12)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#4ade80' }}>Directory Selected</span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Currency */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Base Currency</h2>
                    <p className="text-sm text-text-muted mb-4">
                      Select your preferred currency for financial tracking and reports.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {CURRENCIES.map((curr) => (
                      <button
                        key={curr.code}
                        onClick={() => setCurrency(curr.code)}
                        className={`relative p-5 text-center rounded-button border-[1.5px] cursor-pointer transition-colors ${
                          currency === curr.code
                            ? 'border-accent bg-hover-bg'
                            : 'border-border-secondary bg-app-bg hover:border-border-hover'
                        }`}
                      >
                        {currency === curr.code && (
                          <div className="absolute top-2 right-2">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M2.5 7L5.5 10L11.5 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        <div className="text-[26px] font-extrabold text-text-primary leading-none">{curr.abbr}</div>
                        <div className="text-sm font-bold text-text-primary mt-2">{curr.symbol} {curr.code}</div>
                        <div className="text-[11.5px] text-text-muted mt-1">{curr.name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-app-bg border border-border-primary rounded-button px-4 py-3">
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

              {/* Step 3: Software Paths */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">
                      Software Paths
                    </h2>
                    <p className="text-sm text-text-muted mt-1">
                      Configure paths to your 3D software. You can skip this step and configure it later in settings.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {softwarePaths.map((sw, index) => {
                      const meta = getSoftwareMeta(sw.name);
                      const valid = isValidExecutablePath(sw.path);
                      return (
                        <div
                          key={sw.name}
                          className="group flex items-center gap-[14px] px-[14px] py-3 rounded-med border transition-colors"
                          style={{
                            background: valid ? '#0f0f12' : '#120f0c',
                            borderColor: valid ? '#202026' : '#3a2a18',
                          }}
                        >
                          {/* Icon — always show the real gradient/logo icon */}
                          {meta.logoPath ? (
                            <div className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none bg-card-bg">
                              <img
                                src={meta.logoPath}
                                alt={meta.display}
                                style={{ width: 28, height: 28, objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div
                              className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none select-none font-bold"
                              style={{
                                background: meta.gradient,
                                color: meta.textColor ?? '#fff',
                                fontSize: meta.abbr.length === 1 ? 18 : 14,
                              }}
                            >
                              {meta.abbr}
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-[7px]">
                              <span className="text-[13px] font-semibold text-text-primary">{sw.displayName}</span>
                              {valid ? (
                                <Check style={{ width: 11, height: 11, color: '#5fbf7a', flexShrink: 0 }} />
                              ) : (
                                <span
                                  className="flex items-center gap-[4px] text-[10px] font-semibold"
                                  style={{ color: '#d99a3d' }}
                                >
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
              )}

              {/* Step 4: Ready */}
              {step === 4 && (
                <div className="flex flex-col items-center py-4 text-center gap-5">
                  <div>
                    <div
                      className="mb-4 mx-auto w-fit"
                      style={{ animation: 'wzPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    >
                      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                        <path
                          d="M10 26L21 37L42 15"
                          stroke="#4ade80"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
                    <p className="text-text-muted text-sm max-w-md">
                      nullSpace is ready to use. Start creating amazing projects and managing your creative workflow.
                    </p>
                  </div>
                  <div
                    className="w-full bg-app-bg border border-border-primary rounded-button p-[18px]"
                    style={{ animation: 'wzStepIn 0.3s ease-out 0.15s both' }}
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Heart className="w-4 h-4" style={{ color: SUPPORT_COLOR_LIGHT, fill: SUPPORT_COLOR_LIGHT }} />
                      <span className="font-semibold text-text-primary">Support nullSpace</span>
                    </div>
                    <p className="text-text-muted text-xs mb-3 text-center">
                      If you find nullSpace useful, consider supporting the development to help keep improving and adding new features.
                    </p>
                    <button
                      onClick={() => open('https://mendelsonvfx.com').catch(() => {})}
                      className="w-full h-[38px] text-white font-bold rounded-button text-[13px] hover:brightness-110 transition-all"
                      style={{ backgroundColor: SUPPORT_COLOR }}
                    >
                      Support Development
                    </button>
                    <p className="text-text-muted text-[10.5px] mt-2 text-center">
                      100% optional • Your support is appreciated
                    </p>
                  </div>
                </div>
              )}

            </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center px-[26px] py-[16px] border-t border-border-primary">
            <div>
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="h-8 px-[14px] bg-transparent border border-border-secondary rounded-button
                             text-[13px] font-semibold text-text-secondary
                             hover:border-border-hover hover:text-text-primary transition-colors"
                >
                  Back
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center">
              {step === 3 && (
                <button
                  onClick={() => setStep(4)}
                  className="h-8 px-[14px] bg-transparent border-none text-[13px] font-semibold text-text-muted hover:text-text-primary transition-colors mr-[9px] cursor-pointer"
                >
                  Skip
                </button>
              )}
              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={(step === 1 && !canProceedFromStep1) || (step === 3 && !canProceedFromStep3)}
                  className="h-8 px-[16px] bg-accent rounded-button text-white font-bold text-[13px]
                             disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="h-8 px-[16px] bg-accent rounded-button text-white font-bold text-[13px] hover:opacity-90 transition-opacity"
                >
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

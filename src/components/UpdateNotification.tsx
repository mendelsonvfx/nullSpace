import { useState, useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/api/shell';
import ReactMarkdown from 'react-markdown';

type Phase = 'available' | 'installing';

interface Props {
  version: string;
  downloadUrl: string;
  notes?: string;
  pubDate?: string;
  onDismiss: () => void;
}

export function UpdateNotification({ version, downloadUrl, notes, pubDate, onDismiss }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('available');
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);

  useEffect(() => { setIsVisible(true); }, []);

  const handleUpdate = async () => {
    setPhase('installing');
    const unlisten = await listen<{ downloaded: number; total: number }>('update:progress', (e) => {
      setProgress(e.payload);
    });
    try {
      // Downloads new exe to temp dir and exits the process — may not return
      await invoke('install_portable_update', { downloadUrl });
    } catch {
      unlisten();
      onDismiss();
    }
  };

  const dismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 200);
  };

  const formattedDate = pubDate
    ? new Date(pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[120] transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={phase === 'available' ? dismiss : undefined}
    >
      <div
        className={`bg-card-bg border border-border-primary rounded-card w-full max-w-lg mx-4 overflow-hidden shadow-2xl transition-transform duration-200 ${
          isVisible ? 'scale-100' : 'scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-5 border-b border-border-primary">
          <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-hover-bg flex items-center justify-center">
            <Download className="w-6 h-6 text-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Update Available</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-text-muted">nullSpace</span>
              {/* bg-accent/20 breaks with hex CSS variable — use existing App.css custom properties instead */}
              <span
                className="px-2 py-0.5 text-xs font-semibold rounded-badge"
                style={{
                  backgroundColor: 'var(--accent-color-subtle)',
                  color: 'var(--accent-color)',
                  border: '1px solid var(--accent-color-border)',
                }}
              >
                v{version}
              </span>
            </div>
          </div>
          {phase === 'available' && (
            <button
              onClick={dismiss}
              className="text-text-muted hover:text-white transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {phase === 'available' ? (
          <>
            <div className="px-6 pt-5 pb-2">
              {/* Version / date strip */}
              <div className="flex gap-4 px-4 py-3 bg-sidebar-bg border border-border-primary rounded-button mb-5">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Version</div>
                  <div className="text-sm font-semibold">{version}</div>
                </div>
                {formattedDate && (
                  <>
                    <div className="w-px bg-border-primary self-stretch" />
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Released</div>
                      <div className="text-sm font-semibold">{formattedDate}</div>
                    </div>
                  </>
                )}
              </div>

              {/* Notes — rendered as markdown, scrollable */}
              {notes && notes.trim() && (
                <div className="mb-5">
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                    What's New
                  </div>
                  <div className="max-h-48 overflow-y-auto pr-1 text-sm text-text-muted leading-relaxed">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        h2: ({ children }) => <h2 className="font-semibold text-white mt-3 mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-semibold text-white mt-2 mb-1">{children}</h3>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      }}
                    >
                      {notes}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* View Full Changelog */}
              <button
                onClick={() => open('https://mendelsonvfx.com/').catch(() => {})}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-button bg-sidebar-bg border border-border-primary text-text-muted hover:text-white hover:border-border-secondary text-sm font-medium transition-colors mb-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Full Changelog
              </button>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-border-primary">
              <button
                onClick={dismiss}
                className="flex-1 px-4 py-2 text-sm bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button text-text-muted hover:text-white transition-colors"
              >
                Remind Me Later
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded-button bg-accent hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-white"
              >
                <Download className="w-4 h-4" />
                Update Now
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-10 px-6 gap-5">
            <div className="font-semibold">Installing Update...</div>
            <div className="w-full">
              <div className="w-full h-1.5 bg-hover-bg rounded-full overflow-hidden">
                {progress && progress.total > 0 ? (
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((progress.downloaded / progress.total) * 100))}%` }}
                  />
                ) : (
                  <div className="h-full bg-accent rounded-full opacity-40 animate-pulse" />
                )}
              </div>
              {progress && progress.total > 0 && (
                <div className="flex justify-between mt-2 text-xs text-text-muted">
                  <span>{(progress.downloaded / 1024 / 1024).toFixed(1)} MB</span>
                  <span>{Math.round((progress.downloaded / progress.total) * 100)}%</span>
                </div>
              )}
            </div>
            <div className="text-sm text-text-muted text-center">
              The app will restart automatically when the update is ready
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

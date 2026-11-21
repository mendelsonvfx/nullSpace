import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalBlur } from '../../hooks/useModalBlur';
import { useEscapeLayer } from '../../utils/escapeLayers';

interface ThirdPartyNoticesModalProps {
  onClose: () => void;
}

const MISSING_TEXT = 'Third-party notices are generated in release builds.';

/** Shows THIRD-PARTY-NOTICES.txt, which the build writes next to index.html (scripts/third-party-notices.mjs). */
export function ThirdPartyNoticesModal({ onClose }: ThirdPartyNoticesModalProps) {
  const blurClass = useModalBlur();
  const [text, setText] = useState<string | null>(null);
  useEscapeLayer(true, onClose);

  useEffect(() => {
    let cancelled = false;
    fetch('/THIRD-PARTY-NOTICES.txt')
      .then(async (res) => {
        const body = res.ok ? await res.text() : '';
        // A dev server (and an SPA fallback) answers a missing file with index.html and status 200
        const isNotices = body.length > 0 && !body.trimStart().startsWith('<');
        if (!cancelled) setText(isNotices ? body : MISSING_TEXT);
      })
      .catch(() => {
        if (!cancelled) setText(MISSING_TEXT);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-[4px] ${blurClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
          onClose();
        }
        delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
      }}
    >
      <div
        className="bg-card-bg border border-border-secondary rounded-card w-full max-w-[760px] h-[80vh] flex flex-col overflow-hidden animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-secondary flex-shrink-0">
          <div>
            <div className="text-base font-semibold">Third-party notices</div>
            <div className="text-[12px] text-text-muted mt-0.5">Open-source components included in nullSpace and their licenses</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-hover-bg text-text-muted hover:text-text-primary transition-colors border-0 bg-transparent cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {text === null ? (
            <div className="text-[13px] text-text-muted">Loading…</div>
          ) : (
            <pre className="text-[11px] leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-words select-text m-0">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

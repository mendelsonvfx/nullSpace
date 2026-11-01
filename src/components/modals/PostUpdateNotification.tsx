import { useState, useEffect } from 'react';
import { Check, Heart, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { SUPPORT_COLOR, SUPPORT_COLOR_DARK, SUPPORT_COLOR_LIGHT } from '../../utils/constants';

interface Props {
  version: string;
  onClose: () => void;
}

export function PostUpdateNotification({ version, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  const dismiss = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[120] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={dismiss}
    >
      <div
        className="bg-card-bg border border-border-primary rounded-card p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button onClick={dismiss} className="text-text-muted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-[60px] h-[60px] rounded-full bg-green-600/20 flex items-center justify-center mb-4 pt-1">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold mb-1">Successfully Updated!</h2>
          <p className="text-text-muted text-sm mb-3">nullSpace has been updated to the latest version.</p>
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

        {/* Donation card — animated gradient border wrapper */}
        <div className="relative w-full rounded-card overflow-hidden mb-5 p-[1px]" style={{
          boxShadow: `0 0 18px color-mix(in srgb, ${SUPPORT_COLOR} 35%, transparent)`,
        }}>
          {/* Spinning conic gradient — creates the animated border */}
          <div style={{
            position: 'absolute',
            inset: '-100%',
            background: `conic-gradient(from 0deg, transparent 0deg, ${SUPPORT_COLOR} 60deg, ${SUPPORT_COLOR_LIGHT} 90deg, transparent 150deg)`,
            animation: 'spin-border 3s linear infinite',
            filter: 'blur(6px)',
            zIndex: 0,
          }} />
          <div className="relative bg-sidebar-bg rounded-[11px] px-5 py-4" style={{ zIndex: 1 }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Heart className="w-4 h-4" style={{ color: SUPPORT_COLOR_LIGHT, fill: SUPPORT_COLOR_LIGHT }} />
              <span className="font-semibold">Support nullSpace</span>
            </div>
            <p className="text-text-muted text-xs mb-3 text-center">
              If you find nullSpace useful, consider supporting the development to help keep improving and adding new features.
            </p>
            <button
              onClick={() => invoke('open_url', { url: 'https://t.me/mendelsonvfx' })}
              className="w-full py-2 rounded-button font-semibold text-white text-sm transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(to bottom right, ${SUPPORT_COLOR}, ${SUPPORT_COLOR_DARK})` }}
            >
              Support Development
            </button>
            <p className="text-text-muted text-xs mt-2 text-center">100% optional • Your support is appreciated</p>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={dismiss}
          className="w-full px-4 py-2 text-sm bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button text-text-muted hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

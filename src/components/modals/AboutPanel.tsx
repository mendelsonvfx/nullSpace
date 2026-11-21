import { useEffect, useState } from 'react';
import { X, ExternalLink, ChevronRight } from 'lucide-react';
import { open } from '@tauri-apps/api/shell';
import { getVersion } from '@tauri-apps/api/app';
import appIcon from '../../appIcon';
import { useModalBlur } from '../../hooks/useModalBlur';
import { SupportButton } from '../ui/SupportButton';
import { ThirdPartyNoticesModal } from './ThirdPartyNoticesModal';

const REPO_URL = 'https://github.com/mendelsonvfx/nullSpace';

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const blurClass = useModalBlur();
  const [version, setVersion] = useState<string | null>(null);
  const [showNotices, setShowNotices] = useState(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const links = [
    {
      title: 'Portfolio Website',
      url: 'https://mendelsonvfx.com/',
      description: 'My VFX portfolio'
    },
    {
      title: 'Telegram',
      url: 'https://t.me/vision_onee',
      description: 'Contact me on Telegram'
    },
    {
      title: 'Project Page',
      url: 'https://mendelsonvfx.com/#nullspace',
      description: 'View project page',
      disabled: false
    }
  ];

  // The source of exactly this build: the release tag, or the repository while the version is unknown
  const sourceUrl = version ? `${REPO_URL}/tree/v${version}` : REPO_URL;

  const legalButtonClass = 'flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap px-2 py-2 border border-border-secondary rounded-lg bg-card-bg hover:bg-hover-bg hover:border-border-hover transition-colors text-[12px] text-text-primary cursor-pointer';

  return (
    <>
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
          className="bg-card-bg border border-border-secondary rounded-card w-full max-w-[420px] overflow-hidden animate-modal"
          onClick={(e) => e.stopPropagation()}
          data-modal-window
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-6 border-b border-border-secondary">
            <div className="flex items-center gap-3">
              <img src={appIcon} alt="nullSpace Logo" className="w-8 h-8 select-none pointer-events-none" />
              <div>
                <div className="text-xl font-bold">nullSpace</div>
                <div className="text-[13px] text-text-muted">Project Management Tool</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-hover-bg text-text-muted hover:text-text-primary transition-colors border-0 bg-transparent cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            <p className="text-[13px] text-text-muted leading-relaxed mb-6">
              nullSpace is a project management tool designed for creative professionals.
              Organize your projects, track deadlines, manage finances, and more.
            </p>

            <div className="text-base font-semibold mb-3">Developer</div>

            <div className="flex flex-col gap-2 mb-6">
              {links.map((link) => (
                <button
                  key={link.title}
                  disabled={link.disabled}
                  onClick={() => !link.disabled && open(link.url).catch(() => {})}
                  className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors text-text-primary text-left ${
                    link.disabled
                      ? 'border-border-secondary bg-card-bg opacity-50 cursor-not-allowed'
                      : 'border-border-secondary bg-card-bg hover:bg-hover-bg hover:border-border-hover cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-text-primary">{link.title}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">{link.description}</div>
                  </div>
                  {!link.disabled && <ExternalLink className="w-4 h-4 text-text-muted flex-shrink-0" />}
                </button>
              ))}
            </div>

            {/* Legal notices (GPL-3.0 section 0: "Appropriate Legal Notices") */}
            <div className="text-base font-semibold mb-2">License</div>
            <p className="text-[12px] text-text-muted leading-relaxed mb-3">
              © 2025-2026 Oleg Mendelson. nullSpace is free software under the GNU General Public License v3
              or later. Provided as is, without any warranty.
            </p>
            <div className="flex gap-2 mb-6">
              <button onClick={() => open(sourceUrl).catch(() => {})} className={legalButtonClass}>
                Source code
                <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
              </button>
              <button onClick={() => open(`${REPO_URL}/blob/nullSpace-main/LICENSE`).catch(() => {})} className={legalButtonClass}>
                License
                <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
              </button>
              <button onClick={() => setShowNotices(true)} className={legalButtonClass}>
                Third-party notices
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              </button>
            </div>

            <div className="text-center text-[12px] text-text-muted">
              {version && <p>Version {version}</p>}
              <p className="mt-1">Made with passion by MendelsonVFX</p>
            </div>

            <SupportButton heart className="mt-5" />

          </div>
        </div>
      </div>

      {showNotices && <ThirdPartyNoticesModal onClose={() => setShowNotices(false)} />}
    </>
  );
}

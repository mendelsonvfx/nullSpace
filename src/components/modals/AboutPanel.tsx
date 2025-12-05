import { X, ExternalLink } from 'lucide-react';
import { useModalBlur } from '../../hooks/useModalBlur';

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const blurClass = useModalBlur();
  const links = [
    {
      title: 'Telegram',
      url: 'https://t.me/vision_onee',
      description: 'Contact me on Telegram'
    },
    {
      title: 'All Links',
      url: 'https://linktr.ee/vision_onee',
      description: 'All my social links'
    },
    {
      title: 'Portfolio Website',
      url: 'https://mendelsonvfx.framer.website',
      description: 'My VFX portfolio'
    },
    {
      title: 'Project Page',
      url: '#',
      description: 'nullSpace project page (Coming soon)',
      disabled: true
    }
  ];

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg animate-fade-in ${blurClass}`}
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
        className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md mx-4 overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="nullSpace Logo" className="w-8 h-8 select-none pointer-events-none" />
            <div>
              <h2 className="text-xl font-bold">nullSpace</h2>
              <p className="text-sm text-zinc-400">Project Management Tool</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <p className="text-sm text-zinc-400">
              nullSpace is a project management tool designed for creative professionals.
              Organize your projects, track deadlines, manage finances, and more.
            </p>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Developer</h3>
            <div className="space-y-2">
              {links.map((link) => (
                <a
                  key={link.title}
                  href={link.disabled ? undefined : link.url}
                  target={link.disabled ? undefined : "_blank"}
                  rel={link.disabled ? undefined : "noopener noreferrer"}
                  className={`block p-3 rounded-lg border transition-colors ${
                    link.disabled
                      ? 'border-zinc-800 bg-zinc-900/50 cursor-not-allowed opacity-50'
                      : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700'
                  }`}
                  onClick={(e) => link.disabled && e.preventDefault()}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{link.title}</div>
                      <div className="text-xs text-zinc-500">{link.description}</div>
                    </div>
                    {!link.disabled && <ExternalLink className="w-4 h-4 text-zinc-500" />}
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="text-center text-xs text-zinc-500">
            <p>Version 1.1.51</p>
            <p className="mt-1">Made with passion by Vision One</p>
          </div>
        </div>
      </div>
    </div>
  );
}

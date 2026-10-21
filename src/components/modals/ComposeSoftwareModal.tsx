import { useState, useEffect } from 'react';
import { SoftwareIcon } from '../SoftwareIcon';
import { COMPOSE_SOFTWARE_OPTIONS } from '../../utils';
import { useModalBlur } from '../../hooks/useModalBlur';

// Only needed when the key can't be derived from the display name (e.g. 'Cinema 4D' -> 'cinema4d')
const nameToKey: Record<string, string> = {
  'After Effects': 'after-effects',
  'Blender': 'blender',
  'Houdini': 'houdini',
  'Photoshop': 'photoshop',
  'DaVinci Resolve': 'davinci',
};

export const composeKeyOf = (name: string) =>
  nameToKey[name] ?? name.toLowerCase().replace(/\s+/g, '-');

export interface ComposeSoftwareSelection {
  key: string;
  name: string;
}

export function ComposeSoftwareModal({
  onConfirm,
  onClose,
  initialSelected = [],
}: {
  onConfirm: (selected: ComposeSoftwareSelection[]) => Promise<void> | void;
  onClose: () => void;
  /** Keys already chosen (when changing the compose software) */
  initialSelected?: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(COMPOSE_SOFTWARE_OPTIONS.filter(name => initialSelected.includes(composeKeyOf(name))))
  );
  const [submitting, setSubmitting] = useState(false);
  const blurClass = useModalBlur();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${blurClass}`}
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-border-secondary rounded-card p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Choose Compose Software</h3>
        <p className="text-text-muted text-sm mb-4">
          Select which software you use for compositing in this project.
        </p>
        <div className="flex gap-2 flex-wrap mb-5">
          {COMPOSE_SOFTWARE_OPTIONS.map((sw) => (
            <button
              key={sw}
              onClick={() => setSelected(prev => {
                const next = new Set(prev);
                next.has(sw) ? next.delete(sw) : next.add(sw);
                return next;
              })}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-button text-xs border transition-colors ${
                selected.has(sw)
                  ? 'bg-hover-bg border-border-hover text-text-primary'
                  : 'bg-sidebar-bg border-border-primary text-text-muted hover:bg-hover-bg hover:text-text-primary'
              }`}
            >
              <SoftwareIcon name={sw} className="w-3.5 h-3.5" />
              {sw}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={selected.size === 0 || submitting}
            onClick={async () => {
              if (selected.size === 0 || submitting) return;
              setSubmitting(true);
              try {
                await onConfirm([...selected].map(name => ({ key: composeKeyOf(name), name })));
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-button text-sm font-medium text-white transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

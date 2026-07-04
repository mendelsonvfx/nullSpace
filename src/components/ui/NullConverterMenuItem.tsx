import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import type { NullConverterItem } from '../../hooks/useNullConverter';

interface Props {
  items: NullConverterItem[];
  exe: string;
  input: string;
  onClose: () => void;
}

export function NullConverterMenuItem({ items, exe, input, onClose }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [submenuVisible, setSubmenuVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const clear = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  useLayoutEffect(() => {
    if (isOpen && submenuRef.current) {
      const rect = submenuRef.current.getBoundingClientRect();
      setSubmenuSide(rect.right > window.innerWidth - 8 ? 'left' : 'right');
      setSubmenuVisible(true);
    } else {
      setSubmenuSide('right');
      setSubmenuVisible(false);
    }
  }, [isOpen]);

  const open  = () => { clear(); setIsOpen(true); };
  const close = () => { clear(); timeoutRef.current = window.setTimeout(() => setIsOpen(false), 300); };

  return (
    <div className="relative" onMouseEnter={open} onMouseLeave={close}>
      <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md flex items-center justify-between text-text-primary transition-colors cursor-pointer">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 flex items-center justify-center">
            <img src="/icons/nullconverter.png" className="w-4 h-4 rounded-[3px]" />
          </span>
          <span>nullConverter</span>
        </span>
        <ChevronRight className="w-3 h-3 text-text-muted" />
      </button>
      {isOpen && (
        <div
          ref={submenuRef}
          style={{ visibility: submenuVisible ? 'visible' : 'hidden' }}
          className={`absolute ${submenuSide === 'right' ? 'left-full ml-2.5' : 'right-full mr-2.5'} top-1/2 -translate-y-1/2 bg-card-bg border border-border-secondary rounded-xl shadow-2xl p-1.5 z-[110]`}
          onMouseEnter={() => { clear(); setIsOpen(true); }}
          onMouseLeave={close}
        >
          {items.map(({ mode, label }) => (
            <button
              key={mode}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md text-text-primary transition-colors cursor-pointer whitespace-nowrap"
              onClick={() => {
                invoke('launch_null_converter', { exe, mode, input })
                  .catch(err => console.error('[nullConverter] launch failed:', err));
                onClose();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

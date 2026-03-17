import { useState, useRef, useEffect, useCallback } from 'react';
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  prefix?: string;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  compact = false,
  prefix,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      containerRef.current && !containerRef.current.contains(e.target as Node) &&
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  }, []);

  const open = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    const close = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, handleClickOutside]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? setIsOpen(false) : open())}
        className={[
          'w-full flex items-center justify-between gap-2 px-3',
          compact ? 'py-[7px] text-xs' : 'py-2 min-h-[38px] text-sm',
          'bg-sidebar-bg border rounded-button transition-colors duration-150 select-none',
          isOpen
            ? 'border-border-secondary'
            : compact
              ? 'border-border-primary hover:border-border-hover group'
              : 'border-border-primary hover:border-border-secondary',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {selectedOption?.color && (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className={
            selectedOption && !compact
              ? 'text-text-primary truncate'
              : compact
                ? 'text-text-muted group-hover:text-text-primary transition-colors duration-150 truncate'
                : 'text-text-muted truncate'
          }>
            {prefix && <span className="text-text-muted mr-1">{prefix}</span>}
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${compact ? 'text-text-muted group-hover:text-text-primary transition-colors' : 'text-text-muted'} ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] flex flex-col gap-0.5 p-1.5 bg-card-bg/80 backdrop-blur-[32px] border border-border-secondary rounded-xl shadow-2xl animate-context-menu"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            minWidth: dropdownPos.width,
            width: 'max-content',
            maxHeight: 'calc(5 * 36px + 12px)',
            overflowY: 'auto',
          }}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={[
                `w-full text-left rounded-md transition-colors duration-100 cursor-pointer select-none flex-shrink-0 flex items-center gap-1.5 ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-1.5 text-sm'}`,
                option.value === value
                  ? 'bg-hover-bg text-text-primary'
                  : 'text-text-primary hover:bg-hover-bg',
              ].join(' ')}
            >
              {option.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: option.color }}
                />
              )}
              {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
              {option.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

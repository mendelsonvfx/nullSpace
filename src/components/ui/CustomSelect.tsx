import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  compact = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={[
          'w-full flex items-center justify-between gap-2 px-3',
          compact ? 'py-[7px] text-xs' : 'py-2 min-h-[38px] text-sm',
          'bg-sidebar-bg border rounded-lg transition-colors duration-150 select-none',
          isOpen
            ? 'border-border-hover'
            : compact
              ? 'border-border-primary hover:border-border-hover group'
              : 'border-border-primary hover:border-border-secondary',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className={
          selectedOption && !compact
            ? 'text-text-primary'
            : compact
              ? 'text-text-muted group-hover:text-text-primary transition-colors duration-150'
              : 'text-text-muted'
        }>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${compact ? 'text-text-muted group-hover:text-text-primary transition-colors' : 'text-text-muted'} ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-[200] flex flex-col gap-0.5 p-1.5 bg-card-bg backdrop-blur-[32px] border border-border-secondary rounded-lg shadow-2xl animate-dropdown">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={[
                'w-full px-3 py-1.5 text-left text-sm rounded-md transition-colors duration-100 cursor-pointer select-none',
                option.value === value
                  ? 'bg-hover-bg text-text-primary'
                  : 'text-text-primary hover:bg-hover-bg',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

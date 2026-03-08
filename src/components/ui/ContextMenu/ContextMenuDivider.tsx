import { ContextMenuDividerProps } from './types';

export function ContextMenuDivider({ className = '' }: ContextMenuDividerProps) {
  return <div className={`border-t border-border-secondary my-1.5 mx-1 ${className}`} />;
}

import { ContextMenuDividerProps } from './types';

export function ContextMenuDivider({ className = '' }: ContextMenuDividerProps) {
  return <div className={`border-t border-white/10 my-1.5 mx-1 ${className}`} />;
}

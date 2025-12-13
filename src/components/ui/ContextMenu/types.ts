import { ReactNode } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  isOpen: boolean;
  position: Position;
  onClose: () => void;
  children: ReactNode;
  menuId?: string;
  className?: string;
  onMenuRect?: (rect: DOMRect) => void;
}

export interface ContextMenuItemProps {
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  children: ReactNode;
  className?: string;
}

export interface ContextMenuDividerProps {
  className?: string;
}

export interface ContextMenuSubmenuProps {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export interface ContextMenuColorPickerProps {
  colors: Array<{ name: string; value: string; className?: string }>;
  selectedColor?: string | null;
  onSelect: (color: string) => void;
  onClear?: () => void;
  label?: string;
}

export interface UseContextMenuReturn<T = unknown> {
  isOpen: boolean;
  position: Position;
  data: T | null;
  openMenu: (e: React.MouseEvent, data: T) => void;
  closeMenu: () => void;
}

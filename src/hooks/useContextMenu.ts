import { useState, useCallback } from 'react';
import { Position, UseContextMenuReturn } from '../components/ui/ContextMenu/types';

export function useContextMenu<T = unknown>(): UseContextMenuReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [data, setData] = useState<T | null>(null);

  const openMenu = useCallback((e: React.MouseEvent, menuData: T) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setData(menuData);
    setIsOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  return {
    isOpen,
    position,
    data,
    openMenu,
    closeMenu
  };
}

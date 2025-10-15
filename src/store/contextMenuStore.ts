import { create } from 'zustand';

interface ContextMenuState {
  activeMenu: string | null;
  setActiveMenu: (menuId: string | null) => void;
  closeAllMenus: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  activeMenu: null,
  setActiveMenu: (menuId) => set({ activeMenu: menuId }),
  closeAllMenus: () => set({ activeMenu: null }),
}));

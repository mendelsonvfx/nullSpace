import { IconPlus, IconTrash, IconPencil } from '@tabler/icons-react';
import { useState, useEffect, useRef } from 'react';
import { AddCategoryModal } from './modals/AddCategoryModal';
import { RenameCategoryModal } from './modals/RenameCategoryModal';
import SimpleBar from 'simplebar-react';

interface CategoryTabsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onAddCategory?: (name: string) => void;
  onDeleteCategory?: (categoryName: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  accentColor?: string;
}

export function CategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
  accentColor = '#a855f7'
}: CategoryTabsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; category: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showScrollShadow, setShowScrollShadow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  // Check if content is scrollable and update shadow
  const checkScrollable = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const canScrollDown = scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 5;
      setShowScrollShadow(canScrollDown);
    }
  };

  useEffect(() => {
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => window.removeEventListener('resize', checkScrollable);
  }, [categories]);

  const handleScroll = () => {
    checkScrollable();
  };

  const handleContextMenu = (e: React.MouseEvent, category: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't show context menu for default categories
    const defaultCategories = ['Commercial', 'Personal'];
    if (defaultCategories.includes(category)) {
      return;
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      category
    });
  };

  const handleRename = () => {
    if (contextMenu) {
      setEditingCategory(contextMenu.category);
      setContextMenu(null);
    }
  };

  const handleDelete = () => {
    if (contextMenu && onDeleteCategory) {
      onDeleteCategory(contextMenu.category);
      setContextMenu(null);
    }
  };

  // Darken color by 40% for active tab
  const darkenColor = (color: string, percent: number): string => {
    // Parse RGB or Hex color
    let r: number, g: number, b: number;

    if (color.startsWith('rgb')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      } else {
        return color;
      }
    } else {
      const hex = color.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    const factor = 1 - (percent / 100);
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  const activeColor = darkenColor(accentColor, 40);

  return (
    <div className="flex flex-col h-full bg-sidebar-bg border-r border-border-primary relative" style={{ width: '40px' }}>
      {/* Scrollable categories container */}
      <SimpleBar
        scrollableNodeProps={{
          ref: scrollContainerRef,
          onScroll: handleScroll
        }}
        className="flex-1 category-tabs-scrollbar"
        autoHide={true}
        style={{ maxHeight: '100%', paddingBottom: onAddCategory ? '93px' : '0' }}
      >
        {categories.map((category) => (
          <div key={category} className="relative group">
            <button
              onClick={() => onSelectCategory(category)}
              onContextMenu={(e) => handleContextMenu(e, category)}
              className="w-full h-32 flex items-center justify-center relative overflow-hidden transition-all duration-200 hover:bg-hover-bg"
              title={category}
            >
              {/* Полоса слева для активной категории */}
              {selectedCategory === category && (
                <div
                  className="absolute left-0 top-0 bottom-0 transition-all duration-200"
                  style={{
                    width: '3px',
                    backgroundColor: activeColor
                  }}
                />
              )}
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-medium tracking-wide transition-colors"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transform: 'rotate(180deg)',
                  color: selectedCategory === category ? '#e4e4e7' : '#71717a'
                }}
              >
                {category}
              </span>
            </button>
          </div>
        ))}
      </SimpleBar>

      {/* Add category button */}
      {onAddCategory && (
        <div className="absolute bottom-0 left-0 right-0 z-50">
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center bg-sidebar-bg hover:bg-hover-bg transition-colors duration-200 border-t border-border-primary"
            style={{ height: '93px' }}
            title="Add category"
          >
            <IconPlus stroke={1.5} className="w-3.5 h-3.5 text-text-muted" />
          </button>
        </div>
      )}

      {/* Bottom scroll shadow - над кнопкой */}
      {showScrollShadow && (
        <div
          className="absolute left-0 right-0 pointer-events-none transition-opacity duration-300"
          style={{
            bottom: onAddCategory ? '93px' : '0',
            height: '60px',
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent)',
            zIndex: 10
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-card-bg border border-border-secondary rounded-lg shadow-lg py-1 z-[100] min-w-[180px] animate-context-menu"
          style={{
            top: contextMenu.y,
            left: contextMenu.x
          }}
        >
          <button
            onClick={handleRename}
            className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover-bg transition-colors flex items-center gap-2"
          >
            <IconPencil stroke={1.5} className="w-4 h-4" />
            Rename
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
          >
            <IconTrash stroke={1.5} className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Rename Modal */}
      <RenameCategoryModal
        isOpen={!!editingCategory}
        categoryName={editingCategory || ''}
        onClose={() => setEditingCategory(null)}
        onRename={onRenameCategory || (() => {})}
      />

      {/* Add Category Modal */}
      <AddCategoryModal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onAdd={onAddCategory || (() => {})}
      />
    </div>
  );
}

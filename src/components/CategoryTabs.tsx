import { Plus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface CategoryTabsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onAddCategory?: (name: string) => void;
  accentColor?: string;
}

export function CategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  accentColor = '#a855f7'
}: CategoryTabsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddCategory = () => {
    if (newCategoryName.trim() && onAddCategory) {
      onAddCategory(newCategoryName.trim());
      setNewCategoryName('');
      setIsAdding(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!isAdding) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsAdding(false);
        setNewCategoryName('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAdding]);

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
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800" style={{ width: '40px' }}>
      {categories.map((category) => (
        <div key={category} className="relative group">
          <button
            onClick={() => onSelectCategory(category)}
            className="w-full h-32 flex items-center justify-center relative overflow-hidden transition-all duration-200 hover:bg-zinc-800/50"
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
              className="absolute inset-0 flex items-center justify-center text-xs font-medium tracking-wide"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                color: selectedCategory === category ? '#ffffff' : '#71717a'
              }}
            >
              {category}
            </span>
          </button>
        </div>
      ))}

      {/* Add category button */}
      {onAddCategory && (
        <div className="mt-auto">
          {isAdding ? (
            <div className="p-1">
              <input
                ref={inputRef}
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') {
                    setIsAdding(false);
                    setNewCategoryName('');
                  }
                }}
                autoFocus
                className="w-full h-24 text-xs p-1 bg-zinc-800 border border-zinc-700 rounded text-white"
                placeholder="New..."
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transform: 'rotate(180deg)'
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors duration-200 border-t border-zinc-800"
              style={{ height: '73px' }}
              title="Add category"
            >
              <Plus size={14} className="text-zinc-500" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { ContextMenuColorPickerProps } from './types';

export function ContextMenuColorPicker({
  colors,
  selectedColor,
  onSelect,
  onClear,
  label = 'Mark Color'
}: ContextMenuColorPickerProps) {
  return (
    <div className="px-3 py-2">
      {label && (
        <div className="text-[10px] text-text-muted mb-2 opacity-70">{label}</div>
      )}
      <div className="flex gap-2 flex-wrap">
        {colors.map((color) => (
          <button
            key={color.name}
            onClick={() => onSelect(color.value)}
            className={`
              w-5 h-5 rounded-full transition-all
              ${color.className || ''}
              ${selectedColor === color.value ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-800' : 'hover:ring-2 hover:ring-white/40'}
            `}
            style={!color.className ? { backgroundColor: color.value } : undefined}
            title={color.name}
          />
        ))}
        {onClear && (
          <button
            onClick={onClear}
            className="w-5 h-5 rounded-full border-2 border-zinc-500 hover:bg-white/10 transition-all"
            title="Clear"
          />
        )}
      </div>
    </div>
  );
}

// Predefined color sets for common use cases
export const VERSION_MARK_COLORS = [
  { name: 'red', value: 'red', className: 'bg-red-500' },
  { name: 'green', value: 'green', className: 'bg-green-500' },
  { name: 'blue', value: 'blue', className: 'bg-blue-500' }
];

export const FOLDER_COLORS = [
  { name: 'Red', value: 'red', className: 'bg-red-500' },
  { name: 'Blue', value: 'blue', className: 'bg-blue-500' },
  { name: 'Green', value: 'green', className: 'bg-green-500' },
  { name: 'Yellow', value: 'yellow', className: 'bg-yellow-500' },
  { name: 'Purple', value: 'purple', className: 'bg-purple-500' },
  { name: 'Pink', value: 'pink', className: 'bg-pink-500' }
];

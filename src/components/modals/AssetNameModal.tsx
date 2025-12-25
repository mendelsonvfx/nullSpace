import { useState, useEffect } from 'react';
import { useModalBlur } from '../../hooks/useModalBlur';
import { AlertCircle } from 'lucide-react';

interface AssetNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (assetName: string) => void;
  softwareName: string;
  projectName: string;
}

// Validate asset name - only letters and numbers allowed
const isValidAssetName = (name: string) => /^[a-zA-Z0-9]*$/.test(name);

export function AssetNameModal({ isOpen, onClose, onConfirm, softwareName, projectName }: AssetNameModalProps) {
  const [assetName, setAssetName] = useState('');
  const [hasError, setHasError] = useState(false);
  const blurClass = useModalBlur();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAssetName('');
      setHasError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAssetName(value);
    setHasError(!isValidAssetName(value));
  };

  const handleConfirm = () => {
    if (hasError) return;
    // Use "01" as default if empty, otherwise uppercase the input
    const finalName = assetName.trim() === '' ? '01' : assetName.toUpperCase();
    onConfirm(finalName);
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
      onClose();
    }
    delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
  };

  // Preview file name
  const previewName = assetName.trim() === ''
    ? '01'
    : assetName.toUpperCase();
  const projectBase = projectName.replace(/\s+/g, '').toUpperCase();

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <h3 className="text-lg font-semibold mb-1">Create {softwareName} Asset</h3>
        <p className="text-zinc-400 text-sm mb-4">Enter a name for the asset</p>

        {/* Input with validation */}
        <div className="relative mb-1">
          <input
            type="text"
            value={assetName}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !hasError) handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="01"
            className={`w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 pr-9 transition-colors ${
              hasError
                ? 'border-2 border-red-500 focus:ring-red-500'
                : 'border border-zinc-700 focus:ring-accent focus:border-transparent'
            }`}
            autoFocus
          />
          {hasError && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
          )}
        </div>

        {/* Helper text - always visible */}
        <p className={`text-xs mb-3 ${hasError ? 'text-red-400' : 'text-zinc-500'}`}>
          Only letters and numbers allowed
        </p>

        {/* Preview */}
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-4">
          <p className="text-xs text-zinc-500 mb-1">Preview:</p>
          <p className="text-sm font-mono text-zinc-300">
            {projectBase}_ASSET_{previewName}_v001
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasError}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-sm animate-button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useModalBlur } from '../../hooks/useModalBlur';
import { AlertCircle } from 'lucide-react';
import { SoftwareIcon } from '../SoftwareIcon';

interface AssetNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (assetName: string, software?: any) => void;
  softwareName?: string;
  softwareList?: any[];
  projectName: string;
  mode?: 'create' | 'rename';
  initialName?: string;
}

// Validate asset name - only letters, numbers and spaces allowed
const isValidAssetName = (name: string) => /^[a-zA-Z0-9 ]*$/.test(name);

export function AssetNameModal({ isOpen, onClose, onConfirm, softwareName, softwareList, projectName, mode = 'create', initialName }: AssetNameModalProps) {
  const [assetName, setAssetName] = useState('');
  const [hasError, setHasError] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<any>(null);
  const blurClass = useModalBlur();

  const isRename = mode === 'rename';
  const hasSoftwareList = !isRename && softwareList && softwareList.length > 0;
  const activeSoftwareName = selectedSoftware?.displayName ?? selectedSoftware?.name ?? softwareName ?? '';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAssetName(isRename ? (initialName ?? '') : '');
      setHasError(false);
      setSelectedSoftware(hasSoftwareList ? softwareList![0] : null);
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
    if (hasSoftwareList && !selectedSoftware) return;
    const finalName = assetName.trim() === '' ? '01' : assetName.trim().replace(/\s+/g, '').toUpperCase();
    onConfirm(finalName, hasSoftwareList ? selectedSoftware : undefined);
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

  const previewName = assetName.trim() === '' ? '01' : assetName.trim().replace(/\s+/g, '').toUpperCase();
  const projectBase = projectName.replace(/\s+/g, '').toUpperCase();

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card-bg border border-border-secondary rounded-card p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <h3 className="text-lg font-semibold mb-1">
          {isRename ? 'Rename Asset' : `Create ${activeSoftwareName ? `${activeSoftwareName} ` : ''}Asset`}
        </h3>
        <p className="text-text-muted text-sm mb-4">
          {isRename ? 'Enter a new name for the asset' : 'Enter a name for the asset'}
        </p>

        {/* Software selector — only for create mode */}
        {hasSoftwareList && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {softwareList!.map((sw: any) => (
              <button
                key={sw.name}
                onClick={() => setSelectedSoftware(sw)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-button text-xs border transition-colors ${
                  selectedSoftware?.name === sw.name
                    ? 'bg-hover-bg border-border-hover text-text-primary'
                    : 'bg-sidebar-bg border-border-primary text-text-muted hover:bg-hover-bg hover:text-text-primary'
                }`}
              >
                <SoftwareIcon name={sw.name} className="w-3.5 h-3.5" />
                {sw.displayName ?? sw.name}
              </button>
            ))}
          </div>
        )}

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
            placeholder="Name 01"
            className={`w-full bg-sidebar-bg rounded-button px-3 py-2 text-sm focus:outline-none pr-9 transition-colors ${
              hasError
                ? 'border border-red-500'
                : 'border border-border-primary focus:border-accent'
            }`}
            autoFocus
          />
          {hasError && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
          )}
        </div>

        {/* Helper text - always visible */}
        <p className={`text-xs mb-3 ${hasError ? 'text-red-400' : 'text-text-muted'}`}>
          Only letters, numbers allowed
        </p>

        {/* Preview */}
        <div className="bg-sidebar-bg/50 rounded-button px-3 py-2 mb-4">
          <p className="text-xs text-text-muted mb-1">Preview:</p>
          <p className="text-sm font-mono text-text-primary">
            {projectBase}_ASSET_{previewName}_v001
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasError}
            className="px-3 py-1.5 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors font-medium text-sm text-white animate-button"
          >
            {isRename ? 'Rename' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

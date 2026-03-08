import React from 'react';

interface RenameSceneConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sceneName: string;
  fileCount: {
    versionFiles: number;
    thumbnails: number;
  };
  isRenaming?: boolean;
  progress?: { current: number; total: number } | null;
  isShot?: boolean; // Flag to indicate if this is a shot rename
}

export const RenameSceneConfirmModal: React.FC<RenameSceneConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  sceneName,
  fileCount,
  isRenaming = false,
  progress = null,
  isShot = false
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
  };

  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  // Handle Enter key press
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isRenaming) {
        handleConfirm();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isRenaming]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-orange-600 rounded-card p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">Confirm {isShot ? 'Shot' : 'Scene'} Rename</h3>
        <p className="text-text-muted mb-4">
          Renaming {isShot ? 'shot' : 'scene'} <span className="font-semibold text-white">"{sceneName}"</span> will affect:
        </p>
        <ul className="list-disc pl-6 mb-6 text-zinc-400 space-y-1">
          <li>{fileCount.versionFiles} version files</li>
          <li>All folder structures</li>
        </ul>
        {/* Progress bar - shown when renaming */}
        {isRenaming && progress && (
          <div className="mb-4">
            <div className="w-full bg-border-secondary rounded-full h-2 mb-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-sm text-text-muted text-center">
              Renaming files... {progress.current} / {progress.total} ({percentage}%)
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-between items-center">
          {!isRenaming && (
            <p className="text-orange-400 text-sm">
              This operation cannot be undone.
            </p>
          )}
          {isRenaming && <div />}
          <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isRenaming}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors animate-button disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRenaming ? 'Please wait...' : 'Cancel'}
          </button>
          {!isRenaming && (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors font-medium animate-button"
            >
              Rename
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

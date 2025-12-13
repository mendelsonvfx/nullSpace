import React from 'react';

interface RenameProgressOverlayProps {
  current: number;
  total: number;
}

export const RenameProgressOverlay: React.FC<RenameProgressOverlayProps> = ({
  current,
  total
}) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl min-w-[300px]">
        <h3 className="text-lg font-bold mb-4 text-white">Renaming Files...</h3>
        <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-sm text-gray-400 text-center">
          {current} / {total} files ({percentage}%)
        </p>
        <p className="text-xs text-yellow-400 mt-4 text-center">
          Please do not close the application
        </p>
      </div>
    </div>
  );
};

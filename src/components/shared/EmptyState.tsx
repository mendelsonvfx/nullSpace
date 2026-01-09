import { memo } from 'react';
import { IconPlus, IconFolder } from '@tabler/icons-react';

interface EmptyStateProps {
  onCreateProject: () => void;
}

export const EmptyState = memo(function EmptyState({ onCreateProject }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
      <div className="w-24 h-24 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
        <IconFolder className="w-12 h-12 text-zinc-700" stroke={1.5} />
      </div>
      <h2 className="text-xl font-medium text-white mb-2">No Project Selected</h2>
      <p className="text-sm mb-6">Select a project from the sidebar or create a new one</p>
      <button
        onClick={onCreateProject}
        className="border border-accent px-6 py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-white animate-button"
        style={{
          background: 'linear-gradient(135deg, var(--accent-color) 0%, var(--accent-color-hover) 100%)',
          backgroundSize: '200% 200%',
          backgroundPosition: '0% 50%',
          transition: 'background-position 0.5s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundPosition = '100% 50%';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundPosition = '0% 50%';
        }}
      >
        <IconPlus stroke={1.5} className="w-5 h-5" />
        Create New Project
      </button>
    </div>
  );
});

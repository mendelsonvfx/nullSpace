import { memo } from 'react';
import { Plus, Folder } from 'lucide-react';

interface EmptyStateProps {
  onCreateProject: () => void;
}

export const EmptyState = memo(function EmptyState({ onCreateProject }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
      <div className="w-24 h-24 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
        <Folder className="w-12 h-12 text-zinc-700" />
      </div>
      <h2 className="text-xl font-medium text-white mb-2">No Project Selected</h2>
      <p className="text-sm mb-6">Select a project from the sidebar or create a new one</p>
      <button
        onClick={onCreateProject}
        className="bg-accent hover:bg-accent-hover px-6 py-3 rounded-lg flex items-center gap-2 transition-colors font-medium text-white animate-button"
      >
        <Plus className="w-5 h-5" />
        Create New Project
      </button>
    </div>
  );
});

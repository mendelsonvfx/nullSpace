import { useState, useCallback, memo } from 'react';
import { X, Check, Pencil, Link as LinkIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from '../../store/projectStore';

interface LinkItemProps {
  link: {
    id: string;
    url: string;
    title: string;
  };
  projectId: string;
  shotId?: string | null;
}

export const LinkItem = memo(function LinkItem({ link, projectId, shotId }: LinkItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(link.title);

  const handleSave = useCallback(() => {
    if (editedTitle.trim()) {
      if (shotId) {
        const { updateShotLink } = useProjectStore.getState();
        updateShotLink(projectId, shotId, link.id, editedTitle.trim());
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, link.id, editedTitle.trim());
      }
      setIsEditing(false);
    }
  }, [editedTitle, shotId, projectId, link.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditedTitle(link.title);
      setIsEditing(false);
    }
  }, [handleSave, link.title]);

  const handleOpenUrl = useCallback(async () => {
    try {
      await invoke('open_url', { url: link.url });
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  }, [link.url]);

  const handleRemove = useCallback(() => {
    if (shotId) {
      const { removeShotLink } = useProjectStore.getState();
      removeShotLink(projectId, shotId, link.id);
    } else {
      const { removeLink } = useProjectStore.getState();
      removeLink(projectId, link.id);
    }
  }, [shotId, projectId, link.id]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
        <LinkIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <input
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          className="flex-1 bg-transparent text-sm text-zinc-300 focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="p-1 hover:bg-zinc-700 rounded transition-colors"
        >
          <Check className="w-3 h-3 text-green-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group bg-zinc-900 hover:bg-zinc-800 rounded-lg px-3 py-2 transition-colors">
      <button
        onClick={handleOpenUrl}
        className="flex items-center gap-2 flex-1 text-left"
        title={link.url}
      >
        <LinkIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <span className="text-sm text-zinc-300 truncate">{link.title}</span>
      </button>
      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
        title="Edit title"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        onClick={handleRemove}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
        title="Remove link"
      >
        <X className="w-3 h-3 close-button-red" />
      </button>
    </div>
  );
});

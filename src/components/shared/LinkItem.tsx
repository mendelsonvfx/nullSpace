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
  sceneId?: string | null;
  specialContextId?: string | null;
}

export const LinkItem = memo(function LinkItem({ link, projectId, shotId, sceneId, specialContextId }: LinkItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(link.title);
  const [faviconError, setFaviconError] = useState(false);

  // Extract domain from URL for favicon
  const getFaviconUrl = useCallback((url: string) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch {
      return null;
    }
  }, []);

  const faviconUrl = getFaviconUrl(link.url);

  const handleSave = useCallback(() => {
    if (editedTitle.trim()) {
      if (shotId) {
        const { updateShotLink } = useProjectStore.getState();
        updateShotLink(projectId, shotId, link.id, editedTitle.trim());
      } else if (specialContextId) {
        const { updateSpecialContextLink } = useProjectStore.getState();
        updateSpecialContextLink(projectId, specialContextId, link.id, editedTitle.trim());
      } else if (sceneId) {
        const { updateSceneLink } = useProjectStore.getState();
        updateSceneLink(projectId, sceneId, link.id, editedTitle.trim());
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, link.id, editedTitle.trim());
      }
      setIsEditing(false);
    }
  }, [editedTitle, shotId, specialContextId, sceneId, projectId, link.id]);

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

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (shotId) {
      const { removeShotLink } = useProjectStore.getState();
      removeShotLink(projectId, shotId, link.id);
    } else if (specialContextId) {
      const { removeSpecialContextLink } = useProjectStore.getState();
      removeSpecialContextLink(projectId, specialContextId, link.id);
    } else if (sceneId) {
      const { removeSceneLink } = useProjectStore.getState();
      removeSceneLink(projectId, sceneId, link.id);
    } else {
      const { removeLink } = useProjectStore.getState();
      removeLink(projectId, link.id);
    }
  }, [shotId, specialContextId, sceneId, projectId, link.id]);

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-button border border-zinc-600 transition-all">
        <div className="w-4 h-4 flex-shrink-0 overflow-hidden">
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-4 h-4 object-contain"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <LinkIcon className="w-4 h-4 text-text-muted" />
          )}
        </div>
        <input
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="p-1 hover:bg-hover-bg rounded transition-colors"
        >
          <Check className="w-3.5 h-3.5 text-green-500" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleOpenUrl}
      title={link.url}
      className="flex items-center gap-2.5 px-3 py-2 bg-[#0f0f0f] border border-border-primary rounded-button group hover:bg-hover-bg hover:border-border-secondary transition-all cursor-pointer"
    >
      <div className="w-4 h-4 flex-shrink-0 overflow-hidden">
        {faviconUrl && !faviconError ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 object-contain"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <LinkIcon className="w-4 h-4 text-text-muted" />
        )}
      </div>
      <span className="text-sm text-text-primary truncate flex-1">{link.title}</span>
      <button
        onClick={handleEditClick}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-hover-bg rounded transition-opacity"
        title="Edit title"
      >
        <Pencil className="w-3.5 h-3.5 text-text-muted" />
      </button>
      <button
        onClick={handleRemove}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-hover-bg rounded transition-opacity"
        title="Remove link"
      >
        <X className="w-3.5 h-3.5 text-text-muted" />
      </button>
    </div>
  );
});

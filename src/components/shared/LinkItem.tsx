import { useState, useCallback, useEffect, memo } from 'react';
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

type FaviconState = { url: string | null; fallbackUrl: string | null; loaded: boolean; error: boolean };

// Persists for the app session — avoids re-fetching favicons on component remount.
// string = URL that successfully loaded, null = both DDG and direct favicon.ico failed.
const faviconCache = new Map<string, string | null>();

function computeFaviconState(linkUrl: string): FaviconState {
  try {
    const { hostname, protocol, origin } = new URL(linkUrl);
    if (!protocol.startsWith('http') || !hostname)
      return { url: null, fallbackUrl: null, loaded: false, error: false };
    const isLocal = hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (isLocal)
      return { url: `${origin}/favicon.ico`, fallbackUrl: null, loaded: false, error: false };
    return {
      url: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
      fallbackUrl: `${origin}/favicon.ico`,
      loaded: false,
      error: false,
    };
  } catch {
    return { url: null, fallbackUrl: null, loaded: false, error: false };
  }
}

function getFaviconState(linkUrl: string): FaviconState {
  try {
    const { hostname } = new URL(linkUrl);
    if (faviconCache.has(hostname)) {
      const cached = faviconCache.get(hostname)!;
      return cached
        ? { url: cached, fallbackUrl: null, loaded: true, error: false }
        : { url: null, fallbackUrl: null, loaded: false, error: true };
    }
  } catch {}
  return computeFaviconState(linkUrl);
}

export const LinkItem = memo(function LinkItem({ link, projectId, shotId, sceneId, specialContextId }: LinkItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(link.title);
  const [favicon, setFavicon] = useState<FaviconState>(() => getFaviconState(link.url));

  useEffect(() => {
    setFavicon(getFaviconState(link.url));
  }, [link.url]);

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

  const handleFaviconLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      const { hostname } = new URL(link.url);
      faviconCache.set(hostname, e.currentTarget.src);
    } catch {}
    setFavicon(f => ({ ...f, loaded: true }));
  }, [link.url]);

  const handleFaviconError = useCallback(() => {
    setFavicon(f => {
      if (f.fallbackUrl && f.url !== f.fallbackUrl) {
        return { ...f, url: f.fallbackUrl };
      }
      try {
        const { hostname } = new URL(link.url);
        faviconCache.set(hostname, null);
      } catch {}
      return { ...f, error: true };
    });
  }, [link.url]);

  const faviconImg = (
    <div className="w-4 h-4 flex-shrink-0 overflow-hidden">
      {favicon.url && (
        <img
          src={favicon.url}
          alt=""
          className={favicon.loaded && !favicon.error ? 'w-4 h-4 object-contain' : 'hidden'}
          onLoad={handleFaviconLoad}
          onError={handleFaviconError}
        />
      )}
      {(favicon.error || !favicon.url) && (
        <LinkIcon className="w-4 h-4 text-text-muted" />
      )}
    </div>
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-button border border-zinc-600 transition-all">
        {faviconImg}
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
      {faviconImg}
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

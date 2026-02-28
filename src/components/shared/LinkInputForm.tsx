import { useState, useRef, useEffect, useCallback, memo } from 'react';

import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from '../../store/projectStore';

interface LinkInputFormProps {
  projectId: string;
  shotId?: string | null;
  sceneId?: string | null;
  specialContextId?: string | null;
}

export const LinkInputForm = memo(function LinkInputForm({ projectId, shotId, sceneId, specialContextId }: LinkInputFormProps) {
  const [url, setUrl] = useState('');
  const lastProcessedClipboard = useRef('');
  const [isHovered, setIsHovered] = useState(false);

  const extractDomainName = useCallback((urlString: string): string => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname;
    } catch {
      return urlString;
    }
  }, []);

  const addLinkAndFetchTitle = useCallback(async (finalUrl: string) => {
    const tempTitle = extractDomainName(finalUrl);
    let linkId: string;

    if (shotId) {
      const { addShotLink } = useProjectStore.getState();
      linkId = addShotLink(projectId, shotId, finalUrl, tempTitle);
    } else if (specialContextId) {
      const { addSpecialContextLink } = useProjectStore.getState();
      linkId = addSpecialContextLink(projectId, specialContextId, finalUrl, tempTitle);
    } else if (sceneId) {
      const { addSceneLink } = useProjectStore.getState();
      linkId = addSceneLink(projectId, sceneId, finalUrl, tempTitle);
    } else {
      const { addLink } = useProjectStore.getState();
      linkId = addLink(projectId, finalUrl, tempTitle);
    }

    // Fetch real title in background and update
    try {
      const fetchedTitle = await invoke<string>('fetch_page_title', { url: finalUrl });

      if (shotId) {
        const { updateShotLink } = useProjectStore.getState();
        updateShotLink(projectId, shotId, linkId, fetchedTitle);
      } else if (specialContextId) {
        const { updateSpecialContextLink } = useProjectStore.getState();
        updateSpecialContextLink(projectId, specialContextId, linkId, fetchedTitle);
      } else if (sceneId) {
        const { updateSceneLink } = useProjectStore.getState();
        updateSceneLink(projectId, sceneId, linkId, fetchedTitle);
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, linkId, fetchedTitle);
      }
    } catch (error) {
      console.error('Failed to fetch page title:', error);
    }

    return linkId;
  }, [extractDomainName, shotId, specialContextId, sceneId, projectId]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (e.target.value === '') {
      lastProcessedClipboard.current = '';
    }
  }, []);

  const handleAddLink = useCallback(async () => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl || (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://'))) {
      return;
    }

    await addLinkAndFetchTitle(trimmedUrl);

    // Clear input and reset clipboard tracking
    setUrl('');
    lastProcessedClipboard.current = '';
  }, [url, addLinkAndFetchTitle]);

  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      // Check if Ctrl+V (or Cmd+V on Mac) is pressed while hovering
      // Use e.code to work regardless of keyboard layout
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && isHovered && url === '') {
        e.preventDefault();

        try {
          const clipboardText = await navigator.clipboard.readText();
          const trimmedText = clipboardText.trim();

          // Check if clipboard contains a valid URL
          if (trimmedText.startsWith('https://') ||
            trimmedText.startsWith('http://') ||
            trimmedText.startsWith('www.')) {

            // Prepare the final URL
            const finalUrl = trimmedText.startsWith('www.') ? `https://${trimmedText}` : trimmedText;

            // Automatically add the link
            await addLinkAndFetchTitle(finalUrl);
            lastProcessedClipboard.current = trimmedText;
          }
        } catch (error) {
          console.error('Could not read clipboard:', error);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isHovered, url, addLinkAndFetchTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddLink();
    }
  }, [handleAddLink]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text').trim();

    // Check if pasted text is a valid URL
    if (!pastedText.startsWith('https://') &&
      !pastedText.startsWith('http://') &&
      !pastedText.startsWith('www.')) {
      e.preventDefault(); // Don't paste if not a URL
      return;
    }

    // Allow default paste behavior for valid URLs
  }, []);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        type="url"
        placeholder="+ Paste URL..."
        value={url}
        onChange={handleUrlChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="w-full px-3 py-2 bg-transparent border border-border-secondary border-dashed rounded-card text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:border-solid transition-all"
      />
    </div>
  );
});

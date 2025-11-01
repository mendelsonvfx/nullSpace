import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Plus } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from '../../store/projectStore';

interface LinkInputFormProps {
  projectId: string;
  shotId?: string | null;
}

export const LinkInputForm = memo(function LinkInputForm({ projectId, shotId }: LinkInputFormProps) {
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
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, linkId, fetchedTitle);
      }
    } catch (error) {
      console.error('Failed to fetch page title:', error);
    }

    return linkId;
  }, [extractDomainName, shotId, projectId]);

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
    <div className="flex gap-2">
      <input
        type="url"
        placeholder="Paste URL..."
        value={url}
        onChange={handleUrlChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex-1 px-3 py-2 bg-transparent border border-zinc-700 border-dashed rounded-lg text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid"
      />
      <button
        onClick={handleAddLink}
        disabled={!url.trim()}
        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Add Link"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
});

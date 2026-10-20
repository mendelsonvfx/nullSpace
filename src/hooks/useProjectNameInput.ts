import { useState, useRef, useEffect } from 'react';
import { isAllowedProjectNameChar, isValidProjectName, stripInvalidProjectNameChars } from '../utils/fileNaming';

/**
 * Restricts a project name input to allowed characters.
 * Rejected input is dropped and `rejected` flips on for a moment so the field can show a hint.
 */
export function useProjectNameInput() {
  const [rejected, setRejected] = useState(false);
  const timerRef = useRef<number | null>(null);

  const flagRejected = () => {
    setRejected(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setRejected(false), 2500);
  };

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // Typing: block the key so the caret doesn't jump
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // shortcuts (Ctrl+V, Ctrl+A...) pass through
    if (e.key.length !== 1) return;                 // Backspace, arrows, Enter, IME 'Process'...
    if (!isAllowedProjectNameChar(e.key)) {
      e.preventDefault();
      flagRejected();
    }
  };

  // Paste / drop / IME commit: strip
  const sanitize = (raw: string) => {
    if (isValidProjectName(raw)) return raw;
    flagRejected();
    return stripInvalidProjectNameChars(raw);
  };

  return { onKeyDown, sanitize, rejected };
}

import { useState, useRef, useEffect } from 'react';
import type React from 'react';

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * Local draft for a text/number field that is saved once, when editing ends — not on every keystroke.
 * Commits on blur and Enter (inputs only), and when the field unmounts or `resetKey` changes
 * (e.g. a modal closed with Esc, or another project selected) with the draft still unsaved.
 * While the field isn't focused, the draft follows `value` from the store.
 */
export function useDraftField(value: string, commit: (draft: string) => void, resetKey?: unknown) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const dirty = useRef(false);
  const focused = useRef(false);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const setBoth = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  // Follow the store while not editing
  useEffect(() => {
    if (!focused.current) setBoth(value);
  }, [value]);

  // New key (or unmount): save the pending draft with the commit of the key it was typed for
  useEffect(() => {
    const commitForKey = commitRef.current;
    setBoth(value);
    dirty.current = false;
    // The field may have unmounted while focused (modal closed with Esc): no blur came, so reset here
    focused.current = false;
    return () => {
      if (dirty.current) {
        dirty.current = false;
        commitForKey(draftRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const flush = () => {
    if (!dirty.current) return;
    dirty.current = false;
    commitRef.current(draftRef.current);
  };

  return {
    value: draft,
    onChange: (e: React.ChangeEvent<FieldElement>) => {
      setBoth(e.target.value);
      dirty.current = e.target.value !== value;
    },
    onFocus: () => { focused.current = true; },
    onBlur: () => {
      focused.current = false;
      flush();
    },
    onKeyDown: (e: React.KeyboardEvent<FieldElement>) => {
      if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) e.currentTarget.blur();
    },
  };
}

/** Number field value for useDraftField: '' for no value, '0' stays visible */
export const numberDraft = (n: number | undefined | null) => (n == null ? '' : String(n));

/** Parse a number draft: empty or invalid → undefined */
export const parseNumberDraft = (draft: string): number | undefined => {
  const n = parseFloat(draft);
  return draft.trim() === '' || Number.isNaN(n) ? undefined : n;
};

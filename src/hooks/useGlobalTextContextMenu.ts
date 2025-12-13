import { useState, useCallback, useEffect, useRef } from 'react';

type TargetType = 'input' | 'contenteditable' | 'selection' | null;

interface TextContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  hasClipboard: boolean;
  hasText: boolean;
  isReadOnly: boolean;
  targetType: TargetType;
}

interface UseGlobalTextContextMenuReturn extends TextContextMenuState {
  closeMenu: () => void;
  handleCut: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleSelectAll: () => void;
}

export function useGlobalTextContextMenu(): UseGlobalTextContextMenuReturn {
  const [state, setState] = useState<TextContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    hasSelection: false,
    hasClipboard: false,
    hasText: false,
    isReadOnly: false,
    targetType: null,
  });

  // Store references to different target types
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const editableRef = useRef<HTMLElement | null>(null);
  const selectionTextRef = useRef<string>('');

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleCut = useCallback(() => {
    if (state.targetType === 'input' && inputRef.current) {
      const target = inputRef.current;
      if (target.readOnly || target.disabled) return;

      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;

      if (start !== end) {
        const selectedText = target.value.substring(start, end);
        navigator.clipboard.writeText(selectedText);

        const newValue = target.value.substring(0, start) + target.value.substring(end);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
          'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(target, newValue);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        target.setSelectionRange(start, start);
      }
      target.focus();
    } else if (state.targetType === 'contenteditable' && editableRef.current) {
      // Use execCommand for contenteditable
      document.execCommand('cut');
    }

    closeMenu();
  }, [state.targetType, closeMenu]);

  const handleCopy = useCallback(() => {
    if (state.targetType === 'input' && inputRef.current) {
      const target = inputRef.current;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;

      if (start !== end) {
        const selectedText = target.value.substring(start, end);
        navigator.clipboard.writeText(selectedText);
      }
      target.focus();
    } else if (state.targetType === 'contenteditable') {
      document.execCommand('copy');
    } else if (state.targetType === 'selection' && selectionTextRef.current) {
      navigator.clipboard.writeText(selectionTextRef.current);
    }

    closeMenu();
  }, [state.targetType, closeMenu]);

  const handlePaste = useCallback(async () => {
    if (state.targetType === 'input' && inputRef.current) {
      const target = inputRef.current;
      if (target.readOnly || target.disabled) return;

      try {
        const clipboardText = await navigator.clipboard.readText();
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;

        const newValue = target.value.substring(0, start) + clipboardText + target.value.substring(end);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
          'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(target, newValue);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const newCursorPos = start + clipboardText.length;
        target.setSelectionRange(newCursorPos, newCursorPos);
      } catch (err) {
        console.error('Failed to paste:', err);
      }
      target.focus();
    } else if (state.targetType === 'contenteditable' && editableRef.current) {
      // Use execCommand for contenteditable
      try {
        const clipboardText = await navigator.clipboard.readText();
        document.execCommand('insertText', false, clipboardText);
      } catch {
        document.execCommand('paste');
      }
    }

    closeMenu();
  }, [state.targetType, closeMenu]);

  const handleSelectAll = useCallback(() => {
    if (state.targetType === 'input' && inputRef.current) {
      inputRef.current.select();
      inputRef.current.focus();
    } else if (state.targetType === 'contenteditable' && editableRef.current) {
      const range = document.createRange();
      range.selectNodeContents(editableRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    closeMenu();
  }, [state.targetType, closeMenu]);

  useEffect(() => {
    const handleContextMenu = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      let targetType: TargetType = null;
      let hasSelection = false;
      let hasText = false;
      let isReadOnly = true; // Default to readonly for plain text selection

      // Check for text selection first (works everywhere)
      const windowSelection = window.getSelection();
      const selectedText = windowSelection?.toString() || '';

      // 1. Check if target is input or textarea
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        // Skip non-text input types
        if (target instanceof HTMLInputElement) {
          const skipTypes = ['checkbox', 'radio', 'submit', 'button', 'file', 'image', 'reset', 'color', 'range'];
          if (skipTypes.includes(target.type)) {
            return;
          }
        }

        targetType = 'input';
        inputRef.current = target;
        editableRef.current = null;
        selectionTextRef.current = '';

        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        hasSelection = start !== end;
        hasText = target.value.length > 0;
        isReadOnly = target.readOnly || target.disabled;
      }
      // 2. Check if target is contenteditable (or inside one)
      else if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
        const editableElement = target.isContentEditable ? target : target.closest('[contenteditable="true"]') as HTMLElement;

        targetType = 'contenteditable';
        inputRef.current = null;
        editableRef.current = editableElement;
        selectionTextRef.current = '';

        hasSelection = selectedText.length > 0;
        hasText = (editableElement?.textContent?.length ?? 0) > 0;
        isReadOnly = false;
      }
      // 3. Check if there's any text selection on the page
      else if (selectedText.length > 0) {
        targetType = 'selection';
        inputRef.current = null;
        editableRef.current = null;
        selectionTextRef.current = selectedText;

        hasSelection = true;
        hasText = true;
        isReadOnly = true; // Can only copy, not cut/paste
      }
      // No valid target
      else {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Check clipboard
      let hasClipboard = false;
      try {
        const text = await navigator.clipboard.readText();
        hasClipboard = text.length > 0;
      } catch {
        hasClipboard = false;
      }

      setState({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        hasSelection,
        hasClipboard,
        hasText,
        isReadOnly,
        targetType,
      });
    };

    const handleClick = () => {
      closeMenu();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu]);

  return {
    ...state,
    closeMenu,
    handleCut,
    handleCopy,
    handlePaste,
    handleSelectAll,
  };
}

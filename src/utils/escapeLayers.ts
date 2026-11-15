import { useLayoutEffect, useRef } from 'react';

/**
 * Escape closes only the topmost open layer (menu, dropdown, dialog).
 *
 * Every layer registers itself while open; one keydown listener on `window` in the capture phase
 * runs before any other handler (React, inputs, App's global hotkeys), so the order in which
 * components attached their own listeners no longer matters. App closes the project on Escape
 * only when the stack is empty.
 *
 * Layers are ordered by the time they opened. Two layers opened in the same render would be
 * pushed child-first; nothing in the app does that (layers open on user clicks).
 */

interface Layer {
  onEscape: { current: (() => void) | null };
}

const stack: Layer[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing || stack.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  // Holding Escape closes exactly one layer: auto-repeat events are swallowed
  if (e.repeat) return;
  stack[stack.length - 1].onEscape.current?.();
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', onKeyDown, true);
}

/**
 * Registers an Escape layer while `active`.
 * `onEscape` closes the layer; `null` makes a blocking layer that swallows Escape and closes nothing.
 */
export function useEscapeLayer(active: boolean, onEscape: (() => void) | null): void {
  const handler = useRef(onEscape);
  useLayoutEffect(() => {
    handler.current = onEscape;
  });

  useLayoutEffect(() => {
    if (!active) return;
    const layer: Layer = { onEscape: handler };
    stack.push(layer);
    listen();
    return () => {
      const i = stack.indexOf(layer);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

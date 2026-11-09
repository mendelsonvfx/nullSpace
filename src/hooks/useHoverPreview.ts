import { useCallback, useEffect, useRef, useState } from 'react';

export interface HoverAnchor {
  top: number;
  bottom: number;
  left: number;
}

/**
 * Hover preview timing, as in task attachments: shows after `delayMs` on the element under the pointer,
 * hides at once on leave, on any press (a click or the start of a file drag), on scroll and when the
 * window loses focus. The delay is a JS timer: "animations off" removes CSS delays too.
 */
export function useHoverPreview<T>(delayMs = 200) {
  const [shown, setShown] = useState<{ item: T; anchor: HoverAnchor } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const active = useRef(false); // pending or shown

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    timer.current = undefined;
    frame.current = undefined;
    if (!active.current) return;
    active.current = false;
    setVisible(false);
    setShown(null);
  }, []);

  const show = useCallback((element: Element, item: T) => {
    window.clearTimeout(timer.current);
    active.current = true;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      // Measured when it appears: the row may have moved during the delay
      if (!element.isConnected) {
        active.current = false;
        return;
      }
      const r = element.getBoundingClientRect();
      setShown({ item, anchor: { top: r.top, bottom: r.bottom, left: r.left } });
      // Mounted transparent first, then faded in
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        setVisible(true);
      });
    }, delayMs);
  }, [delayMs]);

  useEffect(() => {
    const onAnything = () => {
      if (active.current) hide();
    };
    // Capture: SimpleBar scrolls an inner element, and a row's own mousedown handlers run after this
    window.addEventListener('scroll', onAnything, true);
    window.addEventListener('mousedown', onAnything, true);
    window.addEventListener('blur', onAnything);
    return () => {
      window.removeEventListener('scroll', onAnything, true);
      window.removeEventListener('mousedown', onAnything, true);
      window.removeEventListener('blur', onAnything);
      window.clearTimeout(timer.current);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [hide]);

  return { shown, visible, show, hide };
}

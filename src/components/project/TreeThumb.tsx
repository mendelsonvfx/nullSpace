import { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useImageThumbnail } from '../../hooks/useImageThumbnail';

type Observe = (element: Element, onChange: (onScreen: boolean) => void) => () => void;

const ThumbObserverContext = createContext<Observe | null>(null);

/**
 * One IntersectionObserver for every thumbnail in the tree, rooted at the tree's scroll element:
 * thumbnails load only for rows on screen (with a 200px margin).
 */
export function ThumbObserverProvider({ root, children }: { root: Element | null; children: ReactNode }) {
  const callbacks = useRef(new Map<Element, (onScreen: boolean) => void>());
  const [observer, setObserver] = useState<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.current.get(entry.target)?.(entry.isIntersecting);
      },
      { root, rootMargin: '200px 0px' }
    );
    setObserver(io);
    return () => {
      io.disconnect();
      setObserver(null);
    };
  }, [root]);

  const observe = useCallback<Observe>((element, onChange) => {
    if (!observer) return () => {};
    callbacks.current.set(element, onChange);
    observer.observe(element);
    return () => {
      callbacks.current.delete(element);
      observer.unobserve(element);
    };
  }, [observer]);

  return <ThumbObserverContext.Provider value={observer ? observe : null}>{children}</ThumbObserverContext.Provider>;
}

interface TreeThumbProps {
  path: string;
  modified?: number;
  /** All parent folders open (rows of collapsed folders stay mounted at zero height) */
  active: boolean;
  /** The usual icon, shown until a thumbnail is ready and when there is none */
  fallback: ReactNode;
}

/** Image thumbnail in a tree row's icon slot */
export const TreeThumb = memo(
  function TreeThumb({ path, modified, active, fallback }: TreeThumbProps) {
    const observe = useContext(ThumbObserverContext);
    const ref = useRef<HTMLDivElement>(null);
    const [onScreen, setOnScreen] = useState(false);

    useEffect(() => {
      const element = ref.current;
      if (!active || !observe || !element) {
        setOnScreen(false);
        return;
      }
      return observe(element, setOnScreen);
    }, [active, observe]);

    const thumb = useImageThumbnail(path, modified, active && onScreen);

    return (
      <div ref={ref} className="w-[20px] h-[20px] -mx-px flex items-center justify-center flex-shrink-0">
        {thumb ? (
          <img
            src={thumb.data_url}
            alt=""
            draggable={false}
            className="w-[20px] h-[20px] object-cover rounded-[4px] select-none"
          />
        ) : (
          fallback
        )}
      </div>
    );
  },
  // The fallback icon is a new element on every tree render but always the same icon for a path
  (a, b) => a.path === b.path && a.modified === b.modified && a.active === b.active
);

import { useLayoutEffect, type DependencyList, type RefObject } from 'react';

// Starts partly visible: the first painted frame is the animation's start, and from 0 the list would blink empty
const KEYFRAMES: Keyframe[] = [
  { opacity: 0.3, transform: 'translateY(6px)' },
  { opacity: 1, transform: 'none' },
];
// Front-loaded curve, same as launcherItemEnter
const OPTIONS: KeyframeAnimationOptions = { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' };
const STAGGER_MS = 14;
const MAX_STEPS = 5;
const MAX_ITEMS = 10;

// The CSS kill switch (body.animations-disabled) doesn't reach the Web Animations API
const motionAllowed = () =>
  !document.body.classList.contains('animations-disabled') &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Rise-in for the visible children of `listRef` when `trigger` changes — never on re-renders,
 * reorders or inserted items. Content is shown and clickable from the first frame.
 */
export function useListEnterAnimation(
  listRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  trigger: DependencyList,
) {
  useLayoutEffect(() => {
    const list = listRef.current;
    const viewport = viewportRef.current;
    if (!enabled || !list || !viewport || !motionAllowed()) return;

    // Only what's on screen animates, so a long list costs the same as a short one
    const { top, bottom } = viewport.getBoundingClientRect();
    const animations: Animation[] = [];
    for (const el of Array.from(list.children) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      if (r.bottom < top) continue;
      if (r.top > bottom || animations.length >= MAX_ITEMS) break;
      animations.push(el.animate(KEYFRAMES, { ...OPTIONS, delay: Math.min(animations.length, MAX_STEPS) * STAGGER_MS }));
    }
    // Rapid switching: the next run starts from the final state
    return () => animations.forEach(a => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, trigger);
}

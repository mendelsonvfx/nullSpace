import type React from 'react';

/**
 * Playback line at the bottom of a scrubbable row. Its scaleX is written directly through `barRef`
 * by useScrubRow on every mouse move (never through React state or the JSX style), so rows don't re-render.
 * The row must be `relative overflow-hidden`.
 */
export function ScrubBar({ barRef }: { barRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={barRef}
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-[2px] origin-left pointer-events-none bg-accent opacity-0"
    />
  );
}

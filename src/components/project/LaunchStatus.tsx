import { useEffect, useRef, useState, type ReactNode } from 'react';

type LaunchStatus = 'idle' | 'launching' | 'success';
export type LaunchPhase = 'idle' | 'launching' | 'success' | 'running';

// How long a phase stays on screen at least: a launch that takes 50 ms still shows the run around the rim,
// and the success animation always plays to the end before the session timer takes over
const MIN_MS: Partial<Record<LaunchPhase, number>> = { launching: 450, success: 900 };
// Exit animation of the phase being replaced (matches .launch-out / .launch-fade in App.css)
const EXIT_MS = 250;

function desiredPhase(status: LaunchStatus, sessionVisible: boolean, current: LaunchPhase): LaunchPhase {
  if (status === 'launching') return 'launching';
  if (current === 'launching' && status === 'success') return 'success';
  if (sessionVisible) return 'running';
  return status === 'success' ? 'success' : 'idle';
}

/**
 * What the launch card shows, derived from the store status and the session timer:
 * keeps each phase on screen long enough to read, and the previous phase for its exit animation.
 */
function useLaunchPhase(status: LaunchStatus, sessionVisible: boolean) {
  const [state, setState] = useState(() => ({
    phase: desiredPhase(status, sessionVisible, 'idle'),
    prev: null as LaunchPhase | null,
    animate: false, // no entry animations for what is already on screen when the card mounts
  }));
  const since = useRef(performance.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const next = desiredPhase(status, sessionVisible, state.phase);
    if (next === state.phase) return;
    // A new launch shows right away; everything else waits for the current phase's minimum time
    const wait = next === 'launching' ? 0 : (MIN_MS[state.phase] ?? 0) - (performance.now() - since.current);
    if (wait > 0) {
      const t = window.setTimeout(() => setTick(n => n + 1), wait);
      return () => window.clearTimeout(t);
    }
    since.current = performance.now();
    setState(s => ({ phase: next, prev: s.phase, animate: true }));
  }, [status, sessionVisible, state.phase, tick]);

  // Drop the replaced phase once its exit animation is over
  useEffect(() => {
    if (!state.prev) return;
    const t = window.setTimeout(() => setState(s => ({ ...s, prev: null })), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [state.prev, state.phase]);

  return state;
}

// Trail behind the head, in % of the perimeter: overlapping faint dashes that all end at the head,
// so the light fades smoothly toward the tail (an SVG stroke can't take a gradient along its path)
const HEAD = 2;
const TRAIL = Array.from({ length: 12 }, (_, i) => Math.round((HEAD + (i + 1) * 1.35) * 100) / 100);

/** Light running around the card border while launching, one flash on success */
function LaunchRim({ phase, prev, animate, color }: { phase: LaunchPhase; prev: LaunchPhase | null; animate: boolean; color: string }) {
  const running = phase === 'launching';
  const fading = !running && prev === 'launching';
  const flash = phase === 'success' && animate;
  if (!running && !fading && !flash) return null;

  return (
    <>
      <svg className="launch-rim" width="100%" height="100%" aria-hidden>
        {(running || fading) && (
          <g className={`launch-rim-trail${fading ? ' launch-fade' : ''}`}>
            {TRAIL.map(len => (
              <rect
                key={len}
                width="100%" height="100%" rx="12" pathLength="100"
                stroke={color} strokeOpacity={0.15} strokeDasharray={`${len} ${100 - len}`}
                style={{ ['--o0' as string]: len - HEAD, ['--o1' as string]: len - HEAD - 100 }}
              />
            ))}
            <rect
              className="launch-rim-head"
              width="100%" height="100%" rx="12" pathLength="100"
              stroke={color} strokeDasharray={`${HEAD} ${100 - HEAD}`}
              style={{ ['--o0' as string]: 0, ['--o1' as string]: -100, filter: `drop-shadow(0 0 3px ${color})` }}
            />
          </g>
        )}
        {/* Static border when animations are off */}
        {running && <rect className="launch-rim-still" width="100%" height="100%" rx="12" stroke={color} />}
        {flash && <rect className="launch-rim-flash" width="100%" height="100%" rx="12" stroke={color} />}
      </svg>
      {flash && <span className="launch-glow" style={{ boxShadow: `inset 0 0 22px ${color}55` }} aria-hidden />}
    </>
  );
}

/** Spinning arc while launching; on success it closes into a ring and a check is drawn inside */
function LaunchIndicator({ phase, color, leaving }: { phase: 'launching' | 'success'; color: string; leaving?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`w-5 h-5 shrink-0 ${phase === 'success' ? 'launch-pop' : ''} ${leaving ? 'launch-fade' : ''}`}
      style={{ ['--sw' as string]: color }}
      aria-hidden
    >
      {phase === 'launching' ? (
        <circle className="launch-arc" cx="10" cy="10" r="8" pathLength="100" stroke={color} />
      ) : (
        <>
          <circle className="launch-ring" cx="10" cy="10" r="8" pathLength="100" />
          <path className="launch-check" d="M6.4 10.4 L8.9 12.9 L13.6 7.6" pathLength="100" />
        </>
      )}
    </svg>
  );
}

function statusText(phase: LaunchPhase, idleText: string): ReactNode {
  switch (phase) {
    case 'launching':
      return <>Launching{[0, 1, 2].map(i => <span key={i} className="launch-dot" style={{ animationDelay: `${i * 0.16}s` }}>.</span>)}</>;
    case 'success': return 'Launched';
    case 'running': return 'Running...';
    default: return idleText;
  }
}

interface LaunchCardContentProps {
  name: string;
  icon: ReactNode;
  color: string;
  status: LaunchStatus;
  sessionVisible: boolean; // a session of this software is running (its timer is shown)
  timer: ReactNode; // the session timer, or null when time tracking is off
  idleText: string;
}

/** Inside of a software launch card: icon, name, animated status, and the launch indicator or session timer */
export function LaunchCardContent({ name, icon, color, status, sessionVisible, timer, idleText }: LaunchCardContentProps) {
  const { phase, prev, animate } = useLaunchPhase(status, sessionVisible);
  const showIndicator = phase === 'launching' || phase === 'success';
  const leavingIndicator = !showIndicator && (prev === 'launching' || prev === 'success') ? prev : null;
  // One element for the indicator, keyed by its phase: when it leaves it fades out in place instead of
  // remounting, which would replay the ring and check animations
  const indicatorPhase = showIndicator ? phase : leavingIndicator;

  return (
    <>
      <LaunchRim phase={phase} prev={prev} animate={animate} color={color} />
      <div className="w-10 h-10 rounded-lg flex items-center justify-center">{icon}</div>
      <div className="text-left flex-1 min-w-0">
        <div className="font-medium">{name}</div>
        <div className="relative h-4 overflow-hidden text-xs leading-4 text-text-muted">
          <div key={phase} className={animate ? 'launch-in' : undefined}>{statusText(phase, idleText)}</div>
          {animate && prev && (
            <div key={`prev-${prev}`} className="launch-out absolute inset-0">{statusText(prev, idleText)}</div>
          )}
        </div>
      </div>

      <div className="flex items-center">
        {/* The timer comes in once the check has gone, so the two never overlap */}
        {phase === 'running' && !leavingIndicator && timer && <div className={animate ? 'launch-in' : undefined}>{timer}</div>}
        {indicatorPhase && (
          <LaunchIndicator key={indicatorPhase} phase={indicatorPhase} color={color} leaving={!showIndicator} />
        )}
      </div>
    </>
  );
}

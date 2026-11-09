import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { open } from '@tauri-apps/api/shell';
import { CreditCard, Globe, Heart } from 'lucide-react';
import { SUPPORT_COLOR, SUPPORT_COLOR_DARK, SUPPORT_COLOR_LIGHT, SUPPORT_LINKS } from '../../utils/constants';

interface Props {
  /** Flat SUPPORT_COLOR instead of the default gradient */
  solid?: boolean;
  /** Split into two rows instead of two columns — for narrow places like the Settings sidebar.
   *  Compact: smaller button, no caption underneath */
  vertical?: boolean;
  /** Follow the user's accent color instead of the brand purple (Settings) */
  accent?: boolean;
  /** Heart before the label and a light top-to-bottom sheen (default: on for `vertical`) */
  heart?: boolean;
  className?: string;
}

const GAP_PX = 8;
const RADIUS_PX = 8; // rounded-button
const ROW_HEIGHT_PX = 26; // vertical: one button before the split, each half after it
const ROW_GAP_PX = 6;

/**
 * "Support Development" that splits in two on click: International (Ko-fi) and Russian Cards (Boosty).
 * Before the click the two halves sit flush under one label and share one solid fill, so they read as a
 * single button. The click fades the label, moves the halves apart (sideways, or downwards when `vertical`)
 * and dissolves the fill into two light tinted buttons with icons.
 * Transitions live in App.css (`.support-*`), so reduced motion and "animations off" apply there.
 */
export function SupportButton({ solid = false, vertical = false, accent = false, heart, className = '' }: Props) {
  const showHeart = heart ?? vertical;
  const [split, setSplit] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  // Accent: live CSS variable, so the button recolors as soon as the accent changes in Appearance
  const base = accent ? 'var(--accent-color)' : SUPPORT_COLOR;
  const dark = accent ? 'color-mix(in srgb, var(--accent-color) 78%, black)' : SUPPORT_COLOR_DARK;
  const light = accent ? 'color-mix(in srgb, var(--accent-color) 60%, white)' : SUPPORT_COLOR_LIGHT;
  // An image in both cases, so backgroundSize/Position spread it over the two halves without a seam
  // With the heart: a light top-to-bottom sheen (a touch lighter on top, a touch deeper at the bottom)
  const fill = solid
    ? `linear-gradient(${base}, ${base})`
    : showHeart
      ? `linear-gradient(to bottom, color-mix(in srgb, ${base} 80%, white), ${base} 55%, color-mix(in srgb, ${base} 86%, black))`
      : `linear-gradient(to bottom right, ${base}, ${dark})`;

  const openLink = (url: string) => {
    open(url).catch((error) => console.error('Failed to open support link:', error));
  };

  const doSplit = () => {
    setSplit(true);
    // Keyboard users land on the first choice
    requestAnimationFrame(() => firstRef.current?.focus({ preventScroll: true }));
  };

  const r = RADIUS_PX;
  const inner = split ? RADIUS_PX : 0; // corners where the halves meet

  // Geometry only; transitions come from CSS.
  // Vertical: both rows are full buttons stacked on the same spot, the second one under the first.
  // On split the second slides out downwards (`translate`, GPU only) while the first doesn't move,
  // so the label on it never gets cut by an opening gap.
  const geometry = (first: boolean): CSSProperties => vertical
    ? {
        left: 0,
        right: 0,
        top: 0,
        height: ROW_HEIGHT_PX,
        borderRadius: r,
        zIndex: first ? 2 : 1,
        translate: !first && split ? `0 ${ROW_HEIGHT_PX + ROW_GAP_PX}px` : '0 0',
      }
    : {
        top: 0,
        bottom: 0,
        [first ? 'left' : 'right']: 0,
        width: split ? `calc(50% - ${GAP_PX / 2}px)` : '50%',
        borderRadius: first ? `${r}px ${inner}px ${inner}px ${r}px` : `${inner}px ${r}px ${r}px ${inner}px`,
      };

  // Horizontal: one fill stretched over both halves, so there's no seam while they touch.
  // Vertical: each row is a whole button with the whole fill
  const fillStyle = (first: boolean): CSSProperties => vertical
    ? { backgroundImage: fill }
    : { backgroundImage: fill, backgroundSize: '200% 100%', backgroundPosition: first ? 'left' : 'right' };

  const textSize = vertical ? 'text-[11px]' : 'text-[13px]';
  const iconSize = vertical ? 'w-3 h-3' : 'w-3.5 h-3.5';

  // Label delays: the first label takes the old one's place, so it waits until that is gone (90 ms);
  // vertically the second row shows its label while it slides out
  const halves = [
    { first: true, label: 'International', Icon: Globe, url: SUPPORT_LINKS.international, title: 'Donate via Ko-fi', delay: 90 },
    { first: false, label: 'Russian Cards', Icon: CreditCard, url: SUPPORT_LINKS.russianCards, title: 'Donate via Boosty', delay: vertical ? 40 : 130 },
  ];

  return (
    <div className={className}>
      <div
        className="support-split"
        data-split={split}
        style={{
          '--support': base,
          '--support-light': light,
          height: vertical ? (split ? ROW_HEIGHT_PX * 2 + ROW_GAP_PX : ROW_HEIGHT_PX) : 38,
        } as CSSProperties}
      >
        {halves.map(({ first, label, Icon, url, title, delay }) => (
          <button
            key={label}
            ref={first ? firstRef : undefined}
            type="button"
            className={`support-half ${textSize}`}
            style={geometry(first)}
            onClick={() => openLink(url)}
            title={title}
            aria-hidden={!split}
            tabIndex={split ? 0 : -1}
          >
            {/* Vertical: the top row stays solid until the second has slid out from under it,
                otherwise the second one shows through the half-transparent top */}
            <span
              className="support-fill"
              style={{ ...fillStyle(first), transitionDelay: vertical && first && split ? '80ms' : '0ms' }}
            />
            <span className="support-label" style={{ transitionDelay: split ? `${delay}ms` : '0ms' }}>
              <Icon className={`${iconSize} flex-shrink-0`} style={{ color: 'var(--support-light)' }} />
              {label}
            </span>
          </button>
        ))}

        {/* The single button shown first; its label fades as the halves part */}
        <button
          type="button"
          onClick={doSplit}
          className={`support-main ${textSize}`}
          style={{ height: vertical ? ROW_HEIGHT_PX : '100%', zIndex: 3 }}
          aria-hidden={split}
          tabIndex={split ? -1 : 0}
        >
          {showHeart && <Heart className={`support-heart ${iconSize} flex-shrink-0`} fill="currentColor" strokeWidth={0} />}
          Support Development
        </button>
      </div>

      {/* Caption: swaps to where each button leads once they split. Too long for narrow places;
          there the buttons' tooltips say it */}
      {!vertical && (
        <div className="support-caption relative h-4 mt-2 text-text-muted text-[11px] text-center" data-split={split}>
          <p className="support-caption-before absolute inset-0" aria-hidden={split}>
            100% optional • Your support is appreciated
          </p>
          <p className="support-caption-after absolute inset-0" aria-hidden={!split}>
            International via Ko-fi • Russian cards via Boosty
          </p>
        </div>
      )}
    </div>
  );
}

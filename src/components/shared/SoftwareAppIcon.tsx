import { useState } from 'react';
import { getSoftwareMeta, SOFTWARE_BADGE } from '../../utils/softwareMeta';
import { useSoftwareIcon } from '../../utils/softwareIcons';

interface SoftwareAppIconProps {
  softwareKey: string;
  /** Square edge in px */
  box: number;
  /** Icon edge inside the square */
  iconSize: number;
  radius: number;
  /** Path not saved yet (Welcome setup, Settings while editing); defaults to the saved software path */
  path?: string;
  /** Path not set: dashed frame with a neutral gray abbreviation (brand-colored letters mimic the vendor's icon) */
  unset?: boolean;
}

/** Software icon square: the icon of the user's installed exe, or the abbreviation badge */
export function SoftwareAppIcon({ softwareKey, box, iconSize, radius, path, unset = false }: SoftwareAppIconProps) {
  const meta = getSoftwareMeta(softwareKey);
  const icon = useSoftwareIcon(softwareKey, unset ? '' : path);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fontSize = Math.round(box * (meta.abbr.length === 1 ? 0.45 : 0.35));

  if (unset) {
    return (
      <div
        className="flex items-center justify-center flex-none select-none font-bold"
        style={{ width: box, height: box, borderRadius: radius, background: '#1a1a1f', border: '1px dashed #3a3a44', color: '#66666e', fontSize }}
      >
        {meta.abbr}
      </div>
    );
  }

  if (icon && icon !== failedSrc) {
    return (
      <div className="flex items-center justify-center flex-none bg-card-bg" style={{ width: box, height: box, borderRadius: radius }}>
        <img
          src={icon}
          alt={meta.display}
          draggable={false}
          style={{ width: iconSize, height: iconSize, objectFit: 'contain' }}
          onError={() => setFailedSrc(icon)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center flex-none select-none font-bold"
      style={{ width: box, height: box, borderRadius: radius, background: SOFTWARE_BADGE.background, color: SOFTWARE_BADGE.color, fontSize }}
    >
      {meta.abbr}
    </div>
  );
}

// src/components/SoftwareIcon.tsx
import { useState } from 'react';
import { normalizeSoftwareName } from '../features/time-tracking/utils/softwareUtils';
import { getSoftwareMeta, SOFTWARE_BADGE } from '../utils/softwareMeta';
import { useSoftwareIcon } from '../utils/softwareIcons';

interface SoftwareIconProps {
  name: string;
  className?: string;
}

export function SoftwareIcon({ name, className = "w-5 h-5" }: SoftwareIconProps) {
  // Accepts keys ('unreal'), display names ('Unreal Engine') and folder names ('UnrealEngine')
  const softwareKey = normalizeSoftwareName(name);
  // Icon of the user's installed exe (no bundled logos); undefined while the path isn't set
  const icon = useSoftwareIcon(softwareKey);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!icon || icon === failedSrc) {
    // Neutral letter badge (no brand look-alike)
    const meta = getSoftwareMeta(softwareKey);
    return (
      <div className="w-5 h-5 flex items-center justify-center" title={name}>
        <div
          className={`${className} flex items-center justify-center rounded text-[9px] leading-none font-bold shadow-sm`}
          style={{ background: SOFTWARE_BADGE.background, color: SOFTWARE_BADGE.color }}
        >
          {meta.abbr}
        </div>
      </div>
    );
  }

  return (
    <div className="w-5 h-5 flex items-center justify-center" title={name}>
      <img
        src={icon}
        alt={name}
        className={`${className} object-contain`}
        draggable={false}
        onError={() => setFailedSrc(icon)}
      />
    </div>
  );
}

// src/components/SoftwareIcon.tsx
import { useState } from 'react';
import { normalizeSoftwareName } from '../features/time-tracking/utils/softwareUtils';
import { getSoftwareMeta } from '../utils/softwareMeta';

// Import software logos
import blenderLogo from '/logos/blender.png';
import houdiniLogo from '/logos/houdini.png';
import afterEffectsLogo from '/logos/after-effects.png';
import photoshopLogo from '/logos/photoshop.png';
import unrealLogo from '/logos/unreal.png';
import cinema4dLogo from '/logos/cinema4d.png';
import substanceLogo from '/logos/substance.png';
import davinciLogo from '/logos/davinci.png';

const logoMap: Record<string, string> = {
  'blender': blenderLogo,
  'houdini': houdiniLogo,
  'after-effects': afterEffectsLogo,
  'photoshop': photoshopLogo,
  'unreal': unrealLogo,
  'cinema4d': cinema4dLogo,
  'substance': substanceLogo,
  'davinci': davinciLogo,
};

interface SoftwareIconProps {
  name: string;
  className?: string;
}

export function SoftwareIcon({ name, className = "w-5 h-5" }: SoftwareIconProps) {
  const [imageError, setImageError] = useState(false);
  // Accepts keys ('unreal'), display names ('Unreal Engine') and folder names ('UnrealEngine')
  const softwareKey = normalizeSoftwareName(name);
  const logoPath = logoMap[softwareKey] || null;

  // Badge from SOFTWARE_META (abbr on brand gradient) when there is no logo
  const FallbackIcon = () => {
    const meta = getSoftwareMeta(softwareKey);
    return (
      <div
        className={`${className} flex items-center justify-center rounded text-[9px] leading-none font-bold shadow-sm`}
        style={{ background: meta.gradient, color: meta.textColor ?? '#fff' }}
      >
        {meta.abbr}
      </div>
    );
  };

  if (imageError || !logoPath) {
    return (
      <div className="w-5 h-5 flex items-center justify-center" title={name}>
        <FallbackIcon />
      </div>
    );
  }

  return (
    <div className="w-5 h-5 flex items-center justify-center" title={name}>
      <img
        src={logoPath}
        alt={name}
        className={`${className} object-contain`}
        onError={() => setImageError(true)}
      />
    </div>
  );
}

// src/components/SoftwareIcon.tsx
import { useState } from 'react';

// Import software logos
import blenderLogo from '/logos/blender.png';
import houdiniLogo from '/logos/houdini.png';
import afterEffectsLogo from '/logos/after-effects.png';
import photoshopLogo from '/logos/photoshop.png';

interface SoftwareIconProps {
  name: string;
  className?: string;
}

export function SoftwareIcon({ name, className = "w-5 h-5" }: SoftwareIconProps) {
  const [imageError, setImageError] = useState(false);
  const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

  // Map software names to imported logo assets
  const getLogoPath = (softwareName: string): string | null => {
    const logoMap: Record<string, string> = {
      'blender': blenderLogo,
      'houdini': houdiniLogo,
      'after-effects': afterEffectsLogo,
      'after effects': afterEffectsLogo,
      'photoshop': photoshopLogo,
    };

    return logoMap[softwareName.toLowerCase()] || null;
  };

  // Fallback SVG icon for when image fails to load
  const FallbackIcon = () => (
    <div className={`${className} flex items-center justify-center bg-accent rounded text-white text-[10px] font-bold shadow-sm`}>
      {name.substring(0, 1).toUpperCase()}
    </div>
  );

  const logoPath = getLogoPath(normalizedName);

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

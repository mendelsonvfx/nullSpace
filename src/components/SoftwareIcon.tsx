// src/components/SoftwareIcon.tsx
import { useState } from 'react';

interface SoftwareIconProps {
  name: string;
  className?: string;
}

export function SoftwareIcon({ name, className = "w-5 h-5" }: SoftwareIconProps) {
  const [imageError, setImageError] = useState(false);
  const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

  // Map software names to logo filenames
  const getLogoPath = (softwareName: string): string => {
    const logoMap: Record<string, string> = {
      'blender': 'blender.png',
      'houdini': 'houdini.png',
      'after-effects': 'after-effects.png',
      'after effects': 'after-effects.png',
      'maya': 'maya.png',
      'cinema-4d': 'cinema4d.png',
      'cinema4d': 'cinema4d.png',
      'cinema 4d': 'cinema4d.png',
      'substance': 'substance.png',
      'unreal': 'unreal.png',
      'unity': 'unity.png',
      'zbrush': 'zbrush.png',
      'marmoset': 'marmoset.png',
    };

    return `/logos/${logoMap[softwareName.toLowerCase()] || `${softwareName.toLowerCase()}.png`}`;
  };

  // Fallback SVG icon for when image fails to load
  const FallbackIcon = () => (
    <div className={`${className} flex items-center justify-center bg-accent rounded text-white text-[10px] font-bold shadow-sm`}>
      {name.substring(0, 1).toUpperCase()}
    </div>
  );

  if (imageError) {
    return (
      <div className="w-5 h-5 flex items-center justify-center" title={name}>
        <FallbackIcon />
      </div>
    );
  }

  return (
    <div className="w-5 h-5 flex items-center justify-center" title={name}>
      <img
        src={getLogoPath(normalizedName)}
        alt={name}
        className={`${className} object-contain`}
        onError={() => setImageError(true)}
      />
    </div>
  );
}

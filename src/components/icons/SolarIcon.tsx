import { Icon } from '@iconify/react';

interface SolarIconProps {
  name: string;
  variant?: 'linear' | 'bold' | 'bold-duotone' | 'broken' | 'outline';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wrapper component for Solar Icons from Iconify
 *
 * Usage:
 * <SolarIcon name="folder" className="w-5 h-5" />
 * <SolarIcon name="star" variant="bold" className="w-5 h-5 text-yellow-400" />
 *
 * Available variants:
 * - linear (default): Outline style
 * - bold: Filled/solid style
 * - bold-duotone: Two-tone filled style
 * - broken: Broken outline style
 * - outline: Alternative outline style
 */
export function SolarIcon({ name, variant = 'linear', className, style }: SolarIconProps) {
  const iconName = `solar:${name}-${variant}`;

  return (
    <Icon icon={iconName} className={className} style={style} />
  );
}

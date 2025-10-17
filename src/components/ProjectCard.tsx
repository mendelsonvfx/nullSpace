import { ReactNode, memo, useMemo } from 'react';
import { useThumbnail } from '../hooks/useThumbnail';

interface ProjectCardProps {
  projectPath: string;
  thumbnail?: string;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  children: ReactNode;
}

export const ProjectCard = memo(function ProjectCard({
  projectPath,
  thumbnail,
  isSelected,
  onContextMenu,
  onPaste,
  children
}: ProjectCardProps) {
  const thumbnailSrc = useThumbnail(projectPath, thumbnail);

  // Memoize background style to prevent recreating object on every render
  const backgroundStyle = useMemo(() =>
    thumbnailSrc ? {
      backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.6)), url("${thumbnailSrc}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: '#000000'
    } : {
      backgroundColor: '#000000'
    },
    [thumbnailSrc]
  );

  // Memoize gradient style
  const gradientStyle = useMemo(() => ({
    backgroundImage: 'linear-gradient(to top, var(--accent-color), transparent)'
  }), []);

  return (
    <div
      data-project-card
      className={`w-full text-left rounded-lg transition-all relative overflow-hidden border group animate-card ${
        isSelected
          ? 'border-accent'
          : 'hover:border-accent border-white/10'
      }`}
      onContextMenu={onContextMenu}
      onPaste={onPaste}
      tabIndex={-1}
    >
      {/* Background image with gradient */}
      <div className="absolute inset-0" style={backgroundStyle} />

      {/* Gray outline overlay on top of background */}
      <div className="absolute inset-0 border border-zinc-700/30 rounded-lg pointer-events-none z-10" />

      {/* Bottom gradient overlay (accent color, appears on hover) */}
      <div
        className="absolute inset-x-0 bottom-0 h-24 rounded-lg pointer-events-none z-10 opacity-0 group-hover:opacity-20 transition-opacity duration-500"
        style={gradientStyle}
      />

      {/* Content */}
      <div className="relative z-20 p-3">
        {children}
      </div>
    </div>
  );
});

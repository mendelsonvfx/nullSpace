import { ReactNode, memo, useMemo } from 'react';
import { useThumbnail } from '../hooks/useThumbnail';

interface ProjectCardProps {
  projectPath: string;
  thumbnail?: string;
  isSelected: boolean;
  isOrphaned?: boolean;
  onClick?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  children: ReactNode;
}

export const ProjectCard = memo(function ProjectCard({
  projectPath,
  thumbnail,
  isSelected,
  isOrphaned,
  onClick,
  onContextMenu,
  onPaste,
  children
}: ProjectCardProps) {
  const thumbnailSrc = useThumbnail(projectPath, thumbnail);

  // Memoize background style
  const backgroundStyle = useMemo(() =>
    thumbnailSrc ? {
      backgroundImage: `linear-gradient(to right, rgba(10, 10, 10, 0.85), rgba(10, 10, 10, 0.4)), url("${thumbnailSrc}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: '#141414'
    } : undefined,
    [thumbnailSrc]
  );

  return (
    <div
      data-project-card
      className={`w-full text-left rounded-card transition-all relative border group bg-card-bg overflow-hidden ${
        isOrphaned
          ? 'select-none cursor-default opacity-60'
          : 'cursor-pointer hover:scale-[1.02]'
      } ${
        isSelected
          ? 'border-accent shadow-glow-accent'
          : 'hover:border-accent border-border-primary hover:shadow-card-hover'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPaste={onPaste}
      tabIndex={-1}
    >
      {/* Background image with gradient overlay */}
      {thumbnailSrc && (
        <div
          className="absolute inset-0 rounded-card"
          style={backgroundStyle}
        />
      )}

      {/* Bottom gradient overlay (accent color, appears on hover) */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 rounded-card pointer-events-none opacity-0 group-hover:opacity-10 transition-opacity duration-300"
        style={{ background: 'linear-gradient(to top, var(--accent-color), transparent)' }}
      />

      {/* Content */}
      <div className="relative z-10 p-4">
        {children}
      </div>
    </div>
  );
});

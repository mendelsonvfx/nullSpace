import { ReactNode } from 'react';
import { useThumbnail } from '../hooks/useThumbnail';

interface ProjectCardProps {
  projectPath: string;
  thumbnail?: string;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  children: ReactNode;
}

export function ProjectCard({ projectPath, thumbnail, isSelected, onContextMenu, onPaste, children }: ProjectCardProps) {
  const thumbnailSrc = useThumbnail(projectPath, thumbnail);

  return (
    <div
      className={`w-full text-left rounded-lg transition-all relative overflow-hidden border ${
        isSelected
          ? 'border-accent'
          : 'hover:border-accent border-white/10'
      }`}
      onContextMenu={onContextMenu}
      onPaste={onPaste}
      tabIndex={-1}
    >
      {/* Background image with gradient */}
      <div
        className="absolute inset-0"
        style={thumbnailSrc ? {
          backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.6)), url("${thumbnailSrc}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#000000'
        } : {
          backgroundColor: '#000000'
        }}
      />

      {/* Gray outline overlay on top of background */}
      <div className="absolute inset-0 border border-zinc-700/30 rounded-lg pointer-events-none z-10" />

      {/* Content */}
      <div className="relative z-20 p-3">
        {children}
      </div>
    </div>
  );
}

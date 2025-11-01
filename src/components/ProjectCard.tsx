import { ReactNode, memo } from 'react';

interface ProjectCardProps {
  projectPath: string;
  thumbnail?: string;
  isSelected: boolean;
  onClick?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  children: ReactNode;
}

export const ProjectCard = memo(function ProjectCard({
  isSelected,
  onClick,
  onContextMenu,
  onPaste,
  children
}: ProjectCardProps) {
  return (
    <div
      data-project-card
      className={`w-full text-left rounded-card transition-all relative border group cursor-pointer bg-card-bg ${
        isSelected
          ? 'border-accent shadow-glow-accent'
          : 'hover:border-border-hover border-border-primary hover:shadow-card-hover'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPaste={onPaste}
      tabIndex={-1}
    >
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

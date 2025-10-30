import { memo, useMemo } from 'react';
import { useThumbnail } from '../../hooks/useThumbnail';

interface ProjectBreakdownCardProps {
  project: {
    path: string;
    thumbnail?: string;
    name: string;
    displayText: string;
  };
  textColorClass: string;
  gradientColor: 'green' | 'gray';
}

export const ProjectBreakdownCard = memo(function ProjectBreakdownCard({
  project,
  textColorClass,
  gradientColor
}: ProjectBreakdownCardProps) {
  const thumbnailSrc = useThumbnail(project.path, project.thumbnail);

  const gradientColorValue = useMemo(() =>
    gradientColor === 'green'
      ? 'rgba(22, 101, 52, 0.6)' // dark green
      : 'rgba(63, 63, 70, 0.6)', // dark gray
    [gradientColor]
  );

  const backgroundStyle = useMemo(() =>
    thumbnailSrc ? {
      backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4)), url("${thumbnailSrc}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    } : undefined,
    [thumbnailSrc]
  );

  const overlayStyle = useMemo(() => ({
    backgroundImage: `linear-gradient(to left, ${gradientColorValue}, transparent)`
  }), [gradientColorValue]);

  return (
    <div
      className="relative overflow-hidden rounded-lg py-2 isolate border border-zinc-900"
      style={{ backgroundColor: '#18181b' }}
    >
      {thumbnailSrc && (
        <>
          <div className="absolute inset-0 rounded-lg z-0" style={backgroundStyle} />
          <div className="absolute inset-0 rounded-lg pointer-events-none z-0" style={overlayStyle} />
        </>
      )}
      <div className="relative z-10 flex justify-between items-center px-4">
        <span className="truncate mr-2 text-white font-medium">
          {project.name}
        </span>
        <div className={`text-right flex-shrink-0 font-medium ${textColorClass}`}>
          {project.displayText}
        </div>
      </div>
    </div>
  );
});

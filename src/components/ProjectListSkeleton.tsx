/** Placeholder cards shown while the project list loads for the first time */
export function ProjectListSkeleton() {
  return (
    <div className="space-y-3 pr-2">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="h-[104px] rounded-card border border-border-primary bg-card-bg p-4 animate-pulse"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="h-4 w-2/5 rounded bg-white/[0.06]" />
          <div className="mt-3 h-3 w-1/4 rounded bg-white/[0.06]" />
          <div className="mt-5 h-3 w-3/5 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

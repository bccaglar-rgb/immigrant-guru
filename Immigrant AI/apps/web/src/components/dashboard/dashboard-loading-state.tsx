export function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-[220px] rounded-[36px] border border-line bg-white/60 anim-shimmer" />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-[320px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
        <div className="h-[320px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-[280px] rounded-[28px] border border-line bg-white/60 anim-shimmer"
            key={index}
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="h-[260px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
        <div className="h-[260px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-[280px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
        <div className="h-[280px] rounded-[28px] border border-line bg-white/60 anim-shimmer" />
      </div>
    </div>
  );
}

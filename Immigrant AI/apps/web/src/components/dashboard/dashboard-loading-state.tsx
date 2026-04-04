export function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="h-36 rounded-2xl bg-white/60 border border-line anim-shimmer"
            key={index}
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="h-72 rounded-2xl bg-white/60 border border-line anim-shimmer" />
        <div className="grid gap-6">
          <div className="h-40 rounded-2xl bg-white/60 border border-line anim-shimmer" style={{ animationDelay: "200ms" }} />
          <div className="h-40 rounded-2xl bg-white/60 border border-line anim-shimmer" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { SystemHealthFallback } from "@/components/home/system-health";

export default function Loading() {
  return (
    <AppShell>
      <section className="grid gap-10 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-64 rounded-full bg-white/70" />
          <div className="space-y-4">
            <div className="h-14 w-full rounded bg-white/70" />
            <div className="h-14 w-4/5 rounded bg-white/70" />
            <div className="h-6 w-3/4 rounded bg-white/70" />
          </div>
        </div>
        <div className="grid gap-5">
          <div className="h-40 rounded-[28px] bg-white/70" />
          <div className="h-40 rounded-[28px] bg-white/70" />
          <div className="h-40 rounded-[28px] bg-white/70" />
        </div>
      </section>
      <SystemHealthFallback />
    </AppShell>
  );
}

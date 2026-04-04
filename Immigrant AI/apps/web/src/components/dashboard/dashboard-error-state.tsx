import { Button } from "@/components/ui/button";

type DashboardErrorStateProps = Readonly<{
  eyebrow?: string;
  message: string;
  onRetry: () => void;
  title?: string;
}>;

export function DashboardErrorState({
  eyebrow = "Data unavailable",
  message,
  onRetry,
  title = "Workspace data could not be loaded."
}: DashboardErrorStateProps) {
  return (
    <div className="glass-card rounded-2xl p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
      <Button className="mt-5" onClick={onRetry} type="button" variant="secondary">
        Retry
      </Button>
    </div>
  );
}

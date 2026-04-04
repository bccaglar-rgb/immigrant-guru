import { Card } from "@/components/ui/card";
import type { ActionRoadmapItem, TimingCategory } from "@/types/workspace";

type ActionRoadmapPanelProps = Readonly<{
  items: ActionRoadmapItem[];
  status: "loading" | "ready" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
}>;

const timingOrder: TimingCategory[] = ["now", "this_week", "this_month", "later"];

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function ActionRoadmapPanel({
  errorMessage,
  items,
  onRetry,
  status
}: ActionRoadmapPanelProps) {
  if (status === "loading") {
    return <Card className="h-80 animate-pulse p-6" />;
  }

  if (status === "error") {
    return (
      <Card className="border-red/20 bg-red/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-red">
          Roadmap unavailable
        </p>
        <p className="mt-3 text-sm leading-7 text-red">
          {errorMessage || "The action roadmap could not be generated."}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-red underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry roadmap
        </button>
      </Card>
    );
  }

  const grouped = timingOrder
    .map((timingCategory) => ({
      timingCategory,
      items: items.filter((item) => item.timing_category === timingCategory)
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Card className="p-6 md:p-7">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">
        Action roadmap
      </p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        Structured preparation timeline
      </h3>
      <p className="mt-3 text-sm leading-7 text-muted">
        Use this roadmap to move the case from planning into organized execution.
      </p>

      {grouped.length > 0 ? (
        <div className="mt-6 space-y-6">
          {grouped.map((group) => (
            <div key={group.timingCategory}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {formatLabel(group.timingCategory)}
              </p>
              <div className="mt-3 grid gap-4">
                {group.items.map((item) => (
                  <div
                    className="rounded-xl border border-line bg-canvas/50 px-5 py-5"
                    key={item.id}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-ink">{item.title}</p>
                        <p className="mt-2 text-sm leading-7 text-muted">
                          {item.description}
                        </p>
                      </div>
                      <div className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                        {formatLabel(item.priority)}
                      </div>
                    </div>
                    {item.dependency_notes ? (
                      <p className="mt-4 text-sm leading-7 text-muted">
                        Dependency: {item.dependency_notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm leading-7 text-muted">
          No roadmap items are available for this case yet.
        </p>
      )}
    </Card>
  );
}

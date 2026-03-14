import type { TradeIdea } from "../types";
import { TradeIdeaCard } from "./TradeIdeaCard";

interface Props {
  ideas: TradeIdea[];
  selectedCoin: string;
  scope: "SELECTED" | "ALL";
  onScopeChange: (scope: "SELECTED" | "ALL") => void;
  selectedIdeaId: string | null;
  onSelect: (id: string | null) => void;
  onIdeaCoinClick?: (coin: string, ideaId: string) => void;
  onIdeaView?: (coin: string, ideaId: string) => void;
  onIdeaTrade?: (coin: string, ideaId: string) => void;
}

export const TradeIdeasRow = ({ ideas, selectedCoin, scope, onScopeChange, selectedIdeaId, onSelect, onIdeaCoinClick, onIdeaView, onIdeaTrade }: Props) => {
  const scopedIdeas = (scope === "SELECTED" ? ideas.filter((idea) => idea.coin.toUpperCase() === selectedCoin.toUpperCase()) : ideas)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleIdeas = scopedIdeas.slice(0, 3);
  const featuredId = visibleIdeas[0]?.id ?? null;

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B6F76]">Trade Ideas</h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-white/10 bg-[#0F1012] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => onScopeChange("SELECTED")}
              className={`rounded px-2 py-1 ${scope === "SELECTED" ? "bg-[#2b2417] text-[#F5C542]" : "text-[#8A8F98]"}`}
            >
              {selectedCoin}
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("ALL")}
              className={`rounded px-2 py-1 ${scope === "ALL" ? "bg-[#2b2417] text-[#F5C542]" : "text-[#8A8F98]"}`}
            >
              All
            </button>
          </div>
          {visibleIdeas.length ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]"
            >
              Clear Highlight
            </button>
          ) : null}
        </div>
      </div>
      <div
        className="grid gap-2 pb-1 md:grid-cols-2 xl:grid-cols-3"
      >
        {visibleIdeas.length ? (
          visibleIdeas.map((idea) => (
            <TradeIdeaCard
              key={idea.id}
              idea={idea}
              selected={selectedIdeaId === idea.id}
              featured={featuredId === idea.id}
              onClick={() => onSelect(selectedIdeaId === idea.id ? null : idea.id)}
              onView={() => onIdeaView?.(idea.coin, idea.id)}
              onTrade={() => onIdeaTrade?.(idea.coin, idea.id)}
              onCoinClick={(coin) => onIdeaCoinClick?.(coin, idea.id)}
            />
          ))
        ) : (
          <div className="w-full rounded-xl border border-dashed border-[#3a3d43] bg-[#0F1012] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-[#F5C542]" />
              <div>
                <p className="text-sm font-semibold text-[#E7E9ED]">No active trade ideas yet</p>
                <p className="mt-1 text-xs text-[#8e95a3]">
                  New signals will appear here automatically when conditions match ({scope === "SELECTED" ? selectedCoin : "All coins"}).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

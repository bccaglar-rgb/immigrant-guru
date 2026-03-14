import { AiTraderTopTabs } from "../components/AiTraderTopTabs";

interface Props {
  title: string;
  note?: string;
}

export default function AiTraderComingSoonPage({ title, note }: Props) {
  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1720px]">
        <AiTraderTopTabs />
        <section className="rounded-2xl border border-white/10 bg-[var(--panel)] p-5">
          <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>
          <p className="text-xs text-[var(--textSubtle)]">AI Trader module</p>
          <div className="mt-4 rounded-xl border border-white/10 bg-[#0F1012] p-6 text-sm text-[var(--textMuted)]">
            Coming soon.
            {note ? <span className="ml-2 text-[var(--textSubtle)]">{note}</span> : null}
          </div>
        </section>
      </div>
    </main>
  );
}


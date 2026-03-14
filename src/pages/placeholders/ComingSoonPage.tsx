import { DataSourceStatusBar } from "../../components/DataSourceStatusBar";

interface Props {
  title: string;
  note?: string;
}

export const ComingSoonPage = ({ title, note }: Props) => (
  <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
    <div className="mx-auto max-w-[1560px] space-y-4">
      <DataSourceStatusBar />
      <section className="rounded-2xl border border-white/10 bg-[#121316] p-5">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <p className="text-xs text-[#6B6F76]">Institutional module</p>
        <div className="mt-4 rounded-xl border border-white/10 bg-[#0F1012] p-6 text-sm text-[#BFC2C7]">
          Coming soon.
          {note ? <span className="ml-2 text-[#6B6F76]">{note}</span> : null}
        </div>
      </section>
    </div>
  </main>
);

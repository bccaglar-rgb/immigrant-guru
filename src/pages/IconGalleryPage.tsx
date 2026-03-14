import { sidebarIconCatalog } from "../icons/bitrium";

const IconGrid = ({ light = false }: { light?: boolean }) => (
  <div
    className={`grid grid-cols-2 gap-3 rounded-2xl border p-4 md:grid-cols-3 xl:grid-cols-4 ${
      light
        ? "border-black/10 bg-white text-[#111827]"
        : "border-[var(--borderSoft)] bg-[var(--panelAlt)] text-[var(--textMuted)]"
    }`}
  >
    {sidebarIconCatalog.map(({ key, Icon }) => (
      <div
        key={`${light ? "light" : "dark"}-${key}`}
        className={`rounded-xl border p-3 ${
          light ? "border-black/10 bg-white" : "border-[var(--borderSoft)] bg-[var(--panel)]"
        }`}
      >
        <p className={`mb-2 text-xs font-semibold ${light ? "text-[#4B5563]" : "text-[var(--textSubtle)]"}`}>{key}</p>
        <div className="flex items-center gap-3">
          <span className="inline-grid h-9 w-9 place-items-center rounded-lg border border-current/20">
            <Icon size={24} />
          </span>
          <span className="inline-grid h-8 w-8 place-items-center rounded-lg border border-current/20">
            <Icon size={20} />
          </span>
          <span className="inline-grid h-9 w-9 place-items-center rounded-lg border border-current/20 text-[var(--accent)]">
            <Icon size={24} active />
          </span>
        </div>
      </div>
    ))}
  </div>
);

const IconGalleryPage = () => (
  <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Bitrium Sidebar Icon Gallery</h1>
      <p className="text-sm text-[var(--textMuted)]">
        24px/20px previews with active state in dark and light surfaces.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--textSubtle)]">Dark Surface</h2>
      <IconGrid />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--textSubtle)]">Light Surface</h2>
      <IconGrid light />
    </section>
  </main>
);

export default IconGalleryPage;


interface Props {
  title: string;
  onMenuClick: () => void;
}

export const TopBar = ({ title, onMenuClick }: Props) => (
  <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-[#111215]/95 px-4 backdrop-blur md:hidden">
    <button
      type="button"
      onClick={onMenuClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-[#0F1012] text-[#BFC2C7]"
      aria-label="Open navigation menu"
    >
      ☰
    </button>
    <p className="text-sm font-semibold text-white">{title}</p>
  </header>
);

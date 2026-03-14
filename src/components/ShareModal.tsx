interface Props {
  open: boolean;
  text: string;
  shareLink: string;
  onClose: () => void;
}

const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // noop
  }
};

export const ShareModal = ({ open, text, shareLink, onClose }: Props) => {
  if (!open) return null;

  const handleWebShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "BITRIUM AI TRADE PLAN",
        text,
        url: shareLink,
      });
    } catch {
      // noop
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121316] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Share Trade Plan</h3>
          <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs text-[#BFC2C7]">
            Close
          </button>
        </div>
        <textarea readOnly value={text} className="h-72 w-full rounded-lg border border-white/15 bg-[#0F1012] p-3 text-xs text-[#BFC2C7]" />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void copy(text)} className="rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7]">
            Copy share text
          </button>
          <button type="button" onClick={() => void copy(shareLink)} className="rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7]">
            Copy share link
          </button>
          <button
            type="button"
            disabled={!navigator.share}
            onClick={() => void handleWebShare()}
            className="rounded border border-[#F5C542]/60 bg-[#2b2417] px-3 py-1.5 text-xs font-semibold text-[#F5C542] disabled:opacity-50"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
};

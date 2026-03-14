import { useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  defaultSubject: string;
  defaultBody: string;
  onClose: () => void;
}

const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // noop
  }
};

export const EmailModal = ({ open, defaultSubject, defaultBody, onClose }: Props) => {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject);
    setBody(defaultBody);
  }, [defaultBody, defaultSubject, open]);

  const mailto = useMemo(() => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, [to, subject, body]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121316] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Email Trade Plan</h3>
          <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs text-[#BFC2C7]">
            Close
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[#BFC2C7]">
            To
            <input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-sm text-[#E7E9ED]" />
          </label>
          <label className="block text-xs text-[#BFC2C7]">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-sm text-[#E7E9ED]" />
          </label>
          <label className="block text-xs text-[#BFC2C7]">
            Body
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 h-64 w-full rounded border border-white/15 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void copy(`To: ${to}\nSubject: ${subject}\n\n${body}`)} className="rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7]">
            Copy email
          </button>
          <a href={mailto} className="rounded border border-[#F5C542]/60 bg-[#2b2417] px-3 py-1.5 text-xs font-semibold text-[#F5C542]">
            Open mailto:
          </a>
        </div>
      </div>
    </div>
  );
};

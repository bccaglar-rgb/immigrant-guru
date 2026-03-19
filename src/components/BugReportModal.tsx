import { useState } from "react";
import { useLocation } from "react-router-dom";
import { getAuthToken } from "../services/authClient";
import { useAuthStore } from "../hooks/useAuthStore";

const PATH_TO_MODULE: Record<string, string> = {
  "/quant-engine": "quant-engine",
  "/quant-trade-ideas": "trade-ideas",
  "/ai-trade-ideas": "ai-trade-ideas",
  "/ai-trader": "ai-trader",
  "/exchange-terminal": "exchanges",
  "/crypto-market": "crypto-market",
  "/coin-universe": "coin-universe",
  "/super-charts": "super-charts",
  "/indicators": "indicators",
  "/bitrium-token": "bitrium-token",
  "/pricing": "pricing",
  "/checkout": "payments",
  "/login": "auth",
  "/signup": "auth",
  "/settings": "settings",
  "/admin": "admin",
};

function detectModule(pathname: string): string {
  for (const [prefix, mod] of Object.entries(PATH_TO_MODULE)) {
    if (pathname.startsWith(prefix)) return mod;
  }
  return "general";
}

export function BugReportModal() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          module: detectModule(location.pathname),
          pageUrl: window.location.href,
          browserInfo: navigator.userAgent.slice(0, 200),
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitted(true);
        setTimeout(() => { setOpen(false); setSubmitted(false); setTitle(""); setDescription(""); }, 2000);
      } else {
        setError(data.error ?? "Submit failed");
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Bug Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[100] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#121316] text-[#6B6F76] shadow-lg transition hover:border-[#F5C542]/50 hover:text-[#F5C542]"
        title="Report a bug"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2l1.88 1.88" /><path d="M14.12 3.88L16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
          <path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
          <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121316] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Report a Bug</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[#6B6F76] hover:text-white text-lg">&times;</button>
            </div>

            {submitted ? (
              <div className="rounded-lg border border-[#4caf50]/30 bg-[#162016] p-3 text-xs text-[#4caf50]">
                Bug report submitted. Thank you!
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6B6F76]">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of the issue"
                    className="w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-xs text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6B6F76]">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect?"
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-xs text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50 resize-none"
                  />
                </div>
                <div className="rounded-lg bg-[#0F1012] p-2 text-[10px] text-[#6B6F76]">
                  <p>Module: <span className="text-white">{detectModule(location.pathname)}</span></p>
                  <p>Page: <span className="text-white">{location.pathname}</span></p>
                </div>
                {error && <p className="text-[10px] text-red-400">{error}</p>}
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || !title.trim()}
                  className="w-full rounded-lg bg-[#F5C542] py-2 text-xs font-semibold text-black transition hover:bg-[#e5b632] disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Bug Report"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

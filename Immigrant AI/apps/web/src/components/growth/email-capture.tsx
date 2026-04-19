"use client";

import { useState } from "react";

export function EmailCapture({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    try {
      await fetch("/api/v1/auth/newsletter-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      }).catch(() => null);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-white/70">{subtitle}</p>

      {state === "done" ? (
        <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          ✓ Got it. Check your inbox in the next few minutes.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="flex-1 rounded-full border border-white/15 bg-black/30 px-5 py-3 text-white placeholder-white/40 focus:border-white/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={state === "submitting"}
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
          >
            {state === "submitting" ? "Sending…" : "Send me the playbook"}
          </button>
        </form>
      )}
    </section>
  );
}

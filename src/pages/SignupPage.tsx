import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../services/authClient";

export default function SignupPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await signup(email, password);
      nav("/login");
    } catch (error: any) {
      setErr(error?.message ?? "Signup failed");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--textMuted)]">
      <div className="mx-auto max-w-md rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">Sign Up</h1>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (min 8)" className="w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
          <button type="submit" className="w-full rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Create account</button>
        </form>
        {err ? <p className="mt-2 text-xs text-[#d6b3af]">{err}</p> : null}
        <p className="mt-3 text-xs">Already have account? <Link to="/login" className="text-[var(--accent)]">Login</Link></p>
      </div>
    </main>
  );
}

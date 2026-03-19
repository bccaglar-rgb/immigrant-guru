import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthToken, me } from "../services/authClient";
import { useAuthStore } from "../hooks/useAuthStore";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const SocialButton = ({ icon, label, onClick, loading }: { icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm font-medium text-[var(--text)] transition-all hover:border-white/20 hover:bg-[var(--panel)] disabled:opacity-50"
  >
    <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
    <span className="flex-1 text-center">{loading ? "Connecting..." : label}</span>
  </button>
);

export const SocialLoginButtons = ({ mode = "login" }: { mode?: "login" | "signup" }) => {
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSuccess = async (token: string) => {
    setAuthToken(token);
    // Reload user state
    try {
      const user = await me();
      useAuthStore.setState({ user, loading: false });
      nav("/pricing");
    } catch {
      nav("/pricing");
    }
  };

  const handleGoogle = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Google login not configured. Set VITE_GOOGLE_CLIENT_ID.");
      return;
    }
    setLoading("google");
    setError("");

    // Load Google Identity Services
    const script = document.getElementById("google-gsi") ?? (() => {
      const s = document.createElement("script");
      s.id = "google-gsi";
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      document.head.appendChild(s);
      return s;
    })();

    const initGoogle = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) {
        setTimeout(initGoogle, 200);
        return;
      }
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential }),
            });
            const body = await res.json();
            if (body.ok && body.token) {
              await handleSuccess(body.token);
            } else {
              setError(body.error ?? "Google login failed");
            }
          } catch {
            setError("Network error");
          } finally {
            setLoading(null);
          }
        },
      });
      google.accounts.id.prompt();
    };

    if ((window as any).google?.accounts?.id) {
      initGoogle();
    } else {
      script.addEventListener("load", initGoogle);
    }
  };

  const handleApple = () => {
    setError("Apple Sign In: configure APPLE_SERVICE_ID on server.");
    // TODO: Load Apple JS SDK and initiate sign-in
  };

  const handleTelegram = () => {
    setError("Telegram Login: configure TELEGRAM_BOT_TOKEN on server.");
    // TODO: Load Telegram Login Widget
  };

  const handlePasskey = () => {
    setError("Passkey support coming soon.");
    // TODO: WebAuthn registration/authentication
  };

  const verb = mode === "signup" ? "Sign up" : "Continue";

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-[var(--textSubtle)]">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <SocialButton
        loading={loading === "passkey"}
        onClick={handlePasskey}
        label={`${verb} with Passkey`}
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3a6 6 0 0 1 0 12h-3m-3-6a6 6 0 1 0 0 12"/><path d="M12 15v6m-3-3h6"/></svg>}
      />
      <SocialButton
        loading={loading === "google"}
        onClick={handleGoogle}
        label={`${verb} with Google`}
        icon={<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}
      />
      <SocialButton
        loading={loading === "apple"}
        onClick={handleApple}
        label={`${verb} with Apple`}
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.53-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.18 4.36 9.22 8.82 8.96c1.27.07 2.15.73 2.9.78.99-.2 1.94-.77 3-.83 1.53-.06 2.69.51 3.45 1.64-3.15 1.87-2.4 5.97.48 7.12-.57 1.48-1.3 2.95-2.6 4.61zM12.03 8.85C11.88 6.8 13.52 5.09 15.48 4.92c.28 2.33-2.13 4.08-3.45 3.93z"/></svg>}
      />
      <SocialButton
        loading={loading === "telegram"}
        onClick={handleTelegram}
        label={`${verb} with Telegram`}
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="#229ED9"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>}
      />

      {error && <p className="text-xs text-center text-[#d6b3af]">{error}</p>}
    </div>
  );
};

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthToken, me } from "../services/authClient";
import { useAuthStore } from "../hooks/useAuthStore";

export default function GoogleCallbackPage() {
  const nav = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get("id_token");

    if (!idToken) {
      setError("Google login failed — no token received.");
      setTimeout(() => nav("/login"), 2000);
      return;
    }

    fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: idToken }),
    })
      .then((r) => r.json())
      .then(async (body) => {
        if (body.ok && body.token) {
          setAuthToken(body.token);
          try {
            const data = await me();
            useAuthStore.setState({ user: data.user, loading: false });
          } catch {}
          nav("/pricing");
        } else {
          setError(body.error ?? "Google login failed");
          setTimeout(() => nav("/login"), 2000);
        }
      })
      .catch(() => {
        setError("Network error");
        setTimeout(() => nav("/login"), 2000);
      });
  }, [nav]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        {error ? (
          <p className="text-[#d6b3af]">{error}</p>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <p className="text-[var(--text)]">Signing in with Google...</p>
          </>
        )}
      </div>
    </div>
  );
}

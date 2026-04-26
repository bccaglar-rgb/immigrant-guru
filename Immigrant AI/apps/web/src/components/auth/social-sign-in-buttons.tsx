"use client";

import Script from "next/script";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import { useRouter } from "@/i18n/navigation";
import { signInWithApple, signInWithGoogle } from "@/lib/auth-client";

type SocialSignInButtonsProps = Readonly<{
  nextPath: string;
  onError?: (message: string | null) => void;
}>;

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }) => void;
  prompt: (cb?: (notification: unknown) => void) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect?: () => void;
};

type AppleAuthResponse = {
  authorization?: { id_token?: string; code?: string; state?: string };
  user?: { name?: { firstName?: string; lastName?: string } };
};

type AppleAuthAPI = {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state?: string;
    usePopup?: boolean;
  }) => void;
  signIn: () => Promise<AppleAuthResponse>;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    AppleID?: { auth: AppleAuthAPI };
  }
}

export function SocialSignInButtons({ nextPath, onError }: SocialSignInButtonsProps) {
  const t = useTranslations();
  const router = useRouter();
  const { establishSession } = useAuthSession();

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const appleServiceId = process.env.NEXT_PUBLIC_APPLE_SERVICE_ID ?? "";
  const appleRedirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const initializedGoogle = useRef(false);
  const initializedApple = useRef(false);

  const reportError = (message: string | null) => {
    if (onError) onError(message);
  };

  const completeSession = async (token: string, expiresIn: number) => {
    const established = await establishSession({ accessToken: token, expiresIn });
    if (!established.ok) {
      reportError(established.errorMessage);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  };

  // Initialise Google Identity Services once the script + client id are ready.
  useEffect(() => {
    if (!googleReady || initializedGoogle.current || !googleClientId) return;
    if (typeof window === "undefined" || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        const credential = response.credential;
        if (!credential) {
          setBusy(null);
          reportError(t("Google sign-in failed. Please try again."));
          return;
        }
        const result = await signInWithGoogle(credential);
        if (!result.ok) {
          setBusy(null);
          reportError(result.errorMessage);
          return;
        }
        await completeSession(result.data.accessToken, result.data.expiresIn);
        setBusy(null);
      },
      ux_mode: "popup",
      auto_select: false,
    });
    initializedGoogle.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleReady, googleClientId]);

  // Initialise Apple JS once the script is ready.
  useEffect(() => {
    if (!appleReady || initializedApple.current || !appleServiceId || !appleRedirectUri) return;
    if (typeof window === "undefined" || !window.AppleID?.auth) return;

    window.AppleID.auth.init({
      clientId: appleServiceId,
      scope: "name email",
      redirectURI: appleRedirectUri,
      usePopup: true,
    });
    initializedApple.current = true;
  }, [appleReady, appleServiceId, appleRedirectUri]);

  const onGoogleClick = () => {
    reportError(null);
    if (!googleClientId) {
      reportError(t("Google sign-in is not configured."));
      return;
    }
    if (typeof window === "undefined" || !window.google?.accounts?.id) {
      reportError(t("Google sign-in is still loading. Please try again."));
      return;
    }
    setBusy("google");
    try {
      window.google.accounts.id.prompt();
    } catch {
      setBusy(null);
      reportError(t("Could not open Google sign-in."));
    }
  };

  const onAppleClick = async () => {
    reportError(null);
    if (!appleServiceId || !appleRedirectUri) {
      reportError(t("Apple sign-in is not configured."));
      return;
    }
    if (typeof window === "undefined" || !window.AppleID?.auth) {
      reportError(t("Apple sign-in is still loading. Please try again."));
      return;
    }
    setBusy("apple");
    try {
      const response = await window.AppleID.auth.signIn();
      const idToken = response.authorization?.id_token;
      if (!idToken) {
        setBusy(null);
        reportError(t("Apple sign-in failed."));
        return;
      }
      const result = await signInWithApple(
        idToken,
        response.user?.name?.firstName ?? null,
        response.user?.name?.lastName ?? null
      );
      if (!result.ok) {
        setBusy(null);
        reportError(result.errorMessage);
        return;
      }
      await completeSession(result.data.accessToken, result.data.expiresIn);
      setBusy(null);
    } catch (err) {
      setBusy(null);
      // The Apple SDK rejects with { error: "popup_closed_by_user" } on dismiss
      const code = (err as { error?: string } | null)?.error;
      if (code && code !== "popup_closed_by_user" && code !== "user_cancelled_authorize") {
        reportError(t("Apple sign-in failed."));
      }
    }
  };

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />
      <Script
        src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
        strategy="afterInteractive"
        onLoad={() => setAppleReady(true)}
      />

      <div className="space-y-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={onGoogleClick}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white text-base font-semibold text-ink transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.95l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.16-3.16C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          {busy === "google" ? t("Signing in...") : t("Continue with Google")}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={onAppleClick}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-black text-base font-semibold text-white transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 384 512" className="h-5 w-5 fill-white">
            <path d="M318.7 268c-.2-37 16.6-65 50.5-85.7-19-27.2-47.6-42.2-85.4-45.1-35.7-2.8-74.7 21.1-89 21.1-15.1 0-49.7-20.1-77-20.1C70.3 138.8 16 184.7 16 277.7c0 28.8 5.3 58.5 15.8 89.2 14 39.6 64.7 137 117.6 135.4 27.7-.7 47.2-19.7 83.2-19.7 35 0 53 19.7 83.9 19.7 53.4-.8 99.2-89.5 112.5-129.2-71.5-33.7-110.3-99.1-110.3-105.1zM248.7 92.6c30-35.6 27.3-68 26.4-79.6-26.5 1.5-57.1 18-74.5 38.3C181.5 73 170.1 99 172.5 136.4c28.6 2.2 54.7-12.4 76.2-43.8z" />
          </svg>
          {busy === "apple" ? t("Signing in...") : t("Continue with Apple")}
        </button>
      </div>
    </>
  );
}

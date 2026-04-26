/**
 * OAuth helpers — Google + Apple sign-in.
 *
 * Google: web-based auth flow via expo-auth-session/providers/google. Works in
 * Expo Go on iOS and Android once client IDs are configured.
 *
 * Apple: native sign-in via expo-apple-authentication. iOS only — the package
 * exports `isAvailableAsync()` returning false on Android, so we hide the
 * button at the call site.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = {
  GOOGLE_OAUTH_IOS_CLIENT_ID?: string;
  GOOGLE_OAUTH_ANDROID_CLIENT_ID?: string;
  GOOGLE_OAUTH_WEB_CLIENT_ID?: string;
};

function getExtra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

/** React-hook wrapper for Google sign-in. Returns the parsed ID token (JWT)
 *  or null if the user cancels. The hook gives us back a `request` (used for
 *  pre-loading) and a `promptAsync` we call when the button is pressed. */
export function useGoogleAuth() {
  const extra = getExtra();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: extra.GOOGLE_OAUTH_IOS_CLIENT_ID,
    androidClientId: extra.GOOGLE_OAUTH_ANDROID_CLIENT_ID,
    webClientId: extra.GOOGLE_OAUTH_WEB_CLIENT_ID,
  });

  const idToken =
    response?.type === "success" ? (response.params.id_token ?? null) : null;

  return {
    request,
    response,
    promptAsync,
    idToken,
    isReady: Boolean(request) && Boolean(extra.GOOGLE_OAUTH_WEB_CLIENT_ID),
  };
}

/** True only on iOS where Apple's native dialog is available. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Trigger Apple's native sign-in dialog. Returns the identityToken (JWT)
 *  plus the first/last name (only present on the very first sign-in — Apple
 *  never resends them) or null if the user cancelled. */
export async function signInWithApple(): Promise<
  | {
      idToken: string;
      firstName: string | null;
      lastName: string | null;
    }
  | null
> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });
    if (!credential.identityToken) return null;
    return {
      idToken: credential.identityToken,
      firstName: credential.fullName?.givenName ?? null,
      lastName: credential.fullName?.familyName ?? null,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_REQUEST_CANCELED") return null;
    throw err;
  }
}

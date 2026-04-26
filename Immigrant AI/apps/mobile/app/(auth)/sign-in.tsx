import * as AppleAuthentication from "expo-apple-authentication";
import { Link, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import {
  isAppleSignInAvailable,
  signInWithApple as appleSignIn,
  useGoogleAuth,
} from "@/lib/oauth";

function GoogleIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20}>
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.95l3.66-2.84z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.16-3.16C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </Svg>
  );
}

export default function SignInScreen() {
  const requestEmailCode = useAuth((s) => s.requestEmailCode);
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const signInWithAppleStore = useAuth((s) => s.signInWithApple);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"email" | "google" | "apple" | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const emailRef = useRef<TextInput>(null);

  const google = useGoogleAuth();

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleReady);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (google.idToken && loading === "google") {
      (async () => {
        const result = await signInWithGoogle(google.idToken!);
        setLoading(null);
        if (!result.ok) return setError(result.error);
        router.replace("/(tabs)");
      })();
    }
    if (google.response?.type === "error") {
      setLoading(null);
      setError("Google sign-in failed. Please try again.");
    }
    if (google.response?.type === "cancel" || google.response?.type === "dismiss") {
      setLoading(null);
    }
  }, [google.idToken, google.response, loading, signInWithGoogle]);

  const submitEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading("email");
    setError(null);
    const result = await requestEmailCode(trimmed);
    setLoading(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push({ pathname: "/(auth)/email-code", params: { email: trimmed } });
  };

  const onGoogle = async () => {
    if (!google.isReady) {
      setError("Google sign-in is not available right now.");
      return;
    }
    setError(null);
    setLoading("google");
    try {
      await google.promptAsync();
    } catch {
      setLoading(null);
      setError("Could not open Google sign-in. Please try again.");
    }
  };

  const onApple = async () => {
    setError(null);
    setLoading("apple");
    try {
      const credential = await appleSignIn();
      if (!credential) {
        setLoading(null);
        return;
      }
      const result = await signInWithAppleStore(
        credential.idToken,
        credential.firstName,
        credential.lastName,
      );
      setLoading(null);
      if (!result.ok) return setError(result.error);
      router.replace("/(tabs)");
    } catch {
      setLoading(null);
      setError("Apple sign-in failed. Please try again.");
    }
  };

  const isBusy = loading !== null;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-1 justify-center py-8">
            <View className="gap-1 mb-8">
              <Text className="text-xs font-bold uppercase tracking-[0.15em] text-accent mb-3">
                Immigrant Guru
              </Text>
              <Text className="text-[32px] font-bold text-ink leading-tight">
                Welcome back
              </Text>
              <Text className="text-base text-muted mt-1 leading-relaxed">
                Sign in to continue your immigration journey.
              </Text>
            </View>

            {/* Email section */}
            <View className="gap-3">
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-ink">Email</Text>
                <TextInput
                  ref={emailRef}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (error) setError(null);
                  }}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  inputMode="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="go"
                  onSubmitEditing={submitEmail}
                  editable={!isBusy}
                  className="h-12 rounded-2xl border border-line bg-white px-4 text-base text-ink"
                  style={{
                    borderColor: error ? "#ef4444" : undefined,
                  }}
                />
              </View>

              {error ? (
                <View className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 flex-row items-center gap-2">
                  <Text className="text-sm text-red-600 flex-1">{error}</Text>
                </View>
              ) : null}

              <Button
                fullWidth
                size="lg"
                onPress={submitEmail}
                loading={loading === "email"}
                disabled={isBusy}
              >
                Continue with email
              </Button>
            </View>

            {/* Divider */}
            <View className="my-6 flex-row items-center gap-3">
              <View className="flex-1 h-px bg-line" />
              <Text className="text-xs font-medium uppercase tracking-widest text-muted">
                or
              </Text>
              <View className="flex-1 h-px bg-line" />
            </View>

            {/* Social buttons */}
            <View className="gap-3">
              {/* Google */}
              <Pressable
                onPress={onGoogle}
                disabled={isBusy}
                style={({ pressed }) => ({
                  opacity: pressed || isBusy ? 0.6 : 1,
                })}
                className="flex-row items-center justify-center h-12 rounded-2xl bg-white border border-line gap-3"
              >
                {loading === "google" ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <>
                    <GoogleIcon />
                    <Text className="text-base font-semibold text-ink">
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Apple — native iOS only */}
              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={16}
                  style={{ height: 48 }}
                  onPress={onApple}
                />
              ) : null}
            </View>

            {/* Footer links */}
            <View className="mt-8 items-center gap-3">
              <Text className="text-xs text-muted text-center leading-relaxed">
                New? Just enter your email above —{"\n"}we'll create your account automatically.
              </Text>
              <Link
                href="/(auth)/sign-in-password"
                className="text-sm text-muted underline underline-offset-2"
              >
                Sign in with password instead
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import * as AppleAuthentication from "expo-apple-authentication";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import {
  isAppleSignInAvailable,
  signInWithApple as appleSignIn,
  useGoogleAuth,
} from "@/lib/oauth";

export default function SignInScreen() {
  const requestEmailCode = useAuth((s) => s.requestEmailCode);
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const signInWithAppleStore = useAuth((s) => s.signInWithApple);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"email" | "google" | "apple" | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  const google = useGoogleAuth();

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleReady);
  }, []);

  // Drain Google's response when the auth window resolves.
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
      setError("Enter your email.");
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
      setError("Google sign-in is not configured.");
      return;
    }
    setError(null);
    setLoading("google");
    try {
      await google.promptAsync();
    } catch {
      setLoading(null);
      setError("Could not open Google sign-in.");
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
      setError("Apple sign-in failed.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2 mb-8">
            <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
              Immigrant Guru
            </Text>
            <Text className="text-4xl font-semibold text-ink">Welcome back</Text>
            <Text className="text-base text-muted">
              Continue with email, Google, or Apple — no password needed.
            </Text>
          </View>

          <View className="gap-4">
            <Input
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
            />

            {error ? (
              <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
                <Text className="text-sm text-red">{error}</Text>
              </View>
            ) : null}

            <Button fullWidth size="lg" onPress={submitEmail} loading={loading === "email"}>
              Continue with email
            </Button>
          </View>

          <View className="my-8 flex-row items-center gap-3">
            <View className="flex-1 h-px bg-line" />
            <Text className="text-xs uppercase tracking-widest text-muted">or</Text>
            <View className="flex-1 h-px bg-line" />
          </View>

          <View className="gap-3">
            <Pressable
              onPress={onGoogle}
              disabled={loading !== null}
              className={`flex-row items-center justify-center h-12 rounded-2xl bg-white border border-line ${loading === "google" ? "opacity-60" : ""}`}
            >
              {loading === "google" ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Text className="text-lg font-bold text-ink mr-2">G</Text>
                  <Text className="text-base font-semibold text-ink">
                    Continue with Google
                  </Text>
                </>
              )}
            </Pressable>

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

          <View className="mt-10 items-center gap-3">
            <Link
              href="/(auth)/sign-in-password"
              className="text-sm text-muted underline"
            >
              Use password instead
            </Link>
            <View className="flex-row">
              <Text className="text-sm text-muted">Need an account? </Text>
              <Link href="/(auth)/sign-up" className="text-sm font-semibold text-accent">
                Create one
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

/** Email + password sign-in. Sign-in.tsx routes here after /auth/check-email
 * confirms the address belongs to an existing account, so we pre-fill the
 * email field and lead with a "Welcome back" headline. */
export default function SignInPasswordScreen() {
  const signIn = useAuth((s) => s.signIn);
  const params = useLocalSearchParams<{ email?: string }>();
  const presetEmail = (params.email ?? "").trim().toLowerCase();
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      if (result.needsVerify) {
        router.push({ pathname: "/(auth)/verify", params: { email: email.trim() } });
        return;
      }
      setError(result.error);
      return;
    }
    router.replace("/onboarding");
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
              Welcome back
            </Text>
            <Text className="text-4xl font-semibold text-ink">Enter your password</Text>
            {presetEmail ? (
              <Text className="text-base text-muted">
                Signing in as <Text className="font-semibold text-ink">{presetEmail}</Text>.
              </Text>
            ) : (
              <Text className="text-base text-muted">
                For accounts created with a password.
              </Text>
            )}
          </View>

          <View className="gap-4">
            {presetEmail ? null : (
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
            )}
            <Input
              label="Password"
              autoComplete="current-password"
              autoCapitalize="none"
              secureTextEntry
              placeholder="Minimum 8 characters"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
            />

            {error ? (
              <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
                <Text className="text-sm text-red">{error}</Text>
              </View>
            ) : null}

            <Button fullWidth size="lg" onPress={submit} loading={loading}>
              Sign in
            </Button>

            <Link href="/(auth)/forgot-password" className="text-center text-sm text-muted mt-2">
              Forgot your password?
            </Link>
          </View>

          <View className="flex-row justify-center mt-10">
            <Link href="/(auth)/sign-in" className="text-sm font-semibold text-accent">
              ← Back to sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

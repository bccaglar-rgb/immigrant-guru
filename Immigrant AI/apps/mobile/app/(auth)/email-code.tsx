import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

/** Code entry for passwordless email login.
 *
 * Different from `verify.tsx`: that one's for new-account email verification
 * after password registration and routes to onboarding; this one logs the
 * user straight into the dashboard, creating an account if it's their first
 * sign-in.
 */
export default function EmailCodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const verifyEmailCode = useAuth((s) => s.verifyEmailCode);
  const requestEmailCode = useAuth((s) => s.requestEmailCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(45);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    if (!email) return setError("Missing email.");
    if (code.length < 6) return setError("Enter the 6-digit code.");
    setLoading(true);
    setError(null);
    const res = await verifyEmailCode(email, code);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    router.replace("/(tabs)");
  };

  const resend = async () => {
    if (!email || cooldown > 0) return;
    const res = await requestEmailCode(email);
    if (!res.ok) return setError(res.error);
    setCooldown(45);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="p-6 gap-6 flex-1 justify-center">
          <View className="gap-2">
            <Text className="text-4xl font-semibold text-ink">Check your email</Text>
            <Text className="text-base text-muted">
              We sent a 6-digit code to{" "}
              <Text className="font-semibold text-ink">{email}</Text>. Enter it
              below to sign in.
            </Text>
          </View>

          <Input
            label="Sign-in code"
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
          />

          {error ? (
            <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
              <Text className="text-sm text-red">{error}</Text>
            </View>
          ) : null}

          <Button fullWidth size="lg" onPress={submit} loading={loading} disabled={code.length < 6}>
            Sign in
          </Button>

          <Button variant="ghost" onPress={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>

          <Button variant="ghost" onPress={() => router.back()}>
            Use a different email
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

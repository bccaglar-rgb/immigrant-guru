import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const verifyEmail = useAuth((s) => s.verifyEmail);
  const resendCode = useAuth((s) => s.resendCode);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    if (code.length < 6) return setError("Enter the 6-digit code.");
    setLoading(true);
    setError(null);
    try {
      const res = await verifyEmail(email ?? "", code);
      if (!res.ok) { setError(res.error); return; }
      router.replace("/onboarding");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    const res = await resendCode(email);
    if (!res.ok) return setError(res.error);
    setCooldown(60);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View className="p-6 gap-6 flex-1 justify-center">
          <View className="gap-2">
            <Text className="text-4xl font-semibold text-ink">Check your email</Text>
            <Text className="text-base text-muted">
              We sent a 6-digit code to <Text className="font-semibold text-ink">{email}</Text>. Enter
              it below to verify your account.
            </Text>
          </View>

          <Input
            label="Verification code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
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
            Verify email
          </Button>

          <Button variant="ghost" onPress={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

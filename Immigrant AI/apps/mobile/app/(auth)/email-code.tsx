import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

const CODE_LENGTH = 6;

export default function EmailCodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const verifyEmailCode = useAuth((s) => s.verifyEmailCode);
  const requestEmailCode = useAuth((s) => s.requestEmailCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(45);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading) {
      submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (value: string) => {
    if (!email) return setError("Missing email. Go back and try again.");
    if (value.length < CODE_LENGTH) return;
    setLoading(true);
    setError(null);
    const res = await verifyEmailCode(email, value);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Invalid code. Please try again.");
      setCode("");
      inputRef.current?.focus();
      return;
    }
    router.replace("/(tabs)");
  };

  const resend = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    const res = await requestEmailCode(email);
    setResending(false);
    if (!res.ok) {
      setError(res.error ?? "Could not resend. Please try again.");
      return;
    }
    setCooldown(45);
    setCode("");
    inputRef.current?.focus();
  };

  // OTP digit boxes (visual only — single hidden input handles all input)
  const digits = code.padEnd(CODE_LENGTH, " ").split("");

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View className="flex-1 px-6 justify-center gap-8">
          {/* Header */}
          <View className="gap-2">
            <Text className="text-[32px] font-bold text-ink leading-tight">
              Check your email
            </Text>
            <Text className="text-base text-muted leading-relaxed">
              We sent a 6-digit code to{"\n"}
              <Text className="font-semibold text-ink">{email}</Text>
            </Text>
          </View>

          {/* OTP input area — transparent input overlays the boxes so taps
              anywhere focus it AND hardware keyboards (emulator) reliably
              receive input. A 1x1 hidden input loses focus too easily. */}
          <View className="items-center">
            <View style={{ position: "relative" }}>
              <View className="flex-row gap-2">
                {digits.map((d, i) => {
                  const filled = i < code.length;
                  const active = i === code.length && !loading;
                  return (
                    <View
                      key={i}
                      className={`w-12 h-14 rounded-2xl items-center justify-center border-2 ${
                        active
                          ? "border-accent bg-white"
                          : filled
                            ? "border-accent/40 bg-accent/5"
                            : "border-line bg-white"
                      }`}
                    >
                      <Text className="text-2xl font-bold text-ink">
                        {filled ? d : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH));
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={CODE_LENGTH}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus
                caretHidden
                selectionColor="transparent"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  color: "transparent",
                  fontSize: 24,
                  textAlign: "center",
                  backgroundColor: "transparent",
                }}
              />
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <Text className="text-sm text-red-600 text-center">{error}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View className="gap-3">
            <Button
              fullWidth
              size="lg"
              onPress={() => submit(code)}
              loading={loading}
              disabled={code.length < CODE_LENGTH || loading}
            >
              Verify & sign in
            </Button>

            <Button
              variant="ghost"
              onPress={resend}
              disabled={cooldown > 0 || resending || loading}
              loading={resending}
            >
              {cooldown > 0
                ? `Resend code in ${cooldown}s`
                : "Resend code"}
            </Button>

            <Button
              variant="ghost"
              onPress={() => router.back()}
              disabled={loading}
            >
              Use a different email
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

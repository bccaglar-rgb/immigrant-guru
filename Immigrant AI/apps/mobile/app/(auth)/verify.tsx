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
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const verifyEmail = useAuth((s) => s.verifyEmail);
  const resendCode = useAuth((s) => s.resendCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
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

  // Auto-submit on 6th digit
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
    const res = await verifyEmail(email, value);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Invalid code. Please try again.");
      setCode("");
      inputRef.current?.focus();
      return;
    }
    router.replace("/onboarding");
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    const res = await resendCode(email);
    if (!res.ok) return setError(res.error);
    setCooldown(60);
  };

  const digits = code.padEnd(CODE_LENGTH, " ").split("");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f7" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, padding: 28, justifyContent: "center", gap: 32 }}>

          {/* Header */}
          <Animated.View entering={FadeInDown.springify()} style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2.5, color: "#0071e3", textTransform: "uppercase" }}>
              Email verification
            </Text>
            <Text style={{ fontSize: 30, fontWeight: "800", color: "#111827", letterSpacing: -0.5, lineHeight: 36 }}>
              Check your email
            </Text>
            <Text style={{ fontSize: 15, color: "#6b7280", lineHeight: 22 }}>
              We sent a 6-digit code to{" "}
              <Text style={{ fontWeight: "700", color: "#111827" }}>{email}</Text>.
              Enter it below to activate your account.
            </Text>
          </Animated.View>

          {/* OTP digit boxes */}
          <Animated.View entering={FadeIn.delay(100).duration(300)}>
            {/* Hidden real input */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(t) => {
                setError(null);
                setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH));
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              caretHidden
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            />

            {/* Visual digit cells */}
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}
            >
              {digits.map((d, i) => {
                const filled = i < code.length;
                const active = i === code.length && code.length < CODE_LENGTH;
                return (
                  <View
                    key={i}
                    style={{
                      width: 48,
                      height: 60,
                      borderRadius: 14,
                      backgroundColor: filled ? "#eff6ff" : "#fff",
                      borderWidth: active ? 2 : 1.5,
                      borderColor: active ? "#0071e3" : filled ? "#bfdbfe" : "#e5e7eb",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: active ? "#0071e3" : "#000",
                      shadowOffset: { width: 0, height: active ? 4 : 1 },
                      shadowOpacity: active ? 0.18 : 0.04,
                      shadowRadius: active ? 10 : 4,
                      elevation: active ? 4 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: "700",
                        color: "#111827",
                        letterSpacing: -0.5,
                      }}
                    >
                      {filled ? d : ""}
                    </Text>
                  </View>
                );
              })}
            </Pressable>
          </Animated.View>

          {/* Error */}
          {error ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", padding: 12 }}>
              <Text style={{ fontSize: 13, color: "#ef4444" }}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Button fullWidth size="lg" onPress={() => submit(code)} loading={loading} disabled={code.length < CODE_LENGTH}>
              Verify email
            </Button>

            <Pressable
              onPress={resend}
              disabled={cooldown > 0}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: cooldown > 0 ? "#9ca3af" : "#0071e3", fontWeight: "600" }}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

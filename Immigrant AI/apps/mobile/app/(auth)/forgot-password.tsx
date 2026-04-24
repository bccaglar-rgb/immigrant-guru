import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api-client";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email) return setError("Enter your email.");
    setLoading(true);
    setError(null);
    const res = await api.post("/auth/forgot-password", { email: email.trim() });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setMessage("If an account exists for this email, a reset link has been sent.");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View className="p-6 gap-6 flex-1 justify-center">
          <View className="gap-2">
            <Text className="text-4xl font-semibold text-ink">Reset your password</Text>
            <Text className="text-base text-muted">
              Enter your email and we'll send you a link to create a new password.
            </Text>
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          {message ? (
            <View className="rounded-2xl bg-accent/10 border border-accent/20 p-3">
              <Text className="text-sm text-accent">{message}</Text>
            </View>
          ) : null}
          {error ? (
            <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
              <Text className="text-sm text-red">{error}</Text>
            </View>
          ) : null}

          <Button fullWidth size="lg" onPress={submit} loading={loading}>
            Send reset link
          </Button>

          <Button variant="ghost" onPress={() => router.back()}>
            Back to sign in
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

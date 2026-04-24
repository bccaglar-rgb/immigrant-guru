import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api-client";

/**
 * Deep-link target from the password reset email.
 *
 * Email links should route to:
 *   https://immigrant.guru/app/reset-password?token=XYZ
 * iOS (associatedDomains) and Android (intentFilters in app.config.ts) will
 * open the app here.  For standalone installs the user taps the link manually
 * and the OS opens the browser — which is fine as a fallback.
 */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!token) return setError("Invalid or expired reset link.");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    setError(null);
    const res = await api.post("/auth/reset-password", { token, password });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.replace("/(auth)/sign-in");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View className="p-6 gap-6 flex-1 justify-center">
          <View className="gap-2">
            <Text className="text-4xl font-semibold text-ink">New password</Text>
            <Text className="text-base text-muted">
              Choose a strong password you haven't used before.
            </Text>
          </View>

          <Input
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
          />
          <Input
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />

          {error ? (
            <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
              <Text className="text-sm text-red">{error}</Text>
            </View>
          ) : null}

          <Button fullWidth size="lg" onPress={submit} loading={loading}>
            Update password
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

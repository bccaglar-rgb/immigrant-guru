import { Link, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

export default function SignUpScreen() {
  const signUp = useAuth((s) => s.signUp);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return setError("Email and password are required.");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    setError(null);
    const res = await signUp(email.trim(), password, firstName.trim() || undefined, lastName.trim() || undefined);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    router.push({ pathname: "/(auth)/verify", params: { email: email.trim() } });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <View className="gap-2 mb-6">
            <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
              Immigrant Guru
            </Text>
            <Text className="text-4xl font-semibold text-ink">Create your account</Text>
            <Text className="text-base text-muted">
              Start with the essentials and complete your immigration profile later.
            </Text>
          </View>

          <View className="gap-4">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
              </View>
              <View className="flex-1">
                <Input label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
              </View>
            </View>
            <Input
              label="Email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              autoComplete="new-password"
              autoCapitalize="none"
              secureTextEntry
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm password"
              value={confirm}
              onChangeText={(t) => {
                setConfirm(t);
                setError(null);
              }}
              autoComplete="new-password"
              autoCapitalize="none"
              secureTextEntry
              placeholder="Repeat your password"
            />

            {error ? (
              <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
                <Text className="text-sm text-red">{error}</Text>
              </View>
            ) : null}

            <Button fullWidth size="lg" onPress={submit} loading={loading}>
              Create account
            </Button>
          </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-sm text-muted">Already have an account? </Text>
            <Link href="/(auth)/sign-in" className="text-sm font-semibold text-accent">
              Sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import Svg, { Path } from "react-native-svg";

// ── Language list ─────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", flag: "🇬🇧", name: "English",    native: "English" },
  { code: "tr", flag: "🇹🇷", name: "Turkish",    native: "Türkçe" },
  { code: "es", flag: "🇪🇸", name: "Spanish",    native: "Español" },
  { code: "pt", flag: "🇵🇹", name: "Portuguese", native: "Português" },
  { code: "fr", flag: "🇫🇷", name: "French",     native: "Français" },
  { code: "de", flag: "🇩🇪", name: "German",     native: "Deutsch" },
  { code: "ru", flag: "🇷🇺", name: "Russian",    native: "Русский" },
  { code: "ar", flag: "🇸🇦", name: "Arabic",     native: "العربية" },
  { code: "zh", flag: "🇨🇳", name: "Chinese",    native: "中文" },
  { code: "hi", flag: "🇮🇳", name: "Hindi",      native: "हिंदी" },
  { code: "ja", flag: "🇯🇵", name: "Japanese",   native: "日本語" },
] as const;

type LangCode = (typeof LANGUAGES)[number]["code"];
const LANG_KEY = "ig.preferred_language";

// ── Language picker — native slide modal ──────────────────────────────────────
function LanguagePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: LangCode;
  onSelect: (code: LangCode) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"       // native bottom-sheet slide, no bugs
      statusBarTranslucent
      onRequestClose={onClose}
      hardwareAccelerated
    >
      {/* dim backdrop — tapping closes */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          {/* sheet — stop tap propagation so it doesn't close on content tap */}
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: insets.bottom + 8,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -6 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 20,
              }}
            >
              {/* handle */}
              <View style={{ alignItems: "center", paddingTop: 14, paddingBottom: 2 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" }} />
              </View>

              {/* header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>
                  App language
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#f3f4f6",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M18 6L6 18M6 6l12 12" />
                  </Svg>
                </Pressable>
              </View>

              {/* list */}
              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {LANGUAGES.map((lang, i) => {
                  const isSelected = lang.code === selected;
                  return (
                    <Pressable
                      key={lang.code}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onSelect(lang.code);
                        onClose();
                      }}
                      android_ripple={{ color: "#f3f4f6" }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        backgroundColor: isSelected ? "#eff6ff" : "#fff",
                        borderBottomWidth: i < LANGUAGES.length - 1 ? 1 : 0,
                        borderBottomColor: "#f3f4f6",
                      }}
                    >
                      <Text style={{ fontSize: 26, marginRight: 14 }}>{lang.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: isSelected ? "700" : "500",
                            color: isSelected ? "#0071e3" : "#111827",
                          }}
                        >
                          {lang.native}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
                          {lang.name}
                        </Text>
                      </View>
                      {isSelected && (
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M5 13l4 4L19 7" />
                        </Svg>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Sign-up screen ────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const signUp = useAuth((s) => s.signUp);
  const signIn = useAuth((s) => s.signIn);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<LangCode>("en");

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((saved) => {
      if (saved && LANGUAGES.some((l) => l.code === saved)) {
        setSelectedLang(saved as LangCode);
        i18n.locale = saved;
      }
    });
  }, []);

  const handleSelectLang = (code: LangCode) => {
    setSelectedLang(code);
    i18n.locale = code;
    AsyncStorage.setItem(LANG_KEY, code).catch(() => undefined);
  };

  const currentLang = LANGUAGES.find((l) => l.code === selectedLang) ?? LANGUAGES[0];

  const submit = async () => {
    if (!email || !password) return setError("Email and password are required.");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (confirm && password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    setError(null);
    const trimmedEmail = email.trim();
    try {
      const res = await signUp(
        trimmedEmail,
        password,
        firstName.trim() || undefined,
        lastName.trim() || undefined
      );

      if (res.ok) {
        router.push({ pathname: "/(auth)/verify", params: { email: trimmedEmail } });
        return;
      }

      const isDuplicate = /already exists|already registered|account.*email/i.test(res.error ?? "");
      if (isDuplicate) {
        const signInResult = await signIn(trimmedEmail, password);
        if (signInResult.ok) { router.replace("/(tabs)"); return; }
        if (signInResult.needsVerify) {
          router.push({ pathname: "/(auth)/verify", params: { email: trimmedEmail } });
          return;
        }
        setError(
          "An account with this email already exists. Sign in instead, or use Forgot password if you can't remember your password."
        );
        return;
      }

      setError(res.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
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
                <Input
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoComplete="given-name"
                />
              </View>
              <View className="flex-1">
                <Input
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                />
              </View>
            </View>
            <Input
              label="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              autoComplete="new-password"
              autoCapitalize="none"
              secureTextEntry
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm password"
              value={confirm}
              onChangeText={(t) => { setConfirm(t); setError(null); }}
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

          {/* Sign in link */}
          <View className="flex-row justify-center mt-8">
            <Text className="text-sm text-muted">Already have an account? </Text>
            <Link href="/(auth)/sign-in" className="text-sm font-semibold text-accent">
              Sign in
            </Link>
          </View>

          {/* ── Language selector — centered, flag + chevron only ── */}
          <View style={{ alignItems: "center", marginTop: 32, marginBottom: 8 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                setLangPickerOpen(true);
              }}
              android_ripple={{ color: "#e5e7eb", borderless: false, radius: 40 }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: pressed ? "#f3f4f6" : "#fff",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 100,
                paddingHorizontal: 16,
                paddingVertical: 9,
              })}
            >
              <Text style={{ fontSize: 22, lineHeight: 26 }}>{currentLang.flag}</Text>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M6 9l6 6 6-6" />
              </Svg>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LanguagePicker
        visible={langPickerOpen}
        selected={selectedLang}
        onSelect={handleSelectLang}
        onClose={() => setLangPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

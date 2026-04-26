import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "US", flag: "🇺🇸", name: "United States" },
  { code: "CA", flag: "🇨🇦", name: "Canada" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom" },
  { code: "AU", flag: "🇦🇺", name: "Australia" },
  { code: "DE", flag: "🇩🇪", name: "Germany" },
  { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "NL", flag: "🇳🇱", name: "Netherlands" },
  { code: "CH", flag: "🇨🇭", name: "Switzerland" },
  { code: "SE", flag: "🇸🇪", name: "Sweden" },
  { code: "NO", flag: "🇳🇴", name: "Norway" },
  { code: "DK", flag: "🇩🇰", name: "Denmark" },
  { code: "AT", flag: "🇦🇹", name: "Austria" },
  { code: "BE", flag: "🇧🇪", name: "Belgium" },
  { code: "IE", flag: "🇮🇪", name: "Ireland" },
  { code: "FI", flag: "🇫🇮", name: "Finland" },
  { code: "PT", flag: "🇵🇹", name: "Portugal" },
  { code: "ES", flag: "🇪🇸", name: "Spain" },
  { code: "IT", flag: "🇮🇹", name: "Italy" },
  { code: "NZ", flag: "🇳🇿", name: "New Zealand" },
  { code: "SG", flag: "🇸🇬", name: "Singapore" },
  { code: "JP", flag: "🇯🇵", name: "Japan" },
  { code: "KR", flag: "🇰🇷", name: "South Korea" },
  { code: "AE", flag: "🇦🇪", name: "UAE" },
  { code: "QA", flag: "🇶🇦", name: "Qatar" },
  { code: "SA", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "PL", flag: "🇵🇱", name: "Poland" },
  { code: "CZ", flag: "🇨🇿", name: "Czech Republic" },
  { code: "EE", flag: "🇪🇪", name: "Estonia" },
  { code: "LV", flag: "🇱🇻", name: "Latvia" },
  { code: "LT", flag: "🇱🇹", name: "Lithuania" },
  { code: "CY", flag: "🇨🇾", name: "Cyprus" },
  { code: "MT", flag: "🇲🇹", name: "Malta" },
  { code: "GR", flag: "🇬🇷", name: "Greece" },
  { code: "LU", flag: "🇱🇺", name: "Luxembourg" },
  { code: "IS", flag: "🇮🇸", name: "Iceland" },
  { code: "HR", flag: "🇭🇷", name: "Croatia" },
  { code: "MY", flag: "🇲🇾", name: "Malaysia" },
  { code: "TH", flag: "🇹🇭", name: "Thailand" },
  { code: "TR", flag: "🇹🇷", name: "Turkey" },
  { code: "IL", flag: "🇮🇱", name: "Israel" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa" },
  { code: "BR", flag: "🇧🇷", name: "Brazil" },
  { code: "MX", flag: "🇲🇽", name: "Mexico" },
  { code: "AR", flag: "🇦🇷", name: "Argentina" },
] as const;

type Country = (typeof COUNTRIES)[number];

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevronDown() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}
function IcSearch() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}
function IcClose() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2.5} strokeLinecap="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}
function IcCheck() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  );
}
function IcBack() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

// ── Country picker ────────────────────────────────────────────────────────────
function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Country | null;
  onSelect: (c: Country | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: insets.bottom + 8,
                maxHeight: "80%",
              }}
            >
              {/* Handle */}
              <View style={{ alignItems: "center", paddingTop: 14, paddingBottom: 2 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" }} />
              </View>

              {/* Header */}
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
              }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>
                  Select country
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <IcClose />
                </Pressable>
              </View>

              {/* Search */}
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                margin: 16, paddingHorizontal: 14, paddingVertical: 10,
                backgroundColor: "#f3f4f6", borderRadius: 14,
              }}>
                <IcSearch />
                <TextInput
                  placeholder="Search country…"
                  placeholderTextColor="#9ca3af"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={{ flex: 1, fontSize: 15, color: "#111827", padding: 0 }}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery("")} hitSlop={8}>
                    <IcClose />
                  </Pressable>
                )}
              </View>

              {/* Best match option */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  onSelect(null);
                  onClose();
                }}
                style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 20, paddingVertical: 14,
                  backgroundColor: selected === null ? "#eff6ff" : "#fff",
                  borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
                }}
              >
                <Text style={{ fontSize: 24, marginRight: 14 }}>🌍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 15, fontWeight: selected === null ? "700" : "500",
                    color: selected === null ? "#0071e3" : "#111827",
                  }}>
                    Best match
                  </Text>
                  <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
                    AI picks the top countries for you
                  </Text>
                </View>
                {selected === null && <IcCheck />}
              </Pressable>

              {/* Country list */}
              <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
                {filtered.map((c, i) => {
                  const isSelected = selected?.code === c.code;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onSelect(c);
                        onClose();
                      }}
                      android_ripple={{ color: "#f3f4f6" }}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        paddingHorizontal: 20, paddingVertical: 14,
                        backgroundColor: isSelected ? "#eff6ff" : "#fff",
                        borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                        borderBottomColor: "#f3f4f6",
                      }}
                    >
                      <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                      <Text style={{
                        flex: 1, fontSize: 15,
                        fontWeight: isSelected ? "700" : "400",
                        color: isSelected ? "#0071e3" : "#111827",
                      }}>
                        {c.name}
                      </Text>
                      {isSelected && <IcCheck />}
                    </Pressable>
                  );
                })}
                {filtered.length === 0 && (
                  <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: "#9ca3af" }}>No countries found</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function NewAnalysisScreen() {
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const res = await api.post<{ id: string }>("/ai/strategy", {
      target_country: selectedCountry?.name || undefined,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.replace(`/analysis/${res.data.id}` as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 py-3">
        <Pressable
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 }}
        >
          <IcBack />
          <Text style={{ color: "#0071e3", fontSize: 16, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 30, fontWeight: "600", color: "#111827" }}>Run a new analysis</Text>
          <Text style={{ fontSize: 14, color: "#6b7280", lineHeight: 20 }}>
            We'll combine your profile with live country data and generate a Plan A / B / C.
          </Text>
        </View>

        <Card>
          <Text style={{ fontSize: 13, fontWeight: "500", color: "#6b7280", marginBottom: 12 }}>
            Optional — focus on a specific country
          </Text>

          <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827", marginBottom: 6 }}>
            Target country
          </Text>

          {/* Country selector button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              setPickerOpen(true);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              height: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              backgroundColor: pressed ? "#f9fafb" : "#fff",
              paddingHorizontal: 16,
              gap: 10,
            })}
          >
            <Text style={{ fontSize: selectedCountry ? 22 : 18, lineHeight: 26 }}>
              {selectedCountry ? selectedCountry.flag : "🌍"}
            </Text>
            <Text style={{
              flex: 1, fontSize: 15,
              color: selectedCountry ? "#111827" : "#9ca3af",
              fontWeight: selectedCountry ? "500" : "400",
            }}>
              {selectedCountry ? selectedCountry.name : "Best match (recommended)"}
            </Text>
            <IcChevronDown />
          </Pressable>

          {/* Clear selection */}
          {selectedCountry && (
            <Pressable
              onPress={() => setSelectedCountry(null)}
              hitSlop={8}
              style={{ alignSelf: "flex-start", marginTop: 8 }}
            >
              <Text style={{ fontSize: 13, color: "#0071e3", fontWeight: "500" }}>
                × Clear — use best match
              </Text>
            </Pressable>
          )}
        </Card>

        {error ? (
          <View style={{ borderRadius: 16, backgroundColor: "rgba(255,59,48,0.08)", borderWidth: 1, borderColor: "rgba(255,59,48,0.2)", padding: 12 }}>
            <Text style={{ fontSize: 13, color: "#ff3b30" }}>{error}</Text>
          </View>
        ) : null}

        <Button fullWidth size="lg" onPress={submit} loading={loading}>
          {loading ? "Analysing…" : "Generate analysis"}
        </Button>

        {loading ? (
          <View style={{ alignItems: "center" }}>
            <ActivityIndicator color="#0071e3" />
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
              Takes 10–20 seconds. Don't close the app.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <CountryPicker
        visible={pickerOpen}
        selected={selectedCountry}
        onSelect={setSelectedCountry}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

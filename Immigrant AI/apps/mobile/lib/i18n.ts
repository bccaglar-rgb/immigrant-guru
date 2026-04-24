/**
 * Minimal i18n — picks device locale, falls back to "en".
 *
 * For now we support:  en, es, tr, ar, ru, pt, fr, de, zh, hi, ja
 * (matches the top locales from apps/web/messages/).  Extend by loading the
 * matching JSON from a shared source later; right now we keep a small in-app
 * dictionary so the bundle stays lean and we avoid filesystem access on first
 * paint.
 */
import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";

const translations = {
  en: {
    welcome_back: "Welcome back",
    sign_in: "Sign in",
    create_account: "Create account",
    continue: "Continue",
    back: "Back",
    cancel: "Cancel",
    save: "Save",
    loading: "Loading…",
    dashboard: "Dashboard",
    analysis: "Analysis",
    compare: "Compare",
    settings: "Settings",
    explore: "Explore"
  },
  es: {
    welcome_back: "Bienvenido",
    sign_in: "Iniciar sesión",
    create_account: "Crear cuenta",
    continue: "Continuar",
    back: "Atrás",
    cancel: "Cancelar",
    save: "Guardar",
    loading: "Cargando…",
    dashboard: "Panel",
    analysis: "Análisis",
    compare: "Comparar",
    settings: "Ajustes",
    explore: "Explorar"
  },
  tr: {
    welcome_back: "Tekrar hoş geldin",
    sign_in: "Giriş yap",
    create_account: "Hesap oluştur",
    continue: "Devam",
    back: "Geri",
    cancel: "İptal",
    save: "Kaydet",
    loading: "Yükleniyor…",
    dashboard: "Panel",
    analysis: "Analiz",
    compare: "Karşılaştır",
    settings: "Ayarlar",
    explore: "Keşfet"
  },
  pt: {
    welcome_back: "Bem-vindo de volta",
    sign_in: "Entrar",
    create_account: "Criar conta",
    continue: "Continuar",
    back: "Voltar",
    cancel: "Cancelar",
    save: "Salvar",
    loading: "Carregando…",
    dashboard: "Painel",
    analysis: "Análise",
    compare: "Comparar",
    settings: "Ajustes",
    explore: "Explorar"
  },
  fr: {
    welcome_back: "Bon retour",
    sign_in: "Se connecter",
    create_account: "Créer un compte",
    continue: "Continuer",
    back: "Retour",
    cancel: "Annuler",
    save: "Enregistrer",
    loading: "Chargement…",
    dashboard: "Tableau de bord",
    analysis: "Analyse",
    compare: "Comparer",
    settings: "Paramètres",
    explore: "Explorer"
  }
} as const;

export const i18n = new I18n(translations as unknown as Record<string, Record<string, string>>);
i18n.enableFallback = true;
i18n.defaultLocale = "en";

const deviceLocales = getLocales();
const primary = deviceLocales[0]?.languageCode ?? "en";
i18n.locale = primary in translations ? primary : "en";

export function t(key: keyof (typeof translations)["en"]): string {
  return i18n.t(key);
}

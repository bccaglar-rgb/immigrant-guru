export const STORAGE_KEY = "immigrant-guru-language";

// Sorted alphabetically by English country name.
// Labels are country names in each country's native language.
export const LANGUAGE_OPTIONS = [
  { code: "ps", flag: "🇦🇫", label: "افغانستان" },      // Afghanistan — Pashto
  { code: "bn", flag: "🇧🇩", label: "বাংলাদেশ" },       // Bangladesh — Bengali
  { code: "pt", flag: "🇧🇷", label: "Brasil" },         // Brazil — Portuguese
  { code: "zh", flag: "🇨🇳", label: "中国" },            // China — Mandarin
  { code: "cs", flag: "🇨🇿", label: "Česko" },          // Czechia — Czech
  { code: "fr", flag: "🇫🇷", label: "France" },         // France — French
  { code: "de", flag: "🇩🇪", label: "Deutschland" },    // Germany — German
  { code: "el", flag: "🇬🇷", label: "Ελλάδα" },         // Greece — Greek
  { code: "hu", flag: "🇭🇺", label: "Magyarország" },   // Hungary — Hungarian
  { code: "hi", flag: "🇮🇳", label: "भारत" },            // India — Hindi
  { code: "id", flag: "🇮🇩", label: "Indonesia" },      // Indonesia — Indonesian
  { code: "fa", flag: "🇮🇷", label: "ایران" },           // Iran — Persian
  { code: "he", flag: "🇮🇱", label: "ישראל" },           // Israel — Hebrew
  { code: "it", flag: "🇮🇹", label: "Italia" },         // Italy — Italian
  { code: "ja", flag: "🇯🇵", label: "日本" },            // Japan — Japanese
  { code: "sw", flag: "🇰🇪", label: "Kenya" },          // Kenya — Swahili
  { code: "ms", flag: "🇲🇾", label: "Malaysia" },       // Malaysia — Malay
  { code: "nl", flag: "🇳🇱", label: "Nederland" },      // Netherlands — Dutch
  { code: "ur", flag: "🇵🇰", label: "پاکستان" },         // Pakistan — Urdu
  { code: "tl", flag: "🇵🇭", label: "Pilipinas" },      // Philippines — Filipino
  { code: "pl", flag: "🇵🇱", label: "Polska" },         // Poland — Polish
  { code: "ro", flag: "🇷🇴", label: "România" },        // Romania — Romanian
  { code: "ru", flag: "🇷🇺", label: "Россия" },          // Russia — Russian
  { code: "ar", flag: "🇸🇦", label: "السعودية" },        // Saudi Arabia — Arabic
  { code: "ko", flag: "🇰🇷", label: "대한민국" },         // South Korea — Korean
  { code: "es", flag: "🇪🇸", label: "España" },         // Spain — Spanish
  { code: "th", flag: "🇹🇭", label: "ประเทศไทย" },      // Thailand — Thai
  { code: "tr", flag: "🇹🇷", label: "Türkiye" },        // Turkey — Turkish
  { code: "uk", flag: "🇺🇦", label: "Україна" },         // Ukraine — Ukrainian
  { code: "en", flag: "🇺🇸", label: "United States" },  // USA — English
  { code: "vi", flag: "🇻🇳", label: "Việt Nam" }        // Vietnam — Vietnamese
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

export function resolvePreferredLanguage(
  storedLanguage: string | null | undefined,
  browserLanguage: string | null | undefined
): LanguageCode {
  if (
    storedLanguage &&
    LANGUAGE_OPTIONS.some((language) => language.code === storedLanguage)
  ) {
    return storedLanguage as LanguageCode;
  }

  const normalizedBrowserLanguage = browserLanguage?.toLowerCase().split("-")[0];
  if (
    normalizedBrowserLanguage &&
    LANGUAGE_OPTIONS.some((language) => language.code === normalizedBrowserLanguage)
  ) {
    return normalizedBrowserLanguage as LanguageCode;
  }

  return "en";
}

export function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") {
    return "en";
  }

  return resolvePreferredLanguage(
    window.localStorage.getItem(STORAGE_KEY),
    window.navigator.language
  );
}

export function isRtlLanguage(locale: LanguageCode): boolean {
  return (
    locale === "ar" ||
    locale === "fa" ||
    locale === "ur" ||
    locale === "he" ||
    locale === "ps"
  );
}

export function getDocumentDirection(locale: LanguageCode): "ltr" | "rtl" {
  return isRtlLanguage(locale) ? "rtl" : "ltr";
}

type TranslationRecord = Record<string, string>;

type TranslationCatalog = Partial<Record<LanguageCode, TranslationRecord>>;

const TRANSLATIONS: TranslationCatalog = {
  tr: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - Yapay Zeka Göç Strateji Platformu",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - Yeni Bir Ülkeye Karmaşa Yaşamadan Taşının",
    Language: "Dil",
    "Select language": "Dil seç",
    "How it works": "Nasıl çalışır",
    "Find your path": "Yolunu bul",
    Pricing: "Fiyatlandırma",
    Home: "Ana sayfa",
    "Sign in": "Giriş yap",
    "Sign up": "Kayıt ol",
    Dashboard: "Panel",
    "Log out": "Çıkış yap",
    "Move to a New Country Without Confusion":
      "Yeni Bir Ülkeye Karmaşa Yaşamadan Taşının",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Dakikalar içinde kişisel vize yolunuzu, hazırlık skorunuzu ve aksiyon planınızı alın.",
    Benefits: "Avantajlar",
    "A focused workspace for immigration decisions":
      "Göç kararları için odaklı bir çalışma alanı",
    "Everything you need in one place":
      "İhtiyacınız olan her şey tek yerde",
    "Six powerful tools working together to give you clarity, confidence, and a concrete plan.":
      "Size netlik, güven ve somut bir plan sunmak için birlikte çalışan altı güçlü araç.",
    "Immigration Score": "Göçmenlik Skoru",
    "Explainable readiness signals": "Açıklanabilir hazırlık sinyalleri",
    "System health": "Sistem durumu",
    "Platform Status": "Platform durumu",
    "Work abroad": "Yurt dışında çalış",
    "Study abroad": "Yurt dışında oku",
    "Move with family": "Ailenle taşın",
    "Start a business": "İş kur",
    "Tell us about you": "Bize kendinizi anlatın",
    "We analyze your options": "Seçeneklerinizi analiz ediyoruz",
    "Get your plan": "Planınızı alın",
    "Simple pricing": "Basit fiyatlandırma",
    "Find the plan that fits your journey": "Yolculuğunuza uyan planı seçin",
    "Start free. Upgrade when you're ready for your full immigration plan.":
      "Ücretsiz başlayın. Tam göç planınıza hazır olduğunuzda yükseltin.",
    Free: "Ücretsiz",
    Starter: "Başlangıç",
    Plus: "Plus",
    Premium: "Premium",
    "Best value": "En iyi değer",
    "one-time": "tek seferlik",
    "Start free": "Ücretsiz başla",
    "No subscriptions. Pay once, unlock your full plan. 30-day money-back guarantee.":
      "Abonelik yok. Bir kez ödeyin, tam planınızın kilidini açın. 30 gün para iade garantisi.",
    "Create your account": "Hesabınızı oluşturun",
    "Welcome back": "Tekrar hoş geldiniz",
    "Start with the essentials and complete your immigration profile later.":
      "Temel bilgilerle başlayın, göç profilinizi daha sonra tamamlayın.",
    "Sign in to continue your immigration strategy.":
      "Göç stratejinize devam etmek için giriş yapın.",
    "First name": "Ad",
    "Last name": "Soyad",
    Email: "E-posta",
    Password: "Şifre",
    "Confirm password": "Şifreyi onayla",
    "Forgot your password?": "Şifrenizi mi unuttunuz?",
    "Create account": "Hesap oluştur",
    "Create one": "Bir hesap oluştur",
    "Already have an account?": "Zaten hesabınız var mı?",
    "Need an account?": "Bir hesaba mı ihtiyacınız var?",
    "Creating account...": "Hesap oluşturuluyor...",
    "Signing in...": "Giriş yapılıyor...",
    "Minimum 8 characters": "En az 8 karakter",
    "Repeat your password": "Şifrenizi tekrar girin",
    "Enter a valid email address.": "Geçerli bir e-posta adresi girin.",
    "Password must contain at least 8 characters.":
      "Şifre en az 8 karakter olmalıdır.",
    "Page not found": "Sayfa bulunamadı",
    "The page you're looking for doesn't exist or hasn't been built yet.":
      "Aradığınız sayfa yok veya henüz oluşturulmadı.",
    "Return home": "Ana sayfaya dön",
    Error: "Hata",
    "Something went wrong": "Bir şeyler yanlış gitti",
    "The page hit an unexpected error while rendering. Try again, and if it persists, check the server logs.":
      "Sayfa oluşturulurken beklenmeyen bir hatayla karşılaşıldı. Tekrar deneyin; sorun sürerse sunucu kayıtlarını kontrol edin.",
    Retry: "Tekrar dene",
    "Go home": "Ana sayfaya git",
    Overview: "Genel bakış",
    Profile: "Profil",
    Cases: "Vakalar",
    Admin: "Yönetici",
    Strategy: "Strateji",
    Timeline: "Zaman çizelgesi",
    Documents: "Belgeler",
    Risks: "Riskler",
    Copilot: "Yardımcı",
    Comparison: "Karşılaştırma",
    "Step 1 of 4": "4 adımın 1.si",
    "Step 2 of 4": "4 adımın 2.si",
    "Step 3 of 4": "4 adımın 3.sü",
    "Step 4 of 4": "4 adımın 4.sü",
    "Tell us a bit about yourself.": "Bize biraz kendinizden bahsedin.",
    "Where do you want to go?": "Nereye gitmek istiyorsunuz?",
    "Your immigration goals and timing.": "Göç hedefleriniz ve zamanlamanız.",
    "Professional experience and finances.":
      "Profesyonel deneyim ve mali durum.",
    "You're ready to see your first strategy":
      "İlk stratejinizi görmeye hazırsınız",
    Nationality: "Uyruk",
    "Where do you live now?": "Şu anda nerede yaşıyorsunuz?",
    "Relationship status": "İlişki durumu",
    Children: "Çocuk sayısı",
    "Preferred language": "Tercih edilen dil",
    "Target country": "Hedef ülke",
    "Relocation timeline": "Taşınma zamanlaması",
    "Prior visa refusal?": "Önceki vize reddi var mı?",
    "Any criminal record?": "Adli sicil kaydı var mı?",
    "What do you do?": "Ne iş yapıyorsunuz?",
    "Years of experience": "Deneyim yılı",
    "Education level": "Eğitim seviyesi",
    "English level": "İngilizce seviyesi",
    "Available capital": "Kullanılabilir sermaye",
    "Review and continue": "Gözden geçir ve devam et",
    Back: "Geri",
    Next: "İleri",
    Finish: "Bitir",
    "Saving...": "Kaydediliyor...",
    "Your session is no longer available. Sign in again to continue onboarding.":
      "Oturumunuz artık geçerli değil. Onboarding'e devam etmek için tekrar giriş yapın.",
    "Your profile could not be saved right now. Retry before moving to the next step.":
      "Profiliniz şu anda kaydedilemedi. Sonraki adıma geçmeden önce tekrar deneyin.",
    "The platform could not load your profile draft. Retry before continuing.":
      "Platform profil taslağınızı yükleyemedi. Devam etmeden önce tekrar deneyin.",
    "Readiness score": "Hazırlık skoru",
    "Probability score": "Başarı olasılığı skoru",
    "Recommended pathway": "Önerilen yol",
    "Next best action": "En iyi sonraki adım",
    "Document status": "Belge durumu",
    "Case health": "Vaka sağlığı",
    "Action roadmap": "Aksiyon yol haritası",
    "Generate strategy": "Strateji oluştur",
    "Upload document": "Belge yükle",
    "Scenario simulation": "Senaryo simülasyonu",
    "No cases yet": "Henüz vaka yok",
    "Immigrant Guru helps you evaluate pathways, compare strategies, and act with clarity.":
      "Immigrant Guru, yolları değerlendirmenize, stratejileri karşılaştırmanıza ve netlikle hareket etmenize yardımcı olur.",
    "My plan": "Planım",
    "Sign out": "Çıkış yap",
    "Log in": "Giriş yap",
    "Start your plan": "Planını başlat"
  },
  de: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - KI-Einwanderungsstrategieplattform",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - Ohne Verwirrung in ein neues Land ziehen",
    Language: "Sprache",
    "Select language": "Sprache auswählen",
    "How it works": "So funktioniert es",
    "Find your path": "Finde deinen Weg",
    Pricing: "Preise",
    Home: "Startseite",
    "Sign in": "Anmelden",
    "Sign up": "Registrieren",
    "Log out": "Abmelden",
    "Move to a New Country Without Confusion":
      "Ohne Verwirrung in ein neues Land ziehen",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Erhalte in Minuten deinen personalisierten Visapfad, Bereitschaftsscore und Aktionsplan.",
    Benefits: "Vorteile",
    "Everything you need in one place": "Alles, was du brauchst, an einem Ort",
    "Simple pricing": "Einfache Preise",
    Free: "Kostenlos",
    Starter: "Starter",
    Plus: "Plus",
    Premium: "Premium",
    "Create your account": "Konto erstellen",
    "Welcome back": "Willkommen zurück",
    "First name": "Vorname",
    "Last name": "Nachname",
    Email: "E-Mail",
    Password: "Passwort",
    "Confirm password": "Passwort bestätigen",
    Dashboard: "Dashboard",
    Overview: "Übersicht",
    Profile: "Profil",
    Cases: "Fälle",
    Strategy: "Strategie",
    Timeline: "Zeitplan",
    Documents: "Dokumente",
    Risks: "Risiken",
    Copilot: "Copilot",
    Comparison: "Vergleich",
    Retry: "Erneut versuchen",
    Back: "Zurück",
    Next: "Weiter",
    Finish: "Fertig",
    "Readiness score": "Bereitschaftsscore",
    "Probability score": "Wahrscheinlichkeitsscore",
    "Recommended pathway": "Empfohlener Weg",
    "Next best action": "Nächste beste Aktion",
    "Generate strategy": "Strategie erstellen",
    "Upload document": "Dokument hochladen",
    "Scenario simulation": "Szenario-Simulation",
    "Immigrant Guru helps you evaluate pathways, compare strategies, and act with clarity.":
      "Immigrant Guru hilft dir, Wege zu bewerten, Strategien zu vergleichen und klar zu handeln.",
    "My plan": "Mein Plan",
    "Sign out": "Abmelden",
    "Log in": "Anmelden",
    "Start your plan": "Starte deinen Plan"
  },
  fr: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - Plateforme IA de stratégie d'immigration",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - S'installer dans un nouveau pays sans confusion",
    Language: "Langue",
    "Select language": "Choisir la langue",
    "How it works": "Comment ça marche",
    "Find your path": "Trouvez votre voie",
    Pricing: "Tarifs",
    Home: "Accueil",
    "Sign in": "Se connecter",
    "Sign up": "S'inscrire",
    Dashboard: "Tableau de bord",
    "Log out": "Se déconnecter",
    "Move to a New Country Without Confusion":
      "S'installer dans un nouveau pays sans confusion",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Obtenez en quelques minutes votre parcours de visa personnalisé, votre score de préparation et votre plan d'action.",
    Benefits: "Avantages",
    "Everything you need in one place": "Tout ce dont vous avez besoin au même endroit",
    "Simple pricing": "Tarification simple",
    Free: "Gratuit",
    Starter: "Starter",
    Plus: "Plus",
    Premium: "Premium",
    "Create your account": "Créez votre compte",
    "Welcome back": "Bon retour",
    "First name": "Prénom",
    "Last name": "Nom",
    Email: "E-mail",
    Password: "Mot de passe",
    "Confirm password": "Confirmer le mot de passe",
    Overview: "Vue d'ensemble",
    Profile: "Profil",
    Cases: "Dossiers",
    Strategy: "Stratégie",
    Timeline: "Calendrier",
    Documents: "Documents",
    Risks: "Risques",
    Copilot: "Copilote",
    Comparison: "Comparaison",
    Retry: "Réessayer",
    Back: "Retour",
    Next: "Suivant",
    Finish: "Terminer",
    "Generate strategy": "Générer la stratégie",
    "Upload document": "Téléverser un document",
    "Scenario simulation": "Simulation de scénario",
    "My plan": "Mon plan",
    "Sign out": "Se déconnecter",
    "Log in": "Se connecter",
    "Start your plan": "Commencez votre plan"
  },
  es: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - Plataforma de estrategia migratoria con IA",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - Mudarse a un nuevo país sin confusión",
    Language: "Idioma",
    "Select language": "Seleccionar idioma",
    "How it works": "Cómo funciona",
    "Find your path": "Encuentra tu camino",
    Pricing: "Precios",
    Home: "Inicio",
    "Sign in": "Iniciar sesión",
    "Sign up": "Registrarse",
    Dashboard: "Panel",
    "Log out": "Cerrar sesión",
    "Move to a New Country Without Confusion":
      "Mudarse a un nuevo país sin confusión",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Obtén en minutos tu ruta de visa personalizada, puntuación de preparación y plan de acción.",
    Benefits: "Beneficios",
    "Everything you need in one place": "Todo lo que necesitas en un solo lugar",
    "Simple pricing": "Precios simples",
    Free: "Gratis",
    Starter: "Starter",
    Plus: "Plus",
    Premium: "Premium",
    "Create your account": "Crea tu cuenta",
    "Welcome back": "Bienvenido de nuevo",
    "First name": "Nombre",
    "Last name": "Apellido",
    Email: "Correo electrónico",
    Password: "Contraseña",
    "Confirm password": "Confirmar contraseña",
    Overview: "Resumen",
    Profile: "Perfil",
    Cases: "Casos",
    Strategy: "Estrategia",
    Timeline: "Cronograma",
    Documents: "Documentos",
    Risks: "Riesgos",
    Copilot: "Copiloto",
    Comparison: "Comparación",
    Retry: "Reintentar",
    Back: "Atrás",
    Next: "Siguiente",
    Finish: "Finalizar",
    "Generate strategy": "Generar estrategia",
    "Upload document": "Subir documento",
    "Scenario simulation": "Simulación de escenario",
    "My plan": "Mi plan",
    "Sign out": "Cerrar sesión",
    "Log in": "Iniciar sesión",
    "Start your plan": "Inicia tu plan"
  },
  pt: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - Plataforma de estratégia migratória com IA",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - Mude para um novo país sem confusão",
    Language: "Idioma",
    "Select language": "Selecionar idioma",
    "How it works": "Como funciona",
    "Find your path": "Encontre seu caminho",
    Pricing: "Preços",
    Home: "Início",
    "Sign in": "Entrar",
    "Sign up": "Cadastrar-se",
    Dashboard: "Painel",
    "Log out": "Sair",
    "Move to a New Country Without Confusion":
      "Mude para um novo país sem confusão",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Receba em minutos sua rota de visto personalizada, pontuação de prontidão e plano de ação.",
    Benefits: "Benefícios",
    "Everything you need in one place": "Tudo o que você precisa em um só lugar",
    "Simple pricing": "Preços simples",
    Free: "Grátis",
    Starter: "Starter",
    Plus: "Plus",
    Premium: "Premium",
    "Create your account": "Crie sua conta",
    "Welcome back": "Bem-vindo de volta",
    "First name": "Nome",
    "Last name": "Sobrenome",
    Email: "E-mail",
    Password: "Senha",
    "Confirm password": "Confirmar senha",
    Overview: "Visão geral",
    Profile: "Perfil",
    Cases: "Casos",
    Strategy: "Estratégia",
    Timeline: "Linha do tempo",
    Documents: "Documentos",
    Risks: "Riscos",
    Copilot: "Copilot",
    Comparison: "Comparação",
    Retry: "Tentar novamente",
    Back: "Voltar",
    Next: "Próximo",
    Finish: "Concluir",
    "Generate strategy": "Gerar estratégia",
    "Upload document": "Enviar documento",
    "Scenario simulation": "Simulação de cenário",
    "My plan": "Meu plano",
    "Sign out": "Sair",
    "Log in": "Entrar",
    "Start your plan": "Inicie seu plano"
  },
  ar: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - منصة استراتيجية الهجرة بالذكاء الاصطناعي",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - انتقل إلى بلد جديد دون ارتباك",
    Language: "اللغة",
    "Select language": "اختر اللغة",
    "How it works": "كيف يعمل",
    "Find your path": "اعثر على مسارك",
    Pricing: "الأسعار",
    Home: "الرئيسية",
    "Sign in": "تسجيل الدخول",
    "Sign up": "إنشاء حساب",
    Dashboard: "لوحة التحكم",
    "Log out": "تسجيل الخروج",
    "Move to a New Country Without Confusion":
      "انتقل إلى بلد جديد دون ارتباك",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "احصل خلال دقائق على مسار التأشيرة المخصص لك ودرجة الجاهزية وخطة العمل.",
    Benefits: "المزايا",
    "A focused workspace for immigration decisions":
      "مساحة عمل مركزة لقرارات الهجرة",
    "Everything you need in one place": "كل ما تحتاجه في مكان واحد",
    "Six powerful tools working together to give you clarity, confidence, and a concrete plan.":
      "ست أدوات قوية تعمل معًا لمنحك الوضوح والثقة وخطة عملية.",
    "Immigration Score": "درجة الهجرة",
    "Explainable readiness signals": "مؤشرات جاهزية قابلة للتفسير",
    "System health": "حالة النظام",
    "Platform Status": "حالة المنصة",
    "Work abroad": "العمل في الخارج",
    "Study abroad": "الدراسة في الخارج",
    "Move with family": "الانتقال مع العائلة",
    "Start a business": "ابدأ عملاً",
    "Tell us about you": "أخبرنا عنك",
    "We analyze your options": "نحلل خياراتك",
    "Get your plan": "احصل على خطتك",
    "Simple pricing": "تسعير بسيط",
    "Find the plan that fits your journey": "اختر الخطة المناسبة لرحلتك",
    "Start free. Upgrade when you're ready for your full immigration plan.":
      "ابدأ مجانًا. قم بالترقية عندما تكون جاهزًا لخطة الهجرة الكاملة.",
    Free: "مجاني",
    Starter: "المبتدئ",
    Plus: "بلس",
    Premium: "بريميوم",
    "Best value": "أفضل قيمة",
    "one-time": "مرة واحدة",
    "Start free": "ابدأ مجانًا",
    "No subscriptions. Pay once, unlock your full plan. 30-day money-back guarantee.":
      "لا توجد اشتراكات. ادفع مرة واحدة وافتح خطتك الكاملة. ضمان استرداد لمدة 30 يومًا.",
    "Create your account": "أنشئ حسابك",
    "Welcome back": "مرحبًا بعودتك",
    "Start with the essentials and complete your immigration profile later.":
      "ابدأ بالأساسيات وأكمل ملف الهجرة لاحقًا.",
    "Sign in to continue your immigration strategy.":
      "سجّل الدخول لمتابعة استراتيجية الهجرة الخاصة بك.",
    "First name": "الاسم الأول",
    "Last name": "اسم العائلة",
    Email: "البريد الإلكتروني",
    Password: "كلمة المرور",
    "Confirm password": "تأكيد كلمة المرور",
    "Forgot your password?": "هل نسيت كلمة المرور؟",
    "Create account": "إنشاء حساب",
    "Create one": "أنشئ حسابًا",
    "Already have an account?": "هل لديك حساب بالفعل؟",
    "Need an account?": "هل تحتاج إلى حساب؟",
    "Creating account...": "جارٍ إنشاء الحساب...",
    "Signing in...": "جارٍ تسجيل الدخول...",
    "Minimum 8 characters": "8 أحرف على الأقل",
    "Repeat your password": "أعد إدخال كلمة المرور",
    "Enter a valid email address.": "أدخل بريدًا إلكترونيًا صالحًا.",
    "Password must contain at least 8 characters.":
      "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
    "Page not found": "الصفحة غير موجودة",
    "The page you're looking for doesn't exist or hasn't been built yet.":
      "الصفحة التي تبحث عنها غير موجودة أو لم يتم إنشاؤها بعد.",
    "Return home": "العودة إلى الرئيسية",
    Error: "خطأ",
    "Something went wrong": "حدث خطأ ما",
    "The page hit an unexpected error while rendering. Try again, and if it persists, check the server logs.":
      "واجهت الصفحة خطأ غير متوقع أثناء العرض. حاول مرة أخرى، وإذا استمرت المشكلة فراجع سجلات الخادم.",
    Retry: "أعد المحاولة",
    "Go home": "اذهب إلى الرئيسية",
    Overview: "نظرة عامة",
    Profile: "الملف الشخصي",
    Cases: "الملفات",
    Admin: "الإدارة",
    Strategy: "الاستراتيجية",
    Timeline: "الجدول الزمني",
    Documents: "المستندات",
    Risks: "المخاطر",
    Copilot: "المساعد",
    Comparison: "المقارنة",
    "Step 1 of 4": "الخطوة 1 من 4",
    "Step 2 of 4": "الخطوة 2 من 4",
    "Step 3 of 4": "الخطوة 3 من 4",
    "Step 4 of 4": "الخطوة 4 من 4",
    "Tell us a bit about yourself.": "أخبرنا قليلًا عن نفسك.",
    "Where do you want to go?": "إلى أين تريد الذهاب؟",
    "Your immigration goals and timing.": "أهداف الهجرة والتوقيت المناسب لك.",
    "Professional experience and finances.": "الخبرة المهنية والوضع المالي.",
    "You're ready to see your first strategy":
      "أنت جاهز لرؤية أول استراتيجية لك",
    Nationality: "الجنسية",
    "Where do you live now?": "أين تعيش الآن؟",
    "Relationship status": "الحالة الاجتماعية",
    Children: "عدد الأطفال",
    "Preferred language": "اللغة المفضلة",
    "Target country": "البلد المستهدف",
    "Relocation timeline": "الجدول الزمني للانتقال",
    "Prior visa refusal?": "هل لديك رفض تأشيرة سابق؟",
    "Any criminal record?": "هل لديك سجل جنائي؟",
    "What do you do?": "ما هو عملك؟",
    "Years of experience": "سنوات الخبرة",
    "Education level": "المستوى التعليمي",
    "English level": "مستوى الإنجليزية",
    "Available capital": "رأس المال المتاح",
    "Review and continue": "راجع وتابع",
    Back: "رجوع",
    Next: "التالي",
    Finish: "إنهاء",
    "Saving...": "جارٍ الحفظ...",
    "Your session is no longer available. Sign in again to continue onboarding.":
      "لم تعد جلستك متاحة. سجّل الدخول مرة أخرى لمتابعة الإعداد.",
    "Your profile could not be saved right now. Retry before moving to the next step.":
      "تعذر حفظ ملفك الآن. أعد المحاولة قبل الانتقال إلى الخطوة التالية.",
    "The platform could not load your profile draft. Retry before continuing.":
      "تعذر على المنصة تحميل مسودة ملفك الشخصي. أعد المحاولة قبل المتابعة.",
    "Readiness score": "درجة الجاهزية",
    "Probability score": "درجة الاحتمال",
    "Recommended pathway": "المسار الموصى به",
    "Next best action": "أفضل إجراء تالي",
    "Document status": "حالة المستندات",
    "Case health": "حالة الملف",
    "Action roadmap": "خارطة الإجراءات",
    "Generate strategy": "إنشاء الاستراتيجية",
    "Upload document": "رفع مستند",
    "Scenario simulation": "محاكاة السيناريو",
    "No cases yet": "لا توجد ملفات بعد",
    "Immigrant Guru helps you evaluate pathways, compare strategies, and act with clarity.":
      "يساعدك Immigrant Guru على تقييم المسارات ومقارنة الاستراتيجيات واتخاذ القرار بوضوح.",
    "My plan": "خطتي",
    "Sign out": "تسجيل الخروج",
    "Log in": "تسجيل الدخول",
    "Start your plan": "ابدأ خطتك"
  },
  zh: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - AI移民策略平台",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - 无困惑地迁往新国家",
    Language: "语言",
    "Select language": "选择语言",
    "How it works": "工作原理",
    "Find your path": "找到你的路径",
    Pricing: "价格",
    Home: "首页",
    "Sign in": "登录",
    "Sign up": "注册",
    Dashboard: "控制台",
    "Log out": "退出登录",
    "Move to a New Country Without Confusion": "无困惑地迁往新国家",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "几分钟内获得个性化签证路径、准备度评分和行动计划。",
    Benefits: "优势",
    "Everything you need in one place": "你需要的一切都在一个地方",
    "Simple pricing": "简单定价",
    Free: "免费",
    Starter: "入门版",
    Plus: "增强版",
    Premium: "高级版",
    "Create your account": "创建账户",
    "Welcome back": "欢迎回来",
    Email: "电子邮箱",
    Password: "密码",
    Overview: "概览",
    Profile: "资料",
    Cases: "案例",
    Strategy: "策略",
    Timeline: "时间线",
    Documents: "文件",
    Risks: "风险",
    Comparison: "对比",
    Retry: "重试",
    Back: "返回",
    Next: "下一步",
    Finish: "完成",
    "My plan": "我的计划",
    "Sign out": "退出登录",
    "Log in": "登录",
    "Start your plan": "开始你的计划"
  },
  ja: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - AI移民戦略プラットフォーム",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - 迷わず新しい国へ移住する",
    Language: "言語",
    "Select language": "言語を選択",
    "How it works": "仕組み",
    "Find your path": "最適なルートを見つける",
    Pricing: "料金",
    Home: "ホーム",
    "Sign in": "ログイン",
    "Sign up": "登録",
    Dashboard: "ダッシュボード",
    "Log out": "ログアウト",
    "Move to a New Country Without Confusion":
      "迷わず新しい国へ移住する",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "数分であなた専用のビザ方針、準備スコア、行動計画を取得。",
    Benefits: "特長",
    "Everything you need in one place": "必要なものをすべて一か所に",
    "Simple pricing": "シンプルな料金",
    Free: "無料",
    Starter: "スターター",
    Plus: "プラス",
    Premium: "プレミアム",
    "Create your account": "アカウントを作成",
    "Welcome back": "お帰りなさい",
    Email: "メールアドレス",
    Password: "パスワード",
    Overview: "概要",
    Profile: "プロフィール",
    Cases: "ケース",
    Strategy: "戦略",
    Timeline: "タイムライン",
    Documents: "書類",
    Risks: "リスク",
    Comparison: "比較",
    Retry: "再試行",
    Back: "戻る",
    Next: "次へ",
    Finish: "完了",
    "My plan": "マイプラン",
    "Sign out": "ログアウト",
    "Log in": "ログイン",
    "Start your plan": "プランを始める"
  },
  ko: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - AI 이민 전략 플랫폼",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - 혼란 없이 새로운 나라로 이동하세요",
    Language: "언어",
    "Select language": "언어 선택",
    "How it works": "작동 방식",
    "Find your path": "나의 경로 찾기",
    Pricing: "요금",
    Home: "홈",
    "Sign in": "로그인",
    "Sign up": "회원가입",
    Dashboard: "대시보드",
    "Log out": "로그아웃",
    "Move to a New Country Without Confusion":
      "혼란 없이 새로운 나라로 이동하세요",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "몇 분 안에 맞춤 비자 경로, 준비도 점수, 실행 계획을 받아보세요.",
    Benefits: "장점",
    "Everything you need in one place": "필요한 모든 것을 한 곳에서",
    "Simple pricing": "간단한 요금",
    Free: "무료",
    Starter: "스타터",
    Plus: "플러스",
    Premium: "프리미엄",
    "Create your account": "계정 만들기",
    "Welcome back": "다시 오신 것을 환영합니다",
    Email: "이메일",
    Password: "비밀번호",
    Overview: "개요",
    Profile: "프로필",
    Cases: "케이스",
    Strategy: "전략",
    Timeline: "타임라인",
    Documents: "문서",
    Risks: "위험",
    Comparison: "비교",
    Retry: "다시 시도",
    Back: "뒤로",
    Next: "다음",
    Finish: "완료",
    "My plan": "내 플랜",
    "Sign out": "로그아웃",
    "Log in": "로그인",
    "Start your plan": "플랜 시작하기"
  },
  ru: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - Платформа ИИ для иммиграционной стратегии",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - Переезд в новую страну без путаницы",
    Language: "Язык",
    "Select language": "Выбрать язык",
    "How it works": "Как это работает",
    "Find your path": "Найдите свой путь",
    Pricing: "Цены",
    Home: "Главная",
    "Sign in": "Войти",
    "Sign up": "Регистрация",
    Dashboard: "Панель",
    "Log out": "Выйти",
    "Move to a New Country Without Confusion":
      "Переезд в новую страну без путаницы",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "Получите персональный визовый путь, оценку готовности и план действий за считанные минуты.",
    Benefits: "Преимущества",
    "Everything you need in one place": "Всё, что вам нужно, в одном месте",
    "Simple pricing": "Простые цены",
    Free: "Бесплатно",
    Starter: "Старт",
    Plus: "Плюс",
    Premium: "Премиум",
    "Create your account": "Создать аккаунт",
    "Welcome back": "С возвращением",
    Email: "Электронная почта",
    Password: "Пароль",
    Overview: "Обзор",
    Profile: "Профиль",
    Cases: "Дела",
    Strategy: "Стратегия",
    Timeline: "Сроки",
    Documents: "Документы",
    Risks: "Риски",
    Comparison: "Сравнение",
    Retry: "Повторить",
    Back: "Назад",
    Next: "Далее",
    Finish: "Завершить",
    "My plan": "Мой план",
    "Sign out": "Выйти",
    "Log in": "Войти",
    "Start your plan": "Начать план"
  },
  hi: {
    "Immigrant Guru - AI Immigration Strategy Platform":
      "Immigrant Guru - एआई इमिग्रेशन स्ट्रैटेजी प्लेटफ़ॉर्म",
    "Immigrant Guru - Move to a New Country Without Confusion":
      "Immigrant Guru - बिना उलझन के नए देश में जाएँ",
    Language: "भाषा",
    "Select language": "भाषा चुनें",
    "How it works": "यह कैसे काम करता है",
    "Find your path": "अपना रास्ता खोजें",
    Pricing: "मूल्य",
    Home: "होम",
    "Sign in": "साइन इन करें",
    "Sign up": "साइन अप करें",
    Dashboard: "डैशबोर्ड",
    "Log out": "लॉग आउट",
    "Move to a New Country Without Confusion":
      "बिना उलझन के नए देश में जाएँ",
    "Get your personalized visa, readiness score, and action plan in minutes.":
      "कुछ ही मिनटों में अपना व्यक्तिगत वीज़ा मार्ग, तैयारी स्कोर और कार्य योजना प्राप्त करें।",
    Benefits: "फायदे",
    "Everything you need in one place": "जो कुछ चाहिए, सब एक जगह",
    "Simple pricing": "सरल मूल्य निर्धारण",
    Free: "मुफ़्त",
    Starter: "स्टार्टर",
    Plus: "प्लस",
    Premium: "प्रीमियम",
    "Create your account": "अपना खाता बनाएँ",
    "Welcome back": "वापसी पर स्वागत है",
    Email: "ईमेल",
    Password: "पासवर्ड",
    Overview: "सारांश",
    Profile: "प्रोफ़ाइल",
    Cases: "केस",
    Strategy: "रणनीति",
    Timeline: "समयरेखा",
    Documents: "दस्तावेज़",
    Risks: "जोखिम",
    Comparison: "तुलना",
    Retry: "फिर से प्रयास करें",
    Back: "वापस",
    Next: "अगला",
    Finish: "समाप्त",
    "My plan": "मेरी योजना",
    "Sign out": "साइन आउट",
    "Log in": "लॉग इन",
    "Start your plan": "अपनी योजना शुरू करें"
  }
};

const RUNTIME_CACHE_PREFIX = "ig-i18n-cache:";
const runtimeMemoryCache = new Map<string, string>();

function runtimeCacheKey(locale: LanguageCode, source: string): string {
  return `${RUNTIME_CACHE_PREFIX}${locale}:${source}`;
}

function readRuntimeCache(locale: LanguageCode, source: string): string | null {
  const key = runtimeCacheKey(locale, source);
  const inMemory = runtimeMemoryCache.get(key);
  if (inMemory !== undefined) return inMemory;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      runtimeMemoryCache.set(key, stored);
      return stored;
    }
  } catch {
    // localStorage blocked — ignore
  }
  return null;
}

export function writeRuntimeCache(
  locale: LanguageCode,
  source: string,
  translated: string
): void {
  const key = runtimeCacheKey(locale, source);
  runtimeMemoryCache.set(key, translated);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, translated);
  } catch {
    // quota — silently drop
  }
}

// Strings that shouldn't be translated at runtime (brand, addresses, code-like tokens).
const TRANSLATION_SKIP_PATTERN =
  /^(\s*|[\d\W_]+|https?:\/\/\S+|[A-Z0-9_-]{1,8}|Immigrant\s*Guru)$/i;

export function shouldTranslate(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length < 2 || trimmed.length > 500) return false;
  if (TRANSLATION_SKIP_PATTERN.test(trimmed)) return false;
  return true;
}

export function translateText(locale: LanguageCode, source: string): string {
  if (locale === "en" || !source) {
    return source;
  }

  const dictHit = TRANSLATIONS[locale]?.[source];
  if (dictHit) return dictHit;

  const cached = readRuntimeCache(locale, source);
  if (cached) return cached;

  return source;
}

// ───────────────────── Runtime translation queue ─────────────────────
// When a string isn't in the static dict or localStorage cache, we POST it to
// the API (which caches in Redis and fetches from an upstream translator).
// Strings are batched to minimize round-trips, and a single event is fired
// after a batch lands so the DOM walker can re-apply translations.

const TRANSLATION_READY_EVENT = "ig-i18n:batch-ready";
const BATCH_FLUSH_DELAY_MS = 250;
const MAX_BATCH_SIZE = 200;

const pendingByLocale = new Map<LanguageCode, Set<string>>();
const inFlightByLocale = new Map<LanguageCode, Set<string>>();
const flushTimers = new Map<LanguageCode, ReturnType<typeof setTimeout>>();

function resolveApiBase(): string {
  const envBase =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  return `${(envBase ?? "").replace(/\/$/, "")}/api/v1`;
}

async function flushBatch(locale: LanguageCode): Promise<void> {
  flushTimers.delete(locale);
  const pending = pendingByLocale.get(locale);
  if (!pending || pending.size === 0) return;

  const batch = Array.from(pending).slice(0, MAX_BATCH_SIZE);
  pending.clear();

  const inFlight = inFlightByLocale.get(locale) ?? new Set<string>();
  batch.forEach((text) => inFlight.add(text));
  inFlightByLocale.set(locale, inFlight);

  try {
    const response = await fetch(`${resolveApiBase()}/i18n/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: locale, texts: batch })
    });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      target: string;
      translations: Record<string, string>;
    };
    let applied = 0;
    for (const [source, translated] of Object.entries(payload.translations ?? {})) {
      if (translated && translated.trim() && translated !== source) {
        writeRuntimeCache(locale, source, translated);
        applied++;
      }
    }
    if (applied > 0 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TRANSLATION_READY_EVENT, { detail: { locale } })
      );
    }
  } catch {
    // network error — strings stay in English until next attempt
  } finally {
    batch.forEach((text) => inFlight.delete(text));
    // If more items arrived while we were in flight, schedule another flush.
    if (pending.size > 0 && !flushTimers.has(locale)) {
      flushTimers.set(
        locale,
        setTimeout(() => void flushBatch(locale), BATCH_FLUSH_DELAY_MS)
      );
    }
  }
}

export function queueTranslation(locale: LanguageCode, source: string): void {
  if (locale === "en") return;
  if (!shouldTranslate(source)) return;
  if (TRANSLATIONS[locale]?.[source]) return;
  if (readRuntimeCache(locale, source) !== null) return;

  const inFlight = inFlightByLocale.get(locale);
  if (inFlight?.has(source)) return;

  let pending = pendingByLocale.get(locale);
  if (!pending) {
    pending = new Set<string>();
    pendingByLocale.set(locale, pending);
  }
  if (pending.has(source)) return;
  pending.add(source);

  if (!flushTimers.has(locale)) {
    flushTimers.set(
      locale,
      setTimeout(() => void flushBatch(locale), BATCH_FLUSH_DELAY_MS)
    );
  }
}

export const TRANSLATION_BATCH_READY_EVENT = TRANSLATION_READY_EVENT;

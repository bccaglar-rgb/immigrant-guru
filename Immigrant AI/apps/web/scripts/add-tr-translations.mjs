#!/usr/bin/env node
// Merges a supplementary Turkish translation table into messages/tr.json.
// Run after gen-locale-messages.mjs to backfill strings introduced during the
// next-intl migration (home sections, pricing tiers, auth shells) that aren't
// in the original TRANSLATIONS dict. One-shot utility — safe to re-run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TR_PATH = path.resolve(__dirname, "../messages/tr.json");

const SUPPLEMENT = {
  // Header / footer / chrome
  "Toggle menu": "Menüyü aç/kapat",
  "Immigrant Guru helps you evaluate pathways, compare strategies, and act with clarity.":
    "Immigrant Guru yolları değerlendirmenize, stratejileri karşılaştırmanıza ve netlikle harekete geçmenize yardımcı olur.",

  // Hero
  "Built for immigrants, by immigrants": "Göçmenler için, göçmenler tarafından",
  "Move to a new country": "Yeni bir ülkeye taşın",
  "without confusion.": "karmaşa yaşamadan.",
  "Get your personalized visa, readiness score, and action plan in minutes. Not months.":
    "Dakikalar içinde kişisel vizenizi, hazırlık skorunuzu ve aksiyon planınızı alın. Aylar değil.",
  "See how it works": "Nasıl çalıştığını gör",
  "Your best path": "En iyi yolunuz",
  "National Interest Waiver · United States": "Ulusal Çıkar Muafiyeti · Amerika Birleşik Devletleri",
  Suitability: "Uygunluk",
  "12-18 months": "12-18 ay",
  "Est. cost": "Tahmini maliyet",
  Readiness: "Hazırlık",
  "No employer sponsor needed — you can self-petition.":
    "İşveren sponsoru gerekmez — kendi başınıza başvuru yapabilirsiniz.",

  // Input strip
  "Try it now": "Şimdi dene",
  "Find your best path": "En iyi yolunuzu bulun",
  "Where are you from?": "Nerelisiniz?",
  "Turkey, India, Brazil...": "Türkiye, Hindistan, Brezilya...",
  "United States, Canada...": "Amerika Birleşik Devletleri, Kanada...",
  "Find my best path": "En iyi yolumu bul",

  // How it works
  "Three steps. No confusion.": "Üç adım. Karmaşa yok.",
  "Your background, education, experience, and goals. Takes 2 minutes.":
    "Geçmişiniz, eğitiminiz, deneyiminiz ve hedefleriniz. 2 dakika sürer.",
  "AI checks 47 visa categories and finds your best match.":
    "Yapay zeka 47 vize kategorisini kontrol eder ve sizin için en iyi eşleşmeyi bulur.",
  "Visa, timeline, documents, cost — everything in one clear view.":
    "Vize, zaman çizelgesi, belgeler, maliyet — her şey tek net görünümde.",

  // CTA
  "Your new life starts here.": "Yeni hayatınız burada başlıyor.",
  "Stop guessing. Get a clear plan for your immigration journey — in minutes, not months.":
    "Tahminlerden kurtulun. Göç yolculuğunuz için net bir plan alın — aylar değil dakikalar içinde.",
  "Free to start · No credit card · Takes 2 minutes":
    "Ücretsiz başlayın · Kredi kartı yok · 2 dakika sürer",

  // Use cases
  "For every situation": "Her durum için",
  "Whatever your reason, we can help.": "Sebebiniz ne olursa olsun, yardımcı olabiliriz.",
  "Find the right work visa for your skills and experience. H-1B, EB-2, O-1, and more.":
    "Beceri ve deneyiminize uygun iş vizesini bulun. H-1B, EB-2, O-1 ve daha fazlası.",
  "F-1, OPT, STEM extension — understand your path from student to professional.":
    "F-1, OPT, STEM uzatma — öğrencilikten profesyonelliğe giden yolu anlayın.",
  "Spouse, children, parents — know which family visa fits and how long it takes.":
    "Eş, çocuklar, ebeveynler — hangi aile vizesinin uygun olduğunu ve ne kadar sürdüğünü öğrenin.",
  "E-2 investor, EB-5, startup visa — explore entrepreneurial immigration routes.":
    "E-2 yatırımcı, EB-5, girişim vizesi — girişimci göç rotalarını keşfedin.",

  // Pain / solution
  "Confusing visa rules that change every year": "Her yıl değişen karışık vize kuralları",
  "Expensive lawyers who charge $5,000+ for basic advice":
    "Temel danışmanlık için 5.000 $+ ücret alan pahalı avukatlar",
  "No clear direction — just endless Googling": "Net yön yok — sadece bitmeyen Google aramaları",
  "Months of waiting with no visibility": "Görünürlük olmadan aylarca bekleme",
  "We show you what to do": "Size ne yapacağınızı gösteririz",
  "Your best path, ranked by fit": "Uyuma göre sıralanmış en iyi yolunuz",
  "No confusion, no jargon": "Karmaşa yok, jargon yok",
  "The problem": "Sorun",
  "Immigration shouldn't feel this hard.": "Göçmenlik bu kadar zor hissettirmemeli.",
  "The solution": "Çözüm",
  "We turn everything into one clear plan.": "Her şeyi tek net plana dönüştürüyoruz.",
  "Tell us about yourself. Our AI analyzes 47 visa categories, checks your readiness, and gives you a step-by-step plan with timeline, cost, and documents — in minutes.":
    "Bize kendinizden bahsedin. Yapay zekamız 47 vize kategorisini analiz eder, hazırlığınızı kontrol eder ve size zaman çizelgesi, maliyet ve belgelerle birlikte adım adım bir plan sunar — dakikalar içinde.",

  // Results preview
  "What you get": "Neler elde edeceksiniz",
  "One clear plan. Everything you need.": "Tek net plan. İhtiyacınız olan her şey.",
  "Your personalized result": "Kişiselleştirilmiş sonucunuz",
  "Immigration Plan": "Göç Planı",
  Ready: "Hazır",
  "Best visa option": "En iyi vize seçeneği",
  "Estimated cost": "Tahmini maliyet",
  "Filing + legal fees": "Başvuru + yasal ücretler",
  Timeline: "Zaman çizelgesi",
  "From filing to approval": "Başvurudan onaya kadar",
  "Readiness score": "Hazırlık skoru",
  "Profile, finance, case": "Profil, finans, vaka",
  "Suggested cities": "Önerilen şehirler",
  "Job opportunities": "İş fırsatları",
  "Software Engineering, AI/ML, Product": "Yazılım Mühendisliği, AI/ML, Ürün",
  "Next step:": "Sonraki adım:",
  "Upload your resume and education documents to increase your readiness score to 90+.":
    "Hazırlık skorunuzu 90+ seviyesine çıkarmak için özgeçmişinizi ve eğitim belgelerinizi yükleyin.",

  // Global coverage
  Countries: "Ülkeler",
  "Visa types": "Vize türleri",
  "Possible paths": "Olası yollar",
  "There's always a way — we help you find it.":
    "Her zaman bir yol vardır — bulmanıza yardımcı oluruz.",
  "We analyze multiple countries, visa types, and pathways to match you with the best option based on your profile.":
    "Profilinize göre sizi en iyi seçenekle eşleştirmek için birden fazla ülkeyi, vize türünü ve yolu analiz ederiz.",
  "No matter your background, we help you find a way forward.":
    "Geçmişiniz ne olursa olsun, ileriye giden bir yol bulmanıza yardımcı oluruz.",
  "Even if you think you don't qualify — we'll show you what's possible.":
    "Uygun olmadığınızı düşünseniz bile — size neyin mümkün olduğunu göstereceğiz.",

  // Social proof
  "Visa categories analyzed": "Analiz edilen vize kategorileri",
  "Countries supported": "Desteklenen ülkeler",
  "Average time to first plan": "İlk plana kadar geçen ortalama süre",
  "I spent months Googling visa options. Immigrant Guru gave me a clear plan in 10 minutes. I wish I found this earlier.":
    "Vize seçenekleri için Google'da aylar harcadım. Immigrant Guru bana 10 dakikada net bir plan verdi. Keşke daha erken bulsaydım.",
  "Software Engineer, Turkey to USA": "Yazılım Mühendisi, Türkiye'den ABD'ye",
  "The readiness score showed me exactly what I was missing. I uploaded 3 documents and my score jumped from 52 to 81.":
    "Hazırlık skoru bana neyi kaçırdığımı tam olarak gösterdi. 3 belge yükledim ve skorum 52'den 81'e fırladı.",
  "Data Scientist, India to Canada": "Veri Bilimci, Hindistan'dan Kanada'ya",

  // Pricing
  "One-time payment. Unlock your full personalized immigration plan.":
    "Tek seferlik ödeme. Kişiselleştirilmiş tam göç planınızın kilidini açın.",
  "For one clear path": "Net tek bir yol için",
  "Full plan for 1 country": "1 ülke için tam plan",
  "Best visa recommendation": "En iyi vize önerisi",
  "Step-by-step roadmap": "Adım adım yol haritası",
  "Cost estimate": "Maliyet tahmini",
  "Timeline estimate": "Zaman çizelgesi tahmini",
  "Document checklist": "Belge kontrol listesi",
  "For comparing options": "Seçenekleri karşılaştırmak için",
  "Everything in Starter": "Başlangıç'taki her şey",
  "3 country comparisons": "3 ülke karşılaştırması",
  "Multiple visa alternatives": "Birden fazla vize alternatifi",
  "Deeper analysis": "Daha derin analiz",
  "Expanded document guidance": "Genişletilmiş belge rehberliği",
  "Better case preparation": "Daha iyi vaka hazırlığı",
  "Full strategic experience": "Tam stratejik deneyim",
  "Everything in Plus": "Plus'taki her şey",
  "Full strategic recommendation": "Tam stratejik öneri",
  "Priority AI guidance": "Öncelikli yapay zeka rehberliği",
  "Advanced action plan": "Gelişmiş aksiyon planı",
  "Full path comparison": "Tam yol karşılaştırması",
  "Premium dashboard": "Premium panel",
  "Redirecting…": "Yönlendiriliyor…",
  "Get {plan}": "{plan}'a başla",
  "Checkout failed": "Ödeme başarısız",

  // Auth shells
  "Access your immigration dashboard, decision plans, and case workspace.":
    "Göç panelinize, karar planlarınıza ve vaka çalışma alanınıza erişin.",
  "Sign in to continue your case strategy": "Vaka stratejinize devam etmek için giriş yapın",
  "Create an account to start building an immigration profile, evaluate pathways, and manage your cases.":
    "Göç profili oluşturmaya başlamak, yolları değerlendirmek ve vakalarınızı yönetmek için hesap oluşturun.",
  "Get Started": "Başlayın",
  "Create your Immigrant Guru account": "Immigrant Guru hesabınızı oluşturun"
};

const current = JSON.parse(fs.readFileSync(TR_PATH, "utf8"));
let added = 0;
let updated = 0;
for (const [key, value] of Object.entries(SUPPLEMENT)) {
  if (!(key in current)) added++;
  else if (current[key] !== value) updated++;
  current[key] = value;
}

// Deterministic ordering for diff-friendly output.
const sorted = Object.fromEntries(Object.keys(current).sort().map((k) => [k, current[k]]));
fs.writeFileSync(TR_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
console.log(`tr.json: ${added} added, ${updated} updated, ${Object.keys(sorted).length} total keys`);

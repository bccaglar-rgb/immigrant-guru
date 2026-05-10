# CLAUDE.md — Immigrant Guru / Immigrant AI

Bu dosya, bu depo üzerinde çalışacak Claude Code oturumları için yönlendirici referanstır. Koda dokunmadan önce okunmalıdır.

## Proje Özeti

**Immigrant AI** (ürün adı: **Immigrant Guru**), AI tabanlı bir göçmenlik karar ve aksiyon platformudur. Kullanıcıya profiline uygun vize stratejileri üretir, ülke karşılaştırması yapar, belge yükleme/işleme ve uzman yönlendirme akışları sunar.

**Ödeme modeli:** Web'de Stripe (one-time checkout), Mobile'da RevenueCat + Apple IAP + Google Play Billing. Free tier yok — paywall zorunlu.

Canlı: https://immigrant.guru

## Üst Dizin Yapısı

```
./
├── .github/workflows/deploy.yml   # Production deploy (SSH + PM2 + git archive)
├── .do/                            # DigitalOcean konfig
└── Immigrant AI/                   # ← Asıl monorepo kökü
    ├── apps/
    │   ├── api/        # FastAPI (Python 3.12+)
    │   ├── web/        # Next.js App Router (React 19, TS, next-intl i18n)
    │   ├── mobile/     # Expo SDK 54 (iOS + Android, TS)
    │   └── worker/     # Python async background worker
    ├── packages/
    │   ├── docs/       # Mimari + backlog dokümanları
    │   └── data/       # us_visa_kb (bilgi tabanı verisi)
    ├── visa-intelligence/   # Vize veri pipeline'ı
    ├── infra/docker/   # Service Dockerfile'ları
    ├── scripts/        # backup-db.sh vb.
    ├── docs/qa/        # QA notları
    ├── docker-compose.yml
    ├── ecosystem.config.cjs  # PM2 production config
    └── Makefile
```

> **Önemli:** Kod `Immigrant AI/` alt dizininde. Deploy script `git archive` ile bu alt dizini sunucuya düz yapıyla kopyalar — yani prod sunucuda `apps/` doğrudan `/opt/app/immigrant-guru/apps/` altındadır, `Immigrant AI/apps/` değil.

## Teknoloji Yığını

| Alan | Teknoloji |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5.8, Tailwind 3.4, next-intl 4.9 (i18n), Zod, Vitest, Playwright |
| Mobile | Expo SDK 54, React Native 0.76, Expo Router 6, NativeWind, TanStack Query, Zustand, RevenueCat (react-native-purchases 8) |
| Backend | FastAPI 0.115+, SQLAlchemy 2.0 (async), Alembic, Pydantic 2, asyncpg, PyJWT[crypto], pwdlib[argon2] |
| Worker | Python 3.12+, SQLAlchemy async, Redis (kuyruk tüketici) |
| Altyapı | Postgres 16, Redis 7, Docker Compose (lokal), PM2 (prod), Nginx (prod) |
| AI | OpenAI (Structured Outputs), gpt-4o-mini default |

## Gereksinimler

- Node.js 20+, npm 10+
- Python 3.12+
- Docker + Docker Compose

## Hızlı Komutlar

Çalışma dizini: `Immigrant AI/`

```bash
make infra-up        # postgres + redis (docker compose)
make infra-down
make infra-logs

make dev-web         # Next.js :3000
make dev-api         # uvicorn :8000 (--reload)
make dev-worker      # python -m app.main

make test-api        # pytest (apps/api)
```

Web ek komutları (`apps/web`):
```bash
npm run build
npm run lint
npm run typecheck
npm run test          # vitest
npm run test:e2e      # playwright (build dahil)
npm run contract:test # src/contracts vitest
```

## Backend (`apps/api`) — Kritik Noktalar

**Ana dosyalar**
- `app/main.py` — uygulama bootstrap, middleware stack
- `app/api/router.py` — tüm router mount noktaları
- Domain klasörleri: `app/domains/{admin,ai,auth,billing,cases,i18n,knowledge,profile,users}`
- Servis klasörleri: `app/services/{ai,auth,cases,documents,knowledge,profile,shared}`

**Middleware zinciri** (main.py'de):
1. CORSMiddleware
2. **RateLimitMiddleware** (Redis sliding-window) — auth/billing/ai/documents için özel limitler, global 300/60s
3. Body size limit (10 MB, belge yükleme hariç)
4. Request-ID + structured logging

**Auth yöntemleri** (`POST /auth/...`):
- `email/code/request` + `email/code/verify` — passwordless email-code (OTP)
- `google` — Google ID token doğrulama (`PyJWT[crypto]` ile)
- `apple` — Apple identity token doğrulama (`PyJWT[crypto]` ile)
- `login`, `register`, `password-reset` — klasik email/password

> **Önemli:** `PyJWT[crypto]` paketi zorunlu. Google ve Apple token'larını doğrulamak için RS256 algoritmayı gerektirir; `pyjwt` tek başına yetmez.

**Zorunlu env değişkenleri:**
```
JWT_SECRET_KEY          # prod/staging'de default değerse API başlamaz
DATABASE_URL
REDIS_URL
LOCAL_STORAGE_ROOT
DOCUMENT_PROCESSING_QUEUE_NAME
GOOGLE_OAUTH_CLIENT_IDS  # virgülle ayrılmış (web, iOS, Android)
APPLE_OAUTH_CLIENT_IDS   # Service ID (web) + Bundle ID (mobile)
REVENUECAT_WEBHOOK_SECRET
```

**AI entegrasyonu**: `POST /api/v1/ai/strategy` — kullanıcı profili + case context → OpenAI Structured Outputs → tipli strateji.
```
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

**Billing endpoints:**
- `GET  /billing/plans` — plan listesi
- `GET  /billing/status` — kullanıcı plan durumu
- `POST /billing/checkout` — Stripe Checkout Session oluştur (web)
- `POST /billing/verify-upgrade` — Stripe session polleyen endpoint (redirect sonrası)
- `POST /billing/webhook` — Stripe webhook (web ödemeleri)
- `POST /billing/revenuecat/webhook` — RevenueCat webhook (mobile IAP)

**Push notifications**: `POST /users/push-token` — Expo push token kaydı.

**Migrations**: model değişince `alembic revision --autogenerate -m "..."` + `alembic upgrade head`.

**Kod kalitesi**: ruff (line-length 100, select=["F"]), mypy (strict'e yakın).

## Frontend (`apps/web`) — Kritik Noktalar

**i18n (next-intl):** Tüm rotalar `[locale]/` altında. Routing: `src/i18n/routing.ts`, request config: `src/i18n/request.ts`, navigation: `src/i18n/navigation.ts`. Middleware: `src/proxy.ts`.

**App Router rotaları** (`src/app/[locale]/`):
- `analysis`, `best-countries`, `compare`, `dashboard/{analysis,cases,profile,admin}`, `forgot-password/{code,password}`, `move-to`, `onboarding`, `pricing`, `privacy`, `score`, `sign-in/{code,password}`, `sign-up`, `terms`, `tools`, `visa`

**Auth yöntemleri** (web):
- Email + şifre (klasik)
- Passwordless email-code (OTP)
- Sign in with Google
- Sign in with Apple

**Componentler:** `src/components/{analysis,analytics,auth,dashboard,growth,home,layout,mobile,onboarding,providers,seo,ui}`

**API istemcileri:** `src/lib/*-client.ts` (ai, analysis, auth, billing, case, comparison, copilot, dashboard, document, profile, score, simulation, timeline, workspace, admin)

**Paywall mantığı:** Free tier yok. Onboarding sonunda paywall zorunlu. Analysis sayfası canceled checkout sonrası mevcut tier ve altını gizler. `dashboard/analysis` sayfası dashboard layout içinde embed edilir (ayrı sayfa değil).

**SEO:** `src/lib/seo.ts`, `robots.ts`, `sitemap.ts`.

## Mobile (`apps/mobile`) — Kritik Noktalar

**Stack:** Expo SDK 54, Expo Router 6, NativeWind, TanStack Query, Zustand.

**Bundle IDs:** iOS + Android: `guru.immigrant.app`. Scheme: `immigrantguru`.

**Apple bilgileri:**
- Team ID: `XV5L4GC6PY`
- App Store Connect App ID: `6763850282`
- Associated domains: `applinks:immigrant.guru`
- Privacy manifest + Sign in with Apple doğrulandı.

**Expo:** EAS project ID `app.config.ts`'de kayıtlı. New architecture (`newArchEnabled: true`).

**Dosya yapısı (`app/`):**
```
(auth)/    sign-in.tsx, sign-up.tsx, email-code.tsx, forgot-password.tsx, reset-password.tsx, sign-in-password.tsx, verify.tsx
(public)/  landing page
(tabs)/    index.tsx (dashboard), analysis.tsx, best-countries.tsx, settings.tsx
analysis/  analysis flow screens
onboarding.tsx
paywall.tsx
visa/
move-to/
```

**Auth akışı:** Email-first lookup → şifreli giriş veya magic code (OTP). Google OAuth + Apple Sign In. Onboarding tamamlanmadan dashboard açılmaz; onboarding hemen auth sonrası tetiklenir.

**Ödeme (RevenueCat):** `react-native-purchases` + `react-native-purchases-ui` v8. Stripe app içinde YOK (Apple/Google kuralı). Ürün ID'leri: `starter_monthly`, `plus_monthly`, `immigrant_premium_monthly`. RevenueCat webhook → `POST /billing/revenuecat/webhook` → `user.plan` güncellenir.

**Push:** `expo-notifications`; token backend'e `POST /users/push-token` ile kaydedilir.

**Deep links:** `https://immigrant.guru/app/reset-password`, `/app/verify`. Apple AASA + Android assetlinks web tarafında serve edilir.

**Env değişkenleri (`.env`):**
```
EXPO_PUBLIC_RC_IOS_KEY=appl_...
EXPO_PUBLIC_RC_ANDROID_KEY=goog_...
EXPO_PUBLIC_API_URL=https://immigrant.guru/api/v1
```

**Build:**
```bash
eas build --platform ios --profile production
eas build --platform android --profile production
npm run submit:ios
npm run submit:android
```

**App Store ürünleri:** `starter_monthly`, `plus_monthly`, `immigrant_premium_monthly` — RevenueCat'teki ID'lerle birebir eşleşmeli.

Detaylar: [apps/mobile/SETUP.md](Immigrant%20AI/apps/mobile/SETUP.md)

## Worker (`apps/worker`)

Redis kuyruğundan belge işleme işlerini tüketir. `DOCUMENT_PROCESSING_MAX_RETRIES` ile retry sayısı kontrol edilir. API ile aynı DB/Redis'e bağlanır.

## Production Deploy

Tetikleyici: `main`'e push → GitHub Actions → `.github/workflows/deploy.yml`.

**Akış:**
1. Dependency audit (npm audit + pip-audit, non-blocking)
2. SSH ile DigitalOcean droplet'a bağlan (root@DROPLET_IP)
3. Stripe live keys → `apps/api/.env` dosyasına `sed` ile yaz
4. `git reset --hard origin/main`
5. `git archive HEAD "Immigrant AI/" | tar -x --strip-components=1` → düzleştir
6. `apps/web/src/` temizle → `npm ci && npm run build` (NEXT_PUBLIC_GA_ID ile)
7. `alembic upgrade head` (API)
8. `pip install -e .` (api + worker)
9. `pm2 reload ecosystem.config.cjs --update-env && pm2 save`
10. Health check: `127.0.0.1:3000` + `127.0.0.1:8000/api/v1/health`

**GitHub Secrets (zorunlu):**
```
DROPLET_IP
SSH_PRIVATE_KEY
STRIPE_LIVE_SECRET_KEY
STRIPE_LIVE_PUBLISHABLE_KEY
STRIPE_LIVE_STARTER_PRICE_ID
STRIPE_LIVE_PLUS_PRICE_ID
STRIPE_LIVE_PREMIUM_PRICE_ID
STRIPE_LIVE_WEBHOOK_SECRET
```

**PM2 apps** (ecosystem.config.cjs): `web` (Next start :3000), `api` (uvicorn 2 worker :8000), `worker` (python -m app.main). Loglar `/var/log/immigrant/`.

**Deploy'a dokunurken dikkat:** Dizin adı boşluk içeriyor (`Immigrant AI`). `REPO` değişkeni + `git archive` yaklaşımı bu yüzden. Geçmişte `if [ -d "Immigrant AI" ]` bile kırılmalar yaşattı; `find` veya `git archive --strip-components=1` kullan.

## Gözlemlenen Proje Kuralları

- **Paid-only:** Free tier yok, dokunma. Paywall zorunlu.
- **Mobile ödemesi RevenueCat:** Stripe mobile'da yasak (Apple/Google kuralı).
- **PyJWT[crypto]:** Google/Apple OAuth için zorunlu; sadece `pyjwt` çalışmaz.
- **My Analysis** dashboard layout içinde render edilir (`/dashboard/analysis`).
- **i18n:** Web tüm rotaları `[locale]/` altında, next-intl 4.9 ile.
- **Logo:** wordmark her yerde, `mix-blend-multiply` ile beyaz arka plan gizlenir.
- **Onboarding:** Auth sonrası zorunlu; tamamlanmadan dashboard açılmaz.
- **Security hardening aktif:** rate limiting, Redis sliding-window, security headers.
- **GA:** `NEXT_PUBLIC_GA_ID=G-4WPW4Z3SY1` (build sırasında inject).

## Claude Code Oturum Kuralları (bu proje için)

1. **Önce CLAUDE.md**, sonra kod.
2. Kod `Immigrant AI/` altında — komutlar ve path'ler buna göre.
3. Deploy akışı `git archive` ile path-düzleştirme yapıyor — bu asimetriyi bozma.
4. 200 satırdan uzun dosyalarda Grep + offset/limit Read; tam okuma yapma.
5. `.env`, credentials, `storage/`, `google-service-account.json`, büyük PDF/PPTX **commit edilmez**.
6. Migration gerektiren model değişikliklerinden sonra alembic revision üret.
7. Prod'da health check'ler yeşil olmadan deploy başarılı sayılmaz.
8. `pm2 reload` her zaman `--update-env` ile yapılır.
9. Mobile ödeme her zaman RevenueCat üzerinden; Stripe sadece web için.

## Ek Dokümanlar

- [Immigrant AI/README.md](Immigrant%20AI/README.md) — kurulum detayları
- [Immigrant AI/apps/mobile/SETUP.md](Immigrant%20AI/apps/mobile/SETUP.md) — mobil kurulum
- [Immigrant AI/packages/docs/architecture.md](Immigrant%20AI/packages/docs/architecture.md) — mimari
- [Immigrant AI/packages/docs/implementation-backlog.md](Immigrant%20AI/packages/docs/implementation-backlog.md)
- [Immigrant AI/packages/docs/strategic-growth-todo.md](Immigrant%20AI/packages/docs/strategic-growth-todo.md)
- `ARCHITECTURE.pdf`, `ARCHITECTURE-5-SERVER.pdf` (mimari diyagramlar)

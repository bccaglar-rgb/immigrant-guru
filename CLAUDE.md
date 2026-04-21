# CLAUDE.md — Immigrant Guru / Immigrant AI

Bu dosya, bu depo üzerinde çalışacak Claude Code oturumları için yönlendirici referanstır. Koda dokunmadan önce okunmalıdır.

## Proje Özeti

**Immigrant AI** (ürün adı: **Immigrant Guru**), AI tabanlı bir göçmenlik karar ve aksiyon platformudur. Kullanıcıya profiline uygun vize stratejileri üretir, ülke karşılaştırması yapar, belge yükleme/işleme ve uzman yönlendirme akışları sunar. Ürün **paid-only** (Free tier kaldırıldı); paywall zorunlu, ödeme sonrası plan yükseltmesi aktif.

Canlı: https://immigrant.guru

## Üst Dizin Yapısı

```
./
├── .github/workflows/deploy.yml   # Production deploy (SSH + PM2)
├── .do/                            # DigitalOcean konfig
└── Immigrant AI/                   # ← Asıl monorepo kökü
    ├── apps/
    │   ├── api/        # FastAPI (Python 3.12+)
    │   ├── web/        # Next.js App Router (React 19, TS)
    │   └── worker/     # Python async background worker
    ├── packages/
    │   ├── docs/       # Mimari + backlog dokümanları
    │   └── data/       # us_visa_kb (bilgi tabanı verisi)
    ├── visa-intelligence/   # Vize veri pipeline'ı (raw/normalized/schemas/prompts)
    ├── infra/docker/   # Service Dockerfile'ları
    ├── docs/qa/        # QA notları
    ├── docker-compose.yml
    ├── ecosystem.config.cjs  # PM2 production config
    └── Makefile
```

> **Önemli:** Kod `Immigrant AI/` alt dizininde. Deploy script `git archive` ile bu alt dizini sunucuya düz yapıyla kopyalar — yani prod sunucuda `apps/` doğrudan `/opt/app/immigrant-guru/apps/` altındadır, `Immigrant AI/apps/` değil.

## Teknoloji Yığını

| Alan | Teknoloji |
|---|---|
| Frontend | Next.js (latest), React 19, TypeScript 5.8, Tailwind 3.4, Zod, Vitest, Playwright |
| Backend | FastAPI 0.115+, SQLAlchemy 2.0 (async), Alembic, Pydantic 2, asyncpg, PyJWT, pwdlib[argon2] |
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
- [apps/api/app/main.py](Immigrant%20AI/apps/api/app/main.py) — uygulama bootstrap, middleware stack
- [apps/api/app/api/router.py](Immigrant%20AI/apps/api/app/api/router.py) — tüm router mount noktaları
- Domain klasörleri: `app/domains/{admin,ai,auth,billing,cases,knowledge,profile}`
- Servis klasörleri: `app/services/{ai,auth,cases,documents,knowledge,profile,shared}`

**Middleware zinciri** (main.py'de):
1. CORSMiddleware
2. **RateLimitMiddleware** (Redis sliding-window) — auth/billing/ai/documents için özel limitler, global catch-all 300/60s
3. Body size limit (10 MB, belge yükleme hariç)
4. Request-ID + structured logging

**Zorunlu env**: `JWT_SECRET_KEY` prod/staging'de default değerse API başlamaz (guard var). `DATABASE_URL`, `REDIS_URL`, `LOCAL_STORAGE_ROOT`, `DOCUMENT_PROCESSING_QUEUE_NAME` API ve worker arasında **uyumlu** olmak zorunda.

**AI entegrasyonu**: `POST /api/v1/ai/strategy` — kullanıcı profili + case context → OpenAI Structured Outputs → tipli strateji.
```
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

**Migrations**: model değişince `alembic revision --autogenerate -m "..."` + `alembic upgrade head`.

**Kod kalitesi**: ruff (line-length 100, select=["F"]), mypy (strict'e yakın; alembic/tests/scripts hariç; bazı modüller `ignore_errors`).

## Frontend (`apps/web`) — Kritik Noktalar

- App Router: `src/app/{analysis,best-countries,compare,dashboard,onboarding,pricing,score,tools,visa,visa-match,move-to,sign-in,sign-up,forgot-password}`
- Componentler: `src/components/{analysis,analytics,auth,dashboard,growth,home,layout,mobile,onboarding,providers,seo,ui}`
- API istemcileri: `src/lib/*-client.ts` (ai, analysis, auth, billing, case, comparison, copilot, dashboard, document, profile, score, simulation, timeline, workspace, admin)
- Tip sözleşmeleri: `src/contracts/` (backend ile kontrat testleri)
- i18n: `src/lib/i18n.ts` (+ test)
- SEO: `robots.ts`, `sitemap.ts`

**Paywall mantığı**: Free tier yok. Onboarding sonunda "Go to Dashboard" butonu yok — paywall zorunlu. Analysis sayfası canceled checkout sonrası mevcut tier ve altını gizler.

## Worker (`apps/worker`)

Redis kuyruğundan belge işleme işlerini tüketir. `DOCUMENT_PROCESSING_MAX_RETRIES` ile retry sayısı kontrol edilir. API ile aynı DB/Redis'e bağlanır.

## Production Deploy

Tetikleyici: `main`'e push (GitHub Actions → `.github/workflows/deploy.yml`).

Akış:
1. SSH ile DigitalOcean droplet'a bağlan (root@DROPLET_IP)
2. `/opt/app/immigrant-guru`'da `git reset --hard origin/main`
3. `git archive HEAD "Immigrant AI/" | tar -x --strip-components=1` → alt dizini düzleştir
4. `npm ci && npm run build` (web)
5. `.venv` içinde `pip install -e .` (api + worker)
6. `pm2 reload ecosystem.config.cjs --update-env && pm2 save`
7. Health check: `127.0.0.1:3000` + `https://immigrant.guru/api/v1/health`

**PM2 apps** (ecosystem.config.cjs): `web` (Next start :3000), `api` (uvicorn 2 worker :8000), `worker` (python -m app.main). Loglar `/var/log/immigrant/`.

**Deploy'a dokunurken dikkat**: Dizin adı boşluk içeriyor (`Immigrant AI`). Geçmişte bundan kaynaklı kırılmalar yaşandı (`REPO` değişkeni kullanımı, `git archive` yaklaşımı bu yüzden).

## Gözlemlenen Proje Kuralları

- **Paid-only plan**: Free tier kaldırıldı, dokunma.
- **Roadmap/docs sadece Plus planda**: analysis/premium sayfalarında tier gating var.
- **My Analysis, dashboard layout içinde** render edilir (ayrı sayfa değil).
- **Logo**: wordmark her yerde logo ikonunun yanında; arka plandaki beyaz kutu `mix-blend-multiply` ile gizlenir.
- **Security hardening aktif**: rate limiting, password reset Redis üzerinden, security headers, test suite production hardening'de eklendi.
- Analysis sayfası canceled checkout banner'ı **kaldırıldı**; upsell planları mevcut tier'a göre filtrelenir.

## Claude Code Oturum Kuralları (bu proje için)

1. **Önce CLAUDE.md**, sonra kod.
2. Kod `Immigrant AI/` altında — komutlar ve path'ler buna göre.
3. Deploy akışı `git archive` ile path-düzleştirme yapıyor — bu asimetriyi bozma.
4. 200 satırdan uzun dosyalarda Grep + offset/limit Read; tam okuma yapma.
5. `.env`, credentials, `storage/` içeriği, büyük PDF/PPTX dosyaları **commit edilmez**.
6. Migration gerektiren model değişikliklerinden sonra alembic revision üret.
7. Prod'da `immigrant.guru` ve `/api/v1/health` health check'leri yeşil olmadan deploy başarılı sayılmaz.
8. Sunucu üstünde `pm2 reload` her zaman `--update-env` ile yapılır.

## Ek Dokümanlar

- [Immigrant AI/README.md](Immigrant%20AI/README.md) — kurulum detayları
- [Immigrant AI/packages/docs/architecture.md](Immigrant%20AI/packages/docs/architecture.md) — mimari
- [Immigrant AI/packages/docs/implementation-backlog.md](Immigrant%20AI/packages/docs/implementation-backlog.md)
- [Immigrant AI/packages/docs/strategic-growth-todo.md](Immigrant%20AI/packages/docs/strategic-growth-todo.md)
- [Immigrant AI/AUDIT_REPORT.md](Immigrant%20AI/AUDIT_REPORT.md)
- `ARCHITECTURE.pdf`, `ARCHITECTURE-5-SERVER.pdf` (mimari diyagramlar)

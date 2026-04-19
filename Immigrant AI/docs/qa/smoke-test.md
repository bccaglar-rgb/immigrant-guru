# Smoke Test — Post-Deploy (5–10 dakika)

Her deployment sonrası bu listeyi sırayla çalıştır.  
Risk sıralamasına göre sıralanmıştır: **Critical → High → Medium**.

---

## CRITICAL — Sistem çalışmıyor mu?

| # | Kontrol | Yöntem | Beklenen | Risk |
|---|---------|--------|----------|------|
| S-01 | API health endpoint | `GET /api/v1/health` | HTTP 200, `{"status":"ok"}` | 🔴 Critical |
| S-02 | Frontend ana sayfa yüklenebiliyor | Browser → `https://immigrant.guru` | HTTP 200, içerik görünür | 🔴 Critical |
| S-03 | SSL sertifikası geçerli | Browser adres çubuğu / `curl -I https://immigrant.guru` | Kilit ikonu, sertifika valid | 🔴 Critical |
| S-04 | HTTP → HTTPS redirect | `curl -I http://immigrant.guru` | 301/302 → https:// | 🔴 Critical |
| S-05 | Register endpoint çalışıyor | `POST /api/v1/auth/register` (test email) | HTTP 201, token döner | 🔴 Critical |
| S-06 | Login endpoint çalışıyor | `POST /api/v1/auth/login` | HTTP 200, access_token döner | 🔴 Critical |
| S-07 | DB migration başarılı | API logları / `alembic current` | Herhangi bir migration hatası yok | 🔴 Critical |

---

## HIGH — Gelir kaybı riski

| # | Kontrol | Yöntem | Beklenen | Risk |
|---|---------|--------|----------|------|
| S-08 | Stripe checkout başlatılabiliyor | `POST /api/v1/billing/checkout` (auth token ile) | checkout_url döner | 🟠 High |
| S-09 | Billing status endpoint | `GET /api/v1/billing/status` (auth token ile) | HTTP 200, plan bilgisi | 🟠 High |
| S-10 | AI profile-analysis endpoint | `GET /api/v1/ai/profile-analysis` (auth token ile) | HTTP 200 veya auth hata değil 500 | 🟠 High |
| S-11 | Stripe webhook erişilebilir | Stripe Dashboard → Webhook health | Son 24 saatte delivery failure yok | 🟠 High |
| S-12 | /pricing sayfası tüm planları gösteriyor | Browser → `/pricing` | Starter $19, Plus $29, Premium $49 | 🟠 High |

---

## HIGH — Auth & user akışı

| # | Kontrol | Yöntem | Beklenen | Risk |
|---|---------|--------|----------|------|
| S-13 | /me endpoint çalışıyor | `GET /api/v1/auth/me` (geçerli token) | HTTP 200, user objesi | 🟠 High |
| S-14 | Geçersiz token reddediliyor | `GET /api/v1/auth/me` (bozuk token) | HTTP 401 | 🟠 High |
| S-15 | /dashboard unauthenticated redirect | Browser → `/dashboard` (cookie yok) | /sign-in yönlendirmesi | 🟠 High |
| S-16 | /analysis unauthenticated redirect | Browser → `/analysis` (cookie yok) | /sign-in yönlendirmesi | 🟠 High |

---

## MEDIUM — Operasyonel

| # | Kontrol | Yöntem | Beklenen | Risk |
|---|---------|--------|----------|------|
| S-17 | Redis bağlantısı | API health (redis sub-check) | `redis: ok` | 🟡 Medium |
| S-18 | Rate limit çalışıyor | 20 hızlı istek → `/api/v1/auth/login` | 429 döner | 🟡 Medium |
| S-19 | Sitemap erişilebilir | `GET https://immigrant.guru/sitemap.xml` | HTTP 200, XML | 🟡 Medium |
| S-20 | robots.txt erişilebilir | `GET https://immigrant.guru/robots.txt` | HTTP 200 | 🟡 Medium |
| S-21 | Security headers mevcut | `curl -I https://immigrant.guru` | `x-frame-options: DENY`, `x-content-type-options: nosniff` | 🟡 Medium |
| S-22 | Hata sayfaları (404) çalışıyor | Browser → `/sayfa-yok` | 404 sayfası, 500 değil | 🟡 Medium |
| S-23 | Admin panel korumalı | Browser → `/dashboard/admin` (normal user) | 403 veya redirect | 🟡 Medium |
| S-24 | Forgot-password email test | Gerçek email ile `POST /api/v1/auth/forgot-password` | API 200 + email gönderildi | 🟡 Medium |

---

## Smoke test sonucu

- **Tüm S-01–S-07 geçti** → Deploy güvenli, devam et  
- **Herhangi biri başarısız** → Rollback + inceleme  
- **S-08–S-16'dan herhangi biri başarısız** → Acil hot-fix, rollback değerlendiriliyor  
- **S-17–S-24'ten başarısız** → P1 ticket aç, kullanıcıları bilgilendir

---

## Yardımcı cURL komutları

```bash
# Health check
curl -s https://immigrant.guru/api/v1/health | jq .

# Register (test user)
curl -X POST https://immigrant.guru/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke+test@example.com","password":"SmokePwd123!"}'

# Login
curl -X POST https://immigrant.guru/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke+test@example.com","password":"SmokePwd123!"}'

# Rate limit test (should 429 after 10 attempts in 60s)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://immigrant.guru/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"wrong@example.com","password":"wrong"}'
done

# Security headers
curl -s -I https://immigrant.guru | grep -i -E "x-frame|content-type-options|strict-transport"

# Sitemap
curl -s -o /dev/null -w "%{http_code}" https://immigrant.guru/sitemap.xml
```

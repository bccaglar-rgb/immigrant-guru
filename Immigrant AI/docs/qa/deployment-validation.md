# Deployment Validation — Go / No-Go Checklist

Her production release öncesi ve sonrası bu listeyi tamamla.

---

## PRE-DEPLOY (Kodu push etmeden önce)

| # | Kontrol | Sorumlu | Status |
|---|---------|---------|--------|
| P-01 | `.env.production` değerleri güncel ve doğru | DevOps | ☐ |
| P-02 | `JWT_SECRET_KEY` ≥ 32 char, default değil | DevOps | ☐ |
| P-03 | `STRIPE_WEBHOOK_SECRET` set | DevOps | ☐ |
| P-04 | `STRIPE_STARTER/PLUS/PREMIUM_PRICE_ID` set | DevOps | ☐ |
| P-05 | `RESEND_API_KEY` set | DevOps | ☐ |
| P-06 | `CORS_ORIGINS` sadece `https://immigrant.guru` içeriyor | DevOps | ☐ |
| P-07 | `APP_ENV=production` set | DevOps | ☐ |
| P-08 | DB migration dosyaları gözden geçirildi | Dev | ☐ |
| P-09 | Breaking changes varsa rollback planı hazır | Dev | ☐ |
| P-10 | Smoke test önceki deploydan geçti | QA | ☐ |

---

## DEPLOY

| # | Kontrol | Yöntem | Status |
|---|---------|--------|--------|
| D-01 | Git tag / release oluşturuldu | `git tag v1.x.x` | ☐ |
| D-02 | Deploy scripti / CI tetiklendi | CI/CD dashboard | ☐ |
| D-03 | Yeni container'lar ayağa kalktı | `pm2 status` / `docker ps` | ☐ |
| D-04 | Alembic migration başarıyla çalıştı | Uygulama logları | ☐ |
| D-05 | Eski process'ler graceful shutdown yaptı | Loglar | ☐ |

---

## POST-DEPLOY — Sistem Sağlığı

| # | Kontrol | Komut / Yöntem | Beklenen | Status |
|---|---------|----------------|----------|--------|
| V-01 | API health endpoint | `GET /api/v1/health` | `{"status":"ok"}` | ☐ |
| V-02 | Frontend yükleniyor | `curl -s -o /dev/null -w "%{http_code}" https://immigrant.guru` | 200 | ☐ |
| V-03 | SSL geçerli (≥ 30 gün kalan) | `echo | openssl s_client -connect immigrant.guru:443 2>/dev/null | openssl x509 -noout -dates` | notAfter > 30 gün | ☐ |
| V-04 | Database bağlantısı | API health sub-check | `db: ok` | ☐ |
| V-05 | Redis bağlantısı | API health sub-check | `redis: ok` | ☐ |
| V-06 | Loglar akıyor | `pm2 logs` / journal | Hata yok, request logları görünür | ☐ |
| V-07 | Worker process çalışıyor | `pm2 status` / `systemctl status` | running | ☐ |

---

## POST-DEPLOY — Kullanıcı Akışları

| # | Senaryo | Yöntem | Beklenen | Status |
|---|---------|--------|----------|--------|
| U-01 | Yeni kayıt | Browser / cURL | Başarılı + welcome email | ☐ |
| U-02 | Login | Browser | Dashboard'a yönlendirme | ☐ |
| U-03 | Password reset isteği | Browser | Email gönderildi mesajı | ☐ |
| U-04 | Pricing sayfası | Browser | 3 plan görünür, fiyatlar doğru | ☐ |
| U-05 | Checkout başlatma (Starter) | Browser (login + tıkla) | Stripe checkout sayfasına yönlendirme | ☐ |
| U-06 | Analysis sayfası (free user) | Browser | Locked content + upsell görünür | ☐ |
| U-07 | Onboarding akışı | Browser | 4 adım, tamamlanabilir | ☐ |

---

## POST-DEPLOY — Güvenlik

| # | Kontrol | Komut | Beklenen | Status |
|---|---------|-------|----------|--------|
| SEC-01 | Security headers mevcut | `curl -sI https://immigrant.guru \| grep -i x-frame` | `DENY` | ☐ |
| SEC-02 | Rate limit aktif | 15 hızlı login → 429 | ✓ | ☐ |
| SEC-03 | Admin endpoint korumalı | Normal user ile `GET /api/v1/admin/users` | 403 | ☐ |
| SEC-04 | CORS sadece izinli origin | `curl -H "Origin: https://evil.com" /api/v1/health` | evil.com'a credential dönmemeli | ☐ |

---

## ROLLBACK KRİTERLERİ

Aşağıdakilerden **herhangi biri** gerçekleşirse → Immediate rollback:

- [ ] `/api/v1/health` 1 dakikadan fazla 500 veya timeout
- [ ] Login/Register %5+ hata oranı (son 5 dk)
- [ ] Stripe checkout session oluşturulamıyor
- [ ] DB migration başarısız / veri kaybı riski
- [ ] Tüm kullanıcılar 401 alıyor (JWT issue)
- [ ] Frontend HTTP 500 dönüyor

### Rollback komutu
```bash
# PM2 ile önceki release'e dön
pm2 reload ecosystem.config.cjs --env production

# Veya git ile önceki commit'e dön
git revert HEAD --no-commit
git push origin main
# Deploy scripti tetikle
```

---

## RELEASE NOTES ŞABLONU

```
## Release vX.X.X — YYYY-MM-DD

### Değişiklikler
- ...

### Migration
- [ ] Yok
- [ ] var: <migration adı>

### Rollback planı
- <adımlar>

### Test edildi
- [ ] Smoke test ✓
- [ ] Staging ✓
- [ ] Deployment validation ✓
```

# Immigrant Guru — Master Test Plan

> Durum: Production launch öncesi  
> Kapsam: Frontend, Backend, Auth, AI, Billing, Security, Performance

---

## 1. TEST STRATEJİSİ

### Genel Yaklaşım

| Katman | Araç | Frekans |
|--------|------|---------|
| Unit (backend) | pytest | Her PR |
| Unit (frontend) | Vitest | Her PR |
| Integration (API) | pytest + httpx | Her PR |
| E2E | Playwright | Her deployment |
| Security | Manuel + curl | Her release |
| Performance | k6 | Haftalık |
| Smoke | Manuel + cURL | Her deployment |

### Öncelik Sırası

- **P0** — Sistem çalışmıyor (auth, billing, DB)  
- **P1** — Gelir kaybı (checkout, AI analysis, onboarding)  
- **P2** — UX bozuk (responsive, form validation)  
- **P3** — Nice-to-have (i18n, admin, SEO edge cases)

---

## 2. AUTH SERVİS TEST CASE'LERİ

| Test ID | Senaryo | Ön koşul | Beklenen | Priority |
|---------|---------|----------|----------|----------|
| AUTH-01 | Başarılı kayıt | Boş DB | 201 + token + profile | P0 |
| AUTH-02 | Duplicate email ile kayıt | AUTH-01 yapıldı | 409 Conflict | P0 |
| AUTH-03 | Geçerli email formatı validasyonu | - | Geçersiz email → 422 | P0 |
| AUTH-04 | Şifre < 8 karakter | - | 422 Unprocessable | P0 |
| AUTH-05 | Başarılı login | AUTH-01 | 200 + access_token | P0 |
| AUTH-06 | Yanlış şifre | AUTH-01 | 401 Unauthorized | P0 |
| AUTH-07 | Var olmayan email ile login | - | 401 Unauthorized | P0 |
| AUTH-08 | /me geçerli token ile | AUTH-05 | 200 + user object | P0 |
| AUTH-09 | /me geçersiz token ile | - | 401 Unauthorized | P0 |
| AUTH-10 | /me süresi dolmuş token | - | 401 Unauthorized | P0 |
| AUTH-11 | Forgot password bilinen email | AUTH-01 | 200 (generic msg) | P1 |
| AUTH-12 | Forgot password bilinmeyen email | - | 200 (generic msg — email reveal etme) | P1 |
| AUTH-13 | Verify reset code doğru | AUTH-11 | {"verified":true} | P1 |
| AUTH-14 | Verify reset code yanlış | AUTH-11 | 400 | P1 |
| AUTH-15 | Reset code 5 denemeden sonra | AUTH-11 | 429 | P1 |
| AUTH-16 | Reset code süresi dolmuş (>15 dk) | AUTH-11 (bekle) | 400 expired | P1 |
| AUTH-17 | Brute force login (10+ hızlı istek) | - | 429 Too Many Requests | P0 |
| AUTH-18 | Forgot password hızlı tekrar (5+) | - | 429 rate limit | P0 |
| AUTH-19 | Admin olmayan /admin endpoint'e | Normal user token | 403 Forbidden | P0 |
| AUTH-20 | Token olmadan korumalı endpoint | - | 401 Unauthorized | P0 |

---

## 3. BİLLİNG TEST CASE'LERİ

| Test ID | Senaryo | Ön koşul | Beklenen | Priority |
|---------|---------|----------|----------|----------|
| BIL-01 | Checkout session oluştur (starter) | Login, Stripe config | checkout_url döner | P0 |
| BIL-02 | Checkout session oluştur (plus) | Login, Stripe config | checkout_url döner | P0 |
| BIL-03 | Checkout session oluştur (premium) | Login, Stripe config | checkout_url döner | P0 |
| BIL-04 | Free plan ile checkout | Login | 400 Invalid plan | P0 |
| BIL-05 | Geçersiz plan adı ile checkout | Login | 400 | P0 |
| BIL-06 | Auth olmadan checkout | - | 401 | P0 |
| BIL-07 | Billing status (free user) | Login | {"plan":"free","is_premium":false} | P1 |
| BIL-08 | Billing status (paid user) | Upgrade sonrası | {"is_premium":true} | P0 |
| BIL-09 | Stripe webhook checkout.session.completed | Valid signature + payload | Plan upgrade, email gönderildi | P0 |
| BIL-10 | Stripe webhook geçersiz signature | - | 400 | P0 |
| BIL-11 | Duplicate webhook event | Aynı event_id tekrar | "duplicate_ignored" | P1 |
| BIL-12 | Webhook Redis down iken | Redis kapalı | Event işlendi (fail-open) | P1 |
| BIL-13 | Webhook eksik user_id metadata | - | Warning log, 200 döner | P1 |
| BIL-14 | Checkout 429 rate limit | 15 hızlı istek | 429 | P0 |

---

## 4. AI ENDPOİNT TEST CASE'LERİ

| Test ID | Senaryo | Beklenen | Priority |
|---------|---------|----------|----------|
| AI-01 | Profile analysis — profil dolu | 200 + structured result | P0 |
| AI-02 | Profile analysis — profil boş | 200 + generic/limited result, no crash | P0 |
| AI-03 | Profile analysis — AI provider disabled | 503 veya graceful error | P1 |
| AI-04 | Auth olmadan AI endpoint | 401 | P0 |
| AI-05 | AI rate limit (60 req/saat) | 429 sonrası | P0 |
| AI-06 | Timeout senaryosu (AI yanıt vermiyor) | 504 veya timeout error | P1 |
| AI-07 | Output JSON schema geçerli mi | Response shape validation | P1 |
| AI-08 | Çelişkili profil verisi (TR vatandaşı + TR'de çalışmak istiyor) | Mantıklı sonuç | P2 |
| AI-09 | Eksik veri farkındalığı | AI açıkça "insufficient data" der | P2 |
| AI-10 | Tutarlılık testi (aynı girdi 2 kez) | Sonuçlar büyük ölçüde tutarlı | P2 |

---

## 5. SECURITY TEST CASE'LERİ

| Test ID | Senaryo | Severity | Test Yöntemi |
|---------|---------|----------|--------------|
| SEC-01 | IDOR: user A'nın case'ine user B erişimi | Critical | `GET /api/v1/cases/{other_user_case_id}` → 403/404 |
| SEC-02 | JWT none algoritması saldırısı | Critical | `alg: none` ile token → 401 |
| SEC-03 | Brute force login | Critical | 15+ hızlı istek → 429 |
| SEC-04 | SQL Injection (email field) | Critical | `'; DROP TABLE users;--` → 422, no crash |
| SEC-05 | XSS (profil alanı) | High | `<script>alert(1)</script>` → escaped output |
| SEC-06 | Path traversal (document upload) | High | `../../../etc/passwd` filename → rejected |
| SEC-07 | Admin endpoint normal user ile | High | 403 Forbidden |
| SEC-08 | Stripe webhook forgery | Critical | Geçersiz signature → 400 |
| SEC-09 | CORS: kötü origin credentialed istek | High | `Origin: evil.com` → no CORS headers |
| SEC-10 | X-Frame-Options | Medium | `curl -I` → `DENY` |
| SEC-11 | Sensitive data log leakage | High | Loglarda JWT token / şifre yok |
| SEC-12 | Request body > 10MB | Medium | 413 Payload Too Large |
| SEC-13 | Rate limit bypass (farklı IP) | High | IP rotation testi |

---

## 6. PERFORMANS TEST REFERANSI

| Senaryo | Araç | Hedef | Threshold |
|---------|------|-------|-----------|
| 100 eş zamanlı login | k6 | p95 < 500ms | p99 < 1s |
| 500 eş zamanlı homepage | k6 | p95 < 200ms | Error rate < 1% |
| 100 eş zamanlı AI request | k6 | p95 < 5s | Error rate < 2% |
| 50 büyük dosya upload | k6 | p95 < 3s | No 500 |
| DB bağlantı havuzu | pgbench | 200 concurrent | No exhaustion |

---

## 7. REGRESSION CHECKLİST (Her Deploy)

- [ ] Homepage render (H1 görünür, CTA tıklanabilir)
- [ ] Auth akışı (register → login → /me)
- [ ] Pricing sayfası (3 plan, fiyatlar doğru)
- [ ] Onboarding (adımlar geçilebilir)
- [ ] Analysis sayfası (free user → locked görünür)
- [ ] Security headers
- [ ] Rate limiting
- [ ] 404 sayfası
- [ ] Sitemap + robots.txt

---

## 8. BUGLAR VE BİLİNEN KISITLAR

| Bug ID | Açıklama | Severity | Durum |
|--------|---------|---------|-------|
| BUG-01 | Password reset in-memory idi → Redis'e geçildi | Critical | ✅ Fixed |
| BUG-02 | Rate limiting yoktu → Redis sliding window eklendi | Critical | ✅ Fixed |
| BUG-03 | CSP header yoktu → next.config.ts'e eklendi | High | ✅ Fixed |
| BUG-04 | Plan validation string → _PAID_PLANS enum ile sertleştirildi | High | ✅ Fixed |
| BUG-05 | Email hataları sessizce yutuluyordu → loglanıyor | Medium | ✅ Fixed |
| BUG-06 | Request body size limiti yoktu → 10MB middleware eklendi | Medium | ✅ Fixed |
| BUG-07 | Webhook Redis failure → fail-open + comment eklendi | Medium | ✅ Fixed |

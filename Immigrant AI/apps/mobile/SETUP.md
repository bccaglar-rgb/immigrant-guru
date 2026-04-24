# Immigrant Guru — Mobile (Expo)

React Native app for iOS + Android. Ships via App Store + Google Play.

## Bootstrap (first run)

```bash
cd "Immigrant AI/apps/mobile"

# 1. Install deps
npm install

# 2. Copy env and fill in RevenueCat keys after creating the project in the
#    RevenueCat dashboard (https://app.revenuecat.com).
cp .env.example .env
# Edit .env:
#   EXPO_PUBLIC_RC_IOS_KEY=appl_...
#   EXPO_PUBLIC_RC_ANDROID_KEY=goog_...

# 3. Install EAS CLI globally
npm install -g eas-cli

# 4. Log in and link the project — this writes `extra.eas.projectId` to
#    app.config.ts.
eas login
eas init

# 5. (Optional, web preview in the browser)
npm run web

# 6. Dev build on a physical device (required for RevenueCat + push)
eas build --platform ios --profile development
eas build --platform android --profile development
```

## Before the first store submission

### iOS
1. Enroll in the Apple Developer Program ($99/yr) — use the same Apple ID you
   want to manage the app with.
2. Create app record in App Store Connect; bundle id `guru.immigrant.app`.
3. Create in-app purchase products matching the RevenueCat offerings:
   `starter_monthly`, `plus_monthly`, `premium_monthly`.
4. Fill `eas.json` → `submit.production.ios` (appleId, ascAppId, appleTeamId).
5. `npm run build:ios` then `npm run submit:ios`.

### Android
1. Create Google Play Console account ($25 one-time).
2. Create app; package name `guru.immigrant.app`.
3. Create in-app subscriptions mirroring iOS product IDs.
4. Download a service account JSON from Google Cloud → save as
   `./google-service-account.json` (already git-ignored).
5. `npm run build:android` then `npm run submit:android`.

### RevenueCat
1. Create project, link both iOS and Android apps.
2. Create 3 entitlements: `starter`, `plus`, `premium`.
3. Create products matching IAP IDs; attach to offerings.
4. Dashboard → Integrations → Webhooks: point to
   `https://immigrant.guru/api/v1/billing/revenuecat/webhook`.
5. Add the webhook Bearer token to the API `.env` as
   `REVENUECAT_WEBHOOK_SECRET=…` (also set in production secret store).

## Useful commands

```bash
npm run typecheck        # tsc --noEmit
npm start                # dev server (press i/a for iOS/Android)
eas update --branch production   # OTA update without store resubmission
```

## Known TODOs in this scaffold

- `app/onboarding.tsx` — port 5-step wizard from apps/web
- `app/(tabs)/best-countries.tsx` — wire dashboard data
- `app/(tabs)/compare.tsx` — 3-way country compare UI
- `app/analysis/[id].tsx` — AI strategy detail view
- `app/visa/[slug].tsx` — visa info pages
- Push notification token registration endpoint
   (`POST /users/push-token`) on the API side
- Deep links from emails (password reset, verification) — add to
  `scheme` and register in Apple Developer / Play Console
- Localized i18n — import `apps/web/messages/*.json` at build time

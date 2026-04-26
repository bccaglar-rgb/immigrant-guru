import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Expo app config for Immigrant Guru mobile.
 *
 * Bundle IDs:
 *   iOS     : guru.immigrant.app
 *   Android : guru.immigrant.app
 *
 * Runtime env (read via Constants.expoConfig.extra):
 *   API_URL              — backend base, e.g. https://immigrant.guru/api/v1
 *   REVENUECAT_IOS_KEY   — RevenueCat public key (iOS)
 *   REVENUECAT_ANDROID_KEY — RevenueCat public key (Android)
 *   SENTRY_DSN           — optional error reporting
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Immigrant Guru",
  slug: "immigrant-guru",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "immigrantguru",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#f5f5f7"
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "guru.immigrant.app",
    supportsTablet: true,
    buildNumber: "1",
    associatedDomains: ["applinks:immigrant.guru"],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSUserNotificationsUsageDescription:
        "We use notifications to alert you when your immigration analysis is ready and to remind you of upcoming plan renewals."
    },
    // Apple's Required Reason APIs declaration (mandatory since 2024).
    // Each accessed-API entry below corresponds to runtime usage by Expo /
    // RN core libraries we ship — no advertising, no tracking, no third-party
    // SDKs that fingerprint the device.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            "NSPrivacyCollectedDataTypePurposeAccountManagement"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeUserID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            "NSPrivacyCollectedDataTypePurposeAccountManagement"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeOtherUserContent",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePurchaseHistory",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        }
      ],
      NSPrivacyAccessedAPITypes: [
        {
          // expo-secure-store, async-storage — defaults DB
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"]
        },
        {
          // RN file timestamps for cached assets / debug logs
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1"]
        },
        {
          // Disk space check by RN before writing cache
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1"]
        },
        {
          // System uptime — used by RN for performance metrics
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: ["35F9.1"]
        }
      ]
    }
  },
  android: {
    package: "guru.immigrant.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f5f5f7"
    },
    permissions: ["NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "immigrant.guru", pathPrefix: "/app" }],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ]
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-localization",
    "expo-apple-authentication",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#0071e3"
      }
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        backgroundColor: "#f5f5f7",
        resizeMode: "contain"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    API_URL: process.env.EXPO_PUBLIC_API_URL ?? "https://immigrant.guru/api/v1",
    REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_RC_IOS_KEY ?? "",
    REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "",
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    // Google Sign-In OAuth client IDs from Google Cloud Console.
    // Without these, the Google button surfaces a "not configured" error.
    GOOGLE_OAUTH_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
    GOOGLE_OAUTH_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
    GOOGLE_OAUTH_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    eas: {
      projectId: "65037bf3-007f-4eb8-9c9b-60b87b2bef91"
    }
  },
  updates: {
    url: "" // filled after `eas update:configure`
  },
  runtimeVersion: {
    policy: "appVersion"
  }
});

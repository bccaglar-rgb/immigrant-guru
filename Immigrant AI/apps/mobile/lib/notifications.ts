/**
 * Push notifications bootstrap.
 *
 * Flow:
 *   1. Ask permission on first auth'd launch.
 *   2. Grab Expo push token.
 *   3. Register it with backend (POST /users/push-token) so the worker can
 *      fan out notifications (analysis ready, plan renewal, onboarding
 *      reminder, etc.).
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "./api-client";
import { deleteSecure, PUSH_TOKEN_KEY, setSecure } from "./secure-storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#0071e3"
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const result = await api
    .post("/users/push-token", {
      token,
      platform: Platform.OS,
      locale: Constants.expoConfig?.locales ? Object.keys(Constants.expoConfig.locales)[0] : undefined,
      appVersion: Constants.expoConfig?.version
    })
    .catch(() => ({ ok: false }) as const);

  if (result.ok) {
    await setSecure(PUSH_TOKEN_KEY, token);
  }

  return token;
}

export async function deregisterPushToken(token: string): Promise<void> {
  if (!token) return;
  await api.del("/users/push-token", { token }).catch(() => undefined);
  await deleteSecure(PUSH_TOKEN_KEY);
}

/**
 * Token storage — SecureStore on iOS/Android, fallback for web preview.
 *
 * SecureStore items are encrypted with the device keystore and survive app
 * reinstall on Android (via keychain) but not iOS (Apple resets the keychain
 * on reinstall).  That's fine — session will re-establish via refresh.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const memoryFallback = new Map<string, string>();

function webSupported(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

export async function setSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (webSupported()) window.localStorage.setItem(key, value);
    else memoryFallback.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function getSecure(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (webSupported()) return window.localStorage.getItem(key);
    return memoryFallback.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteSecure(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (webSupported()) window.localStorage.removeItem(key);
    else memoryFallback.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const TOKEN_KEY = "ig.auth.access_token";
export const USER_KEY = "ig.auth.user";

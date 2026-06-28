/**
 * Capacitor push registration. No-op on web; dynamically imports
 * @capacitor/push-notifications on a real device so the web build stays light.
 *
 * Call registerForPush() once at app boot. When @capacitor/push-notifications
 * is installed and the app runs natively, it'll request permission, register
 * with APNs/FCM, and POST the token back to the server via registerDevice.
 */

import { getDeviceId } from "./deviceId";
import { registerDevice } from "./devices.functions";

type CapModule = {
  Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string };
};

export async function registerForPush(): Promise<void> {
  if (typeof window === "undefined") return;

  // Always make sure the device row exists, even on web (so the watcher
  // can match alert rows to the device even before push is wired).
  try {
    await registerDevice({ data: { device_id: getDeviceId() } });
  } catch (e) {
    console.warn("[push] device registration failed", e);
  }

  // Bail unless we're inside Capacitor.
  let cap: CapModule | null = null;
  try {
    cap = (await import(/* @vite-ignore */ "@capacitor/core")) as unknown as CapModule;
  } catch {
    return; // web build, no Capacitor
  }
  if (!cap?.Capacitor?.isNativePlatform?.()) return;

  let PushNotifications: {
    requestPermissions: () => Promise<{ receive: string }>;
    register: () => Promise<void>;
    addListener: (event: string, cb: (payload: { value?: string; error?: unknown }) => void) => Promise<unknown>;
  };
  try {
    const mod = await import(/* @vite-ignore */ "@capacitor/push-notifications");
    PushNotifications = (mod as { PushNotifications: typeof PushNotifications }).PushNotifications;
  } catch {
    console.warn("[push] @capacitor/push-notifications not installed");
    return;
  }

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();

  await PushNotifications.addListener("registration", async ({ value }) => {
    if (!value) return;
    const platform = cap?.Capacitor.getPlatform() === "ios" ? "ios" : "android";
    try {
      await registerDevice({
        data: { device_id: getDeviceId(), push_token: value, push_platform: platform },
      });
    } catch (e) {
      console.warn("[push] token upload failed", e);
    }
  });

  await PushNotifications.addListener("registrationError", ({ error }) => {
    console.warn("[push] registration error", error);
  });
}

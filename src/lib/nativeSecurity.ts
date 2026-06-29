// Native-only security hooks. No-op on the web (where Capacitor isn't
// present), so importing from a shared layout is safe.

import { Capacitor } from "@capacitor/core";

let privacyScreenEnabled = false;

/**
 * BM-13 (Phase C): blank the app preview in the OS task switcher so
 * private keys / mnemonics shown on-screen don't get cached into a
 * thumbnail. Native-only; no-op on the web.
 */
export async function enablePrivacyScreen(): Promise<void> {
  if (privacyScreenEnabled) return;
  if (!Capacitor.isNativePlatform?.()) return;
  try {
    const mod = await import("@capacitor-community/privacy-screen");
    await mod.PrivacyScreen.enable({
      android: { enable: true, dimBackground: true },
      ios: { enable: true, blurEffect: "dark" } as never,
    } as never);
    privacyScreenEnabled = true;
  } catch (e) {
    console.warn("[security] privacy screen unavailable", e);
  }
}

/**
 * BM-14 (Phase C): biometric gate in front of any action that exposes
 * or spends a private key (Sweep broadcast, key reveal). On the web or
 * when no enrolled biometric exists, resolves true so dev still works.
 */
export async function requireBiometric(reason: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform?.()) return true;
  try {
    const { BiometricAuth, BiometryError } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    const info = await BiometricAuth.checkBiometry();
    if (!info.isAvailable) return true; // no enrolled biometric — don't block
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: "Cancel",
        allowDeviceCredential: true,
        iosFallbackTitle: "Use passcode",
        androidTitle: "Blockchain Mint",
        androidSubtitle: reason,
        androidConfirmationRequired: false,
      });
      return true;
    } catch (err) {
      if (err instanceof BiometryError) return false;
      throw err;
    }
  } catch (e) {
    console.warn("[security] biometric unavailable", e);
    return true;
  }
}

import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Blockchain Mint / Cold Storage Coins.
 *
 * Strategy: the app is a TanStack Start SSR site, so the native shell loads
 * the live published web app inside a managed webview. That means every web
 * change ships instantly without an app store resubmission. Native binary
 * only needs to be re-released when bundle id, icons, splash, permissions,
 * or installed Capacitor plugins change.
 *
 * Bundle IDs are intentionally identical to the legacy React Native app so
 * an over-the-top install preserves the OS sandbox (and the legacy importer
 * can read its old AsyncStorage files).
 *
 *   iOS:     com.rearden-metals.Cold-Storage-Coins   (App Store id 1352363663)
 *   Android: com.coldstoragecoins                     (Play Store listing)
 *
 * To build locally:
 *   1. npm run build              # produce web bundle
 *   2. npx cap add ios            # one-time
 *   3. npx cap add android        # one-time
 *   4. npx cap sync               # after every dep / config change
 *   5. npx cap open ios|android   # launch native IDE for signing + release
 */
const config: CapacitorConfig = {
  appId: "com.coldstoragecoins",
  appName: "Blockchain Mint",
  // webDir is only used when bundling local assets. We load the live URL
  // instead (see `server.url` below), but Capacitor still requires the path
  // to exist — `dist` is created by `npm run build`.
  webDir: ".output/public",
  server: {
    // Point the native shell at the live published web app. Change this to
    // the Lovable preview URL during development to test new builds without
    // republishing.
    url: "https://app.blockchainmint.com",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Allow navigation to the wallet explorers, blockchainmint.com store,
    // and the texitcoin.org docs without bouncing out to Safari/Chrome.
    allowNavigation: [
      "app.blockchainmint.com",
      "blockchainmint.com",
      "*.blockchainmint.com",
      "honest.money",
      "*.honest.money",
      "texitcoin.org",
      "*.texitcoin.org",
    ],
  },
  ios: {
    contentInset: "automatic",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#0b0b10",
  },
  android: {
    backgroundColor: "#0b0b10",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0b0b10",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b0b10",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

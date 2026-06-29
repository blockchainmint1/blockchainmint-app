# Capacitor — Native Build Guide

This app is a TanStack Start SSR web app wrapped in a thin native shell
(Capacitor). The native binary just loads the live published web app
(`https://app.blockchainmint.com`) inside a managed webview, so:

- **Web changes ship instantly** — push to Lovable, users see it on next launch. No store resubmission.
- **Native rebuild required** only when changing: bundle id, icons, splash,
  permissions, installed Capacitor plugins, or the URL the shell points at.

## Bundle IDs (do not change — preserves legacy install data)

| Platform | ID                                       | Store listing |
| -------- | ---------------------------------------- | ------------- |
| iOS      | `com.rearden-metals.Cold-Storage-Coins`  | App Store id `1352363663` |
| Android  | `com.coldstoragecoins`                   | Play Store `com.coldstoragecoins` |

The Capacitor config currently uses `com.coldstoragecoins`. When you open
the iOS project in Xcode the first time, change the bundle id in
*Signing & Capabilities* to `com.rearden-metals.Cold-Storage-Coins` so the
new build replaces the existing App Store listing in place.

## One-time setup (your laptop)

You need:
- **macOS + Xcode 15+** for iOS
- **Android Studio (Hedgehog or newer) + JDK 17** for Android
- Node + bun (already installed via this project)

```bash
git pull
bun install
bun run build              # produces ./dist (Capacitor needs the folder to exist)
npx cap add ios
npx cap add android
npx cap sync
```

`cap add` only runs once per platform; after that, `cap sync` is enough.

## Every release

```bash
bun run build
npx cap sync
npx cap open ios            # → Xcode → Archive → Distribute to App Store Connect
npx cap open android        # → Android Studio → Build → Generate Signed Bundle (.aab)
```

## Required native config (do this once per platform, in the IDE)

### iOS (Xcode)
1. *Signing & Capabilities* → set Team, change Bundle Identifier to
   `com.rearden-metals.Cold-Storage-Coins`, enable **Push Notifications**
   and **Background Modes → Remote notifications**.
2. *Info.plist* — add user-facing strings:
   - `NSCameraUsageDescription` → "Scan QR codes on your Cold Storage Coins."
   - `NSPhotoLibraryUsageDescription` → "Import wallet QR codes from photos."
3. App icons + launch screen — drop assets into `App/App/Assets.xcassets`.

### Android (Android Studio)
1. `android/app/build.gradle` — confirm `applicationId "com.coldstoragecoins"`.
2. `AndroidManifest.xml` — Capacitor plugins inject most permissions; verify
   `INTERNET`, `CAMERA`, `POST_NOTIFICATIONS` (Android 13+).
3. Drop `google-services.json` (from Firebase console) into `android/app/`
   to enable FCM.
4. App icons → `android/app/src/main/res/mipmap-*`.

## Push notifications

The watcher + dispatcher is already live on the backend; pushes start
flowing the moment you add Firebase credentials:

1. Create a Firebase project (or reuse one).
2. **iOS**: upload your APNs auth key in *Project Settings → Cloud Messaging*.
3. **Android**: download `google-services.json` → `android/app/`.
4. *Project Settings → Service Accounts* → **Generate new private key**.
5. Paste the entire JSON into the Lovable secret `FCM_SERVICE_ACCOUNT_JSON`.

That's it — `src/lib/push.server.ts` already speaks FCM HTTP v1.

## Legacy data import

The first-launch importer reads the old React Native AsyncStorage files in
the existing app sandbox. That requires a tiny native plugin that we'll
generate the first time you run `cap add` — see `src/lib/legacyImport.ts`
for the JS-side bridge name (`LegacyDataBridge`). The Swift + Kotlin shims
are ~30 lines each and live in `ios/App/App/` and `android/app/src/main/java/`.
File a "build me the legacy bridge" task once `cap add` has scaffolded the
native projects.

## Testing against preview vs production

Edit `capacitor.config.ts` → `server.url` to point at:
- `https://id-preview--<project-id>.lovable.app` for live preview testing
- `https://app.blockchainmint.com` for production

Then `npx cap sync` and rebuild. Nothing in the web app needs to change.

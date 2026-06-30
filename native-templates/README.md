# Native Templates

Most native wiring is now handled by the local Capacitor plugin package at
`capacitor-plugins/legacy-data-bridge/`, which is declared as a `file:`
dependency in the root `package.json`. After `bun install` and `npx cap sync`,
both iOS and Android pick up the `LegacyDataBridge` plugin automatically —
no manual Xcode dragging, no `MainActivity` edits.

The loose `ios/` and `android/` folders in this directory are kept only as
historical reference; the live source lives inside the plugin package.

## How the auto-import works

1. `src/lib/legacyImport.ts` calls `registerPlugin("LegacyDataBridge").read()`
   on first launch.
2. On iOS, the Swift implementation reads
   `Library/Application Support/<bundle>/RCTAsyncLocalStorage_V1/manifest.json`
   from the existing app sandbox (the bundle id matches the App Store listing
   `com.rearden-metals.Cold-Storage-Coins`, so the OS hands the sandbox over
   on update).
3. On Android, the Kotlin implementation opens the legacy `RKStorage` SQLite
   DB read-only and dumps `catalystLocalStorage`.
4. Both implementations strip private keys / seeds / mnemonics before the
   blob crosses the bridge (BM-12).
5. `LegacyImportPrompt` shows the user what was found and lets them accept
   or skip.

## Release checklist

```bash
bun install
bun run build
npx cap sync           # registers LegacyDataBridge into both native projects
npx cap open ios       # Archive → upload
npx cap open android   # Generate Signed Bundle → upload
```

## Sanity check on device

On a device with the old app installed, launch the new build. The
"Bring over your old coins?" dialog should appear. To debug from the JS
console:

```js
import { registerPlugin } from "@capacitor/core";
const Bridge = registerPlugin("LegacyDataBridge");
console.log(await Bridge.read());
```

`{ data: null }` → plugin loaded but no legacy storage on this device.
A JSON string → blob found and will be passed to the importer.

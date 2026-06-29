# Native Templates

Drop-in source files for the Capacitor native projects after you run
`npx cap add ios` and `npx cap add android`. They are kept here (outside
`ios/` and `android/`) so the repo stays clean before you scaffold the
native projects on your Mac.

## `LegacyDataBridge` — read the old Blockchain Mint app's data

The new app's first-launch importer (`src/lib/legacyImport.ts`) looks for a
Capacitor plugin named `LegacyDataBridge` with a single `read()` method.
This folder contains the iOS + Android implementations.

### iOS

1. `npx cap add ios` (once).
2. In Xcode, drag both files into the `App/App/` group (Copy items if needed,
   target membership = `App`):
   - `native-templates/ios/LegacyDataBridge.swift`
   - `native-templates/ios/LegacyDataBridge.m`
3. Build & run on a device that has the old app installed.
   Capacitor auto-registers the plugin via the `CAP_PLUGIN` macro.

### Android

1. `npx cap add android` (once).
2. Copy `native-templates/android/LegacyDataBridgePlugin.kt` into
   `android/app/src/main/java/com/coldstoragecoins/LegacyDataBridgePlugin.kt`.
   (Match the package to your `applicationId` — by default
   `com.coldstoragecoins`.)
3. Open `MainActivity.java` (or `.kt`) and register the plugin in `onCreate`
   before `super.onCreate(...)`:

   ```java
   import com.coldstoragecoins.LegacyDataBridgePlugin;
   // ...
   registerPlugin(LegacyDataBridgePlugin.class);
   ```

4. Rebuild.

### Sanity check

On a device with the old app installed, launch the new build. The
"We found N coins from your old Blockchain Mint app" modal should appear
on first launch. If it doesn't, attach a debugger and call the plugin
directly from JS:

```js
import { registerPlugin } from "@capacitor/core";
const Bridge = registerPlugin("LegacyDataBridge");
console.log(await Bridge.read());
```

`{ data: null }` means the plugin loaded but found no legacy storage on this
device (expected on a fresh install). A JSON string means data was found
and will be passed to the importer.

//
//  LegacyDataBridge.swift
//  Reads the old Expo / React Native AsyncStorage sandbox for the legacy
//  Blockchain Mint app and returns it to JS as a single JSON blob.
//
//  Install:
//    1. Drag this file into the `App/App/` group in Xcode (Copy items if needed).
//    2. Make sure target membership is checked for `App`.
//    3. Build & run — Capacitor auto-discovers the plugin via the @objc decorators.
//
//  The JS side calls it via:
//      const Bridge = registerPlugin<{ read: () => Promise<{ data: string | null }>}>("LegacyDataBridge");
//      const { data } = await Bridge.read();
//
//  React Native (Expo SDK <= 47) AsyncStorage on iOS persists to:
//      Library/Application Support/[bundle-id]/RCTAsyncLocalStorage_V1/manifest.json
//  plus per-key files in the same folder. We read manifest.json and inline
//  any "file-backed" values, then return the whole dictionary as JSON.
//
//  Returns { data: null } when no legacy folder exists (fresh install).
//

import Foundation
import Capacitor

@objc(LegacyDataBridge)
public class LegacyDataBridge: CAPPlugin {

    @objc public override func load() {}

    @objc func read(_ call: CAPPluginCall) {
        do {
            let blob = try Self.readAsyncStorage()
            if blob == nil {
                call.resolve(["data": NSNull()])
                return
            }
            let json = try JSONSerialization.data(withJSONObject: blob!, options: [])
            let str = String(data: json, encoding: .utf8) ?? ""
            call.resolve(["data": str])
        } catch {
            call.reject("Legacy read failed: \(error.localizedDescription)")
        }
    }

    /// Returns a dictionary of { key: parsed-value } from the legacy
    /// RCTAsyncLocalStorage_V1 folder, or nil if it doesn't exist.
    static func readAsyncStorage() throws -> [String: Any]? {
        let fm = FileManager.default
        guard let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        let storageDir = appSupport.appendingPathComponent("RCTAsyncLocalStorage_V1", isDirectory: true)
        let manifestURL = storageDir.appendingPathComponent("manifest.json")
        guard fm.fileExists(atPath: manifestURL.path) else { return nil }

        let manifestData = try Data(contentsOf: manifestURL)
        guard let manifest = try JSONSerialization.jsonObject(with: manifestData) as? [String: Any?] else {
            return nil
        }

        var out: [String: Any] = [:]
        for (key, value) in manifest {
            let raw: String?
            if let inline = value as? String {
                raw = inline
            } else {
                // Value is stored in a separate file named after the key hash.
                let fileURL = storageDir.appendingPathComponent(key)
                raw = (try? String(contentsOf: fileURL, encoding: .utf8))
            }
            guard let s = raw, !s.isEmpty else { continue }
            if let parsed = try? JSONSerialization.jsonObject(with: Data(s.utf8)) {
                out[key] = parsed
            } else {
                out[key] = s
            }
        }
        return out
    }
}

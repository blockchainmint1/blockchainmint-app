//
//  LegacyDataBridge.swift
//
//  Reads the old Expo / React Native AsyncStorage sandbox left behind by the
//  legacy Blockchain Mint install and hands it to JS as a single JSON blob.
//
//  The legacy app persisted to:
//    Library/Application Support/[bundle-id]/RCTAsyncLocalStorage_V1/manifest.json
//  plus per-key files in the same folder. We read manifest.json, inline any
//  file-backed values, strip private keys, and return the dictionary as JSON.
//
//  Bundle id MUST match the App Store listing
//  (com.rearden-metals.Cold-Storage-Coins) for the OS to hand the sandbox
//  over on update. Fresh installs return { data: null }.
//

import Foundation
import Capacitor

@objc(LegacyDataBridge)
public class LegacyDataBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LegacyDataBridge"
    public let jsName = "LegacyDataBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)
    ]

    // SECURITY (BM-12): fields that must NEVER cross the native bridge.
    // The JS importer only needs public addresses + labels.
    private static let secretKeys: Set<String> = [
        "privateKey", "private_key", "wif", "secret", "secretKey",
        "mnemonic", "seed", "seedPhrase", "phrase", "xprv", "xpriv"
    ]

    @objc func read(_ call: CAPPluginCall) {
        do {
            let blob = try Self.readAsyncStorage()
            guard let blob = blob else {
                call.resolve(["data": NSNull()])
                return
            }
            let sanitized = Self.sanitize(blob) as! [String: Any]
            let json = try JSONSerialization.data(withJSONObject: sanitized, options: [])
            let str = String(data: json, encoding: .utf8) ?? ""
            call.resolve(["data": str])
        } catch {
            call.reject("Legacy read failed: \(error.localizedDescription)")
        }
    }

    static func sanitize(_ value: Any) -> Any {
        if let dict = value as? [String: Any] {
            var out: [String: Any] = [:]
            for (k, v) in dict {
                if secretKeys.contains(k) { continue }
                out[k] = sanitize(v)
            }
            return out
        }
        if let arr = value as? [Any] {
            return arr.map { sanitize($0) }
        }
        return value
    }

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

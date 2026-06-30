import XCTest
@testable import LegacyDataBridge

final class LegacyDataBridgeTests: XCTestCase {
    func testSanitizeStripsSecrets() {
        let input: [String: Any] = ["address": "abc", "privateKey": "shh", "nested": ["wif": "x", "label": "ok"]]
        let out = LegacyDataBridge.sanitize(input) as! [String: Any]
        XCTAssertNil(out["privateKey"])
        XCTAssertEqual(out["address"] as? String, "abc")
        let nested = out["nested"] as! [String: Any]
        XCTAssertNil(nested["wif"])
        XCTAssertEqual(nested["label"] as? String, "ok")
    }
}

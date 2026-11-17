@testable import RemoteCompose
import XCTest

/// Host values arrive from JS typed as the app gave them.
final class HostValueTests: XCTestCase {
  private func wire(_ type: RemoteComposeNamedValueType, text: String = "", number: Double = 0)
    -> RemoteComposeNamedValue
  {
    RemoteComposeNamedValue(name: "v", valueType: type, text: text, number: number)
  }

  func testEveryWireTypeBecomesTheHostValueOfThatType() {
    let types: [RemoteComposeNamedValueType] = [.float, .int, .boolean, .string, .color]
    XCTAssertEqual(types.map { HostValue(wire($0)).type }, types)
  }

  func testValuesKeepWhatTheAppGave() {
    XCTAssertEqual(HostValue(wire(.float, number: 2.5)), .float(name: "v", value: 2.5))
    XCTAssertEqual(HostValue(wire(.int, number: 3)), .int(name: "v", value: 3))
    XCTAssertEqual(HostValue(wire(.boolean, number: 1)), .boolean(name: "v", value: true))
    XCTAssertEqual(HostValue(wire(.boolean, number: 0)), .boolean(name: "v", value: false))
    XCTAssertEqual(HostValue(wire(.string, text: "Hi")), .text(name: "v", value: "Hi"))
  }

  func testAColorKeepsAllFourChannelsWhetherJsPackedItSignedOrUnsigned() {
    let argb: UInt32 = 0xFF00_897B
    let unsigned = HostValue(wire(.color, number: Double(argb)))
    let signed = HostValue(wire(.color, number: Double(Int32(bitPattern: argb))))
    XCTAssertEqual(unsigned, .color(name: "v", argb: argb))
    XCTAssertEqual(signed, .color(name: "v", argb: argb))
  }

  func testAnIntegerOutOfRangeSaturatesInsteadOfCrashing() {
    XCTAssertEqual(HostValue(wire(.int, number: .nan)), .int(name: "v", value: 0))
    XCTAssertEqual(HostValue(wire(.int, number: .infinity)), .int(name: "v", value: .max))
    XCTAssertEqual(HostValue(wire(.int, number: -1e300)), .int(name: "v", value: .min))
  }
}

/// Host-settable variables live in the `USER` domain.
final class UserDomainTests: XCTestCase {
  func testABareNameIsQualifiedAndANamespacedOneIsLeftAlone() {
    XCTAssertEqual(UserDomain.qualify("title"), "USER:title")
    XCTAssertEqual(UserDomain.qualify("SYSTEM:x"), "SYSTEM:x")
  }

  func testOnlyTheUserDomainIsStrippedForTheApp() {
    XCTAssertEqual(UserDomain.unqualify("USER:title"), "title")
    XCTAssertEqual(UserDomain.unqualify("SYSTEM:x"), "SYSTEM:x")
  }
}

/// The document source follows the spec's priority: base64, then JSON, then uri.
final class HostViewPropsTests: XCTestCase {
  func testSourcePriority() {
    var props = HostViewProps()
    props.documentBase64 = "AA=="
    props.documentJson = "{}"
    props.documentUri = "https://example.com/a.rc"
    props.documentHeaders = ["Authorization", "t"]
    XCTAssertEqual(props.source, .base64("AA=="))
    props.documentBase64 = ""
    XCTAssertEqual(props.source, .json("{}"))
    props.documentJson = nil
    XCTAssertEqual(props.source, .uri("https://example.com/a.rc", headers: ["Authorization", "t"]))
  }

  func testEmptyPropsShowNoDocument() {
    XCTAssertNil(HostViewProps().source)
    var props = HostViewProps()
    props.documentBase64 = ""
    props.documentUri = ""
    props.documentJson = ""
    XCTAssertNil(props.source)
  }

  func testThemeAndLenientReachThePlayerConfiguration() {
    var props = HostViewProps()
    XCTAssertEqual(props.configuration.theme, .system)
    XCTAssertEqual(props.configuration.compatibility, .strict)
    props.theme = .dark
    props.lenient = true
    XCTAssertEqual(props.configuration.theme, .dark)
    XCTAssertEqual(props.configuration.compatibility, .compatible)
  }
}

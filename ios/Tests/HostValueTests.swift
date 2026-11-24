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

/// A document's typed variables, accepting a write only through the setter of the declared type,
/// as rc-players' controller does.
@MainActor
private final class FakeWriter: NamedValueWriter {
  enum Declared { case float, integer, string, color }

  private let declared: [String: Declared]
  private(set) var writes: [String] = []

  init(_ declared: [String: Declared]) {
    self.declared = declared
  }

  private func write(_ name: String, _ type: Declared, _ value: String) -> Bool {
    guard declared[name] == type else { return false }
    writes.append("\(name)=\(value)")
    return true
  }

  func setFloat(_ value: Float, for name: String) -> Bool {
    write(name, .float, "\(value)")
  }

  func setInteger(_ value: Int, for name: String) -> Bool {
    write(name, .integer, "\(value)")
  }

  func setBoolean(_ value: Bool, for name: String) -> Bool {
    write(name, .integer, "\(value)")
  }

  func setString(_ value: String, for name: String) -> Bool {
    write(name, .string, value)
  }

  func setColor(_ argb: UInt32, for name: String) -> Bool {
    write(name, .color, "\(argb)")
  }
}

/// Host values reach the variable types Android's `toRcValue` lets them drive.
@MainActor
final class HostValueApplyTests: XCTestCase {
  private let writer = FakeWriter(["f": .float, "i": .integer, "s": .string, "c": .color])

  func testANumberDrivesAFloatOrAnIntegerVariable() {
    XCTAssertTrue(HostValue.float(name: "f", value: 2.5).apply(to: writer))
    XCTAssertTrue(HostValue.float(name: "i", value: 3.9).apply(to: writer))
    XCTAssertTrue(HostValue.int(name: "i", value: 7).apply(to: writer))
    XCTAssertTrue(HostValue.int(name: "f", value: 7).apply(to: writer))
    XCTAssertEqual(writer.writes, ["f=2.5", "i=3", "i=7", "f=7.0"])
  }

  func testABooleanDrivesOnlyAnIntegerVariableAsAndroidXStoresIt() {
    XCTAssertTrue(HostValue.boolean(name: "i", value: true).apply(to: writer))
    XCTAssertFalse(HostValue.boolean(name: "f", value: true).apply(to: writer))
    XCTAssertEqual(writer.writes, ["i=true"])
  }

  func testAnIntegerOutsideThe32BitRangeClampsLikeKotlinsToInt() {
    XCTAssertTrue(HostValue.int(name: "i", value: .max).apply(to: writer))
    XCTAssertTrue(HostValue.float(name: "i", value: -1e300).apply(to: writer))
    XCTAssertTrue(HostValue.float(name: "i", value: .nan).apply(to: writer))
    XCTAssertEqual(writer.writes, ["i=\(Int32.max)", "i=\(Int32.min)", "i=0"])
  }

  func testTextAndColorDriveOnlyTheirOwnType() {
    XCTAssertTrue(HostValue.text(name: "s", value: "Hi").apply(to: writer))
    XCTAssertFalse(HostValue.text(name: "i", value: "Hi").apply(to: writer))
    XCTAssertTrue(HostValue.color(name: "c", argb: 0xFF00_897B).apply(to: writer))
    XCTAssertFalse(HostValue.color(name: "i", argb: 1).apply(to: writer))
    XCTAssertFalse(HostValue.float(name: "s", value: 1).apply(to: writer))
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
    props.documentJson = ""
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

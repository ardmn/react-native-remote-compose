import RcComposePlayerSwiftUI
@testable import RemoteCompose
import XCTest

/// Every host action the player raises reaches JS as one `onRemoteAction` with its typed value.
final class ActionEventsTests: XCTestCase {
  func testAHostActionCarriesItsId() throws {
    let event = try XCTUnwrap(ActionEvents.make(.action(id: 7)))
    XCTAssertEqual(event.kind, .host)
    XCTAssertEqual(event.actionId, 7)
    XCTAssertEqual(event.valueType, .none)
  }

  func testAMetadataActionCarriesItsIdAndMetadata() throws {
    let event = try XCTUnwrap(ActionEvents.make(.actionWithMetadata(id: 3, metadata: "open")))
    XCTAssertEqual(event.kind, .metadata)
    XCTAssertEqual(event.actionId, 3)
    XCTAssertEqual(event.metadata, "open")
  }

  func testANamedActionCarriesItsValueInTheMatchingField() throws {
    func named(_ value: RemoteComposePlayerActionValue) throws -> RemoteComposeActionEvent {
      let event = try XCTUnwrap(ActionEvents.make(.namedAction(name: "add_to_cart", value: value)))
      XCTAssertEqual(event.kind, .named)
      XCTAssertEqual(event.name, "add_to_cart")
      return event
    }
    XCTAssertEqual(try named(.none).valueType, .none)
    let float = try named(.float(0.5))
    XCTAssertEqual(float.valueType, .float)
    XCTAssertEqual(float.number, 0.5)
    let integer = try named(.integer(2))
    XCTAssertEqual(integer.valueType, .int)
    XCTAssertEqual(integer.number, 2)
    let text = try named(.text("x"))
    XCTAssertEqual(text.valueType, .string)
    XCTAssertEqual(text.text, "x")
    let list = try named(.floatList([1, 2.5]))
    XCTAssertEqual(list.valueType, .floatList)
    XCTAssertEqual(list.numbers, [1, 2.5])
  }

  func testPlayerEffectsAreNotActions() {
    XCTAssertNil(ActionEvents.make(.haptic(type: 1)))
    XCTAssertNil(ActionEvents.make(.playSound(id: 1)))
    XCTAssertNil(ActionEvents.make(.debug(message: "trace", value: 1, flags: 0)))
  }
}

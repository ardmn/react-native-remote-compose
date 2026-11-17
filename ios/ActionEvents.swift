import RcComposePlayerSwiftUI

/// Maps rc-players' player events to the `onRemoteAction` event.
enum ActionEvents {
  /// The event for a host action, or nil for player events that are not host actions.
  static func make(_ event: RemoteComposePlayerEvent) -> RemoteComposeActionEvent? {
    switch event {
    case let .action(id):
      RemoteComposeActionEvent(kind: .host, actionId: Int32(clamping: id), valueType: .none)
    case let .actionWithMetadata(id, metadata):
      RemoteComposeActionEvent(
        kind: .metadata, actionId: Int32(clamping: id), metadata: metadata, valueType: .none
      )
    case let .namedAction(name, value):
      named(name, value)
    case .haptic, .playSound, .debug, .unsupported:
      nil
    }
  }

  private static func named(
    _ name: String, _ value: RemoteComposePlayerActionValue
  ) -> RemoteComposeActionEvent {
    switch value {
    case .none, .unsupported:
      RemoteComposeActionEvent(kind: .named, name: name, valueType: .none)
    case let .float(number):
      RemoteComposeActionEvent(kind: .named, name: name, valueType: .float, number: Double(number))
    case let .integer(number):
      RemoteComposeActionEvent(kind: .named, name: name, valueType: .int, number: Double(number))
    case let .text(text):
      RemoteComposeActionEvent(kind: .named, name: name, valueType: .string, text: text)
    case let .floatList(numbers):
      RemoteComposeActionEvent(
        kind: .named, name: name, valueType: .floatList, numbers: numbers.map(Double.init)
      )
    }
  }
}

import Foundation
import RcComposePlayerSwiftUI

/// A value the host pushes into a document variable, typed as the app gave it in `namedValues`.
enum HostValue: Equatable {
  case float(name: String, value: Double)
  case int(name: String, value: Int)
  case boolean(name: String, value: Bool)
  case text(name: String, value: String)
  case color(name: String, argb: UInt32)

  init(_ wire: RemoteComposeNamedValue) {
    switch wire.valueType {
    case .float: self = .float(name: wire.name, value: wire.number)
    case .int: self = .int(name: wire.name, value: Int(saturating: wire.number))
    case .boolean: self = .boolean(name: wire.name, value: wire.number != 0)
    case .string: self = .text(name: wire.name, value: wire.text)
    // processColor packs ARGB unsigned on iOS and signed on Android; both keep 32 bits.
    case .color: self = .color(name: wire.name, argb: UInt32(truncatingIfNeeded: Int64(wire.number)))
    }
  }

  var name: String {
    switch self {
    case let .float(name, _), let .int(name, _), let .boolean(name, _), let .text(name, _),
         let .color(name, _):
      name
    }
  }

  /// The type the app gave, as JS names it.
  var type: RemoteComposeNamedValueType {
    switch self {
    case .float: .float
    case .int: .int
    case .boolean: .boolean
    case .text: .string
    case .color: .color
    }
  }

  /// Writes the value through rc-players' controller, which resolves the name and checks the
  /// declared type itself. Returns false when the type does not match.
  ///
  /// rc-players 3.8.0's iOS controller sets float, string and colour variables only, so integers
  /// and booleans can drive a float variable but not an integer one.
  @MainActor
  func apply(to controller: RemoteComposePlayerController) -> Bool {
    switch self {
    case let .float(name, value): controller.setFloat(Float(value), for: name)
    case let .int(name, value): controller.setFloat(Float(value), for: name)
    case let .boolean(name, value): controller.setFloat(value ? 1 : 0, for: name)
    case let .text(name, value): controller.setString(value, for: name)
    case let .color(name, argb): controller.setColor(argb, for: name)
    }
  }
}

extension Int {
  /// Kotlin's `Double.toInt()`: NaN is 0 and out-of-range values clamp, where `Int(_:)` traps.
  init(saturating value: Double) {
    if value.isNaN {
      self = 0
    } else if value >= Double(Int.max) {
      self = .max
    } else if value <= Double(Int.min) {
      self = .min
    } else {
      self = Int(value)
    }
  }
}

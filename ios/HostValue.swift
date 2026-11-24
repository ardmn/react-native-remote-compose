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
    // 32 bits, as Android's `toInt()`, so an int reaches a float variable with the same value too.
    case .int: self = .int(name: wire.name, value: Int(Int32(saturating: wire.number)))
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
  /// The same rule as Android's `toRcValue`: a number drives a float or an integer variable
  /// (an integer one gets it truncated to 32 bits), and a boolean drives only an integer variable
  /// holding 1 or 0, as AndroidX stores a boolean. The controller has no 64-bit integer setter, so a
  /// long variable, which Android accepts a number for, is refused here.
  @MainActor
  func apply(to writer: some NamedValueWriter) -> Bool {
    switch self {
    case let .float(name, value):
      writer.setFloat(Float(value), for: name)
        || writer.setInteger(Int(Int32(saturating: value)), for: name)
    case let .int(name, value):
      writer.setInteger(Int(Int32(clamping: value)), for: name)
        || writer.setFloat(Float(value), for: name)
    case let .boolean(name, value): writer.setBoolean(value, for: name)
    case let .text(name, value): writer.setString(value, for: name)
    case let .color(name, argb): writer.setColor(argb, for: name)
    }
  }
}

/// The setters of rc-players' `RemoteComposePlayerController`. Each returns true only for a name the
/// shown document declares with that setter's type. A protocol so the routing can be tested without
/// a player.
@MainActor
protocol NamedValueWriter {
  func setFloat(_ value: Float, for name: String) -> Bool
  func setInteger(_ value: Int, for name: String) -> Bool
  func setBoolean(_ value: Bool, for name: String) -> Bool
  func setString(_ value: String, for name: String) -> Bool
  func setColor(_ argb: UInt32, for name: String) -> Bool
}

extension RemoteComposePlayerController: NamedValueWriter {}

extension Int32 {
  /// Kotlin's `Double.toInt()`: truncates toward zero, NaN is 0 and out-of-range values clamp.
  init(saturating value: Double) {
    if value.isNaN {
      self = 0
    } else if value >= Double(Int32.max) {
      self = .max
    } else if value <= Double(Int32.min) {
      self = .min
    } else {
      self = Int32(value)
    }
  }
}

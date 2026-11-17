import Foundation

/// AndroidX authoring JSON on iOS. The only converter is AndroidX's Java `RemoteComposeJsonParser`,
/// so iOS reports the feature as unsupported with a message that says what to do instead.
@objc(RemoteComposeJson)
public final class RemoteComposeJson: NSObject {
  @objc public static let isConversionSupported = false

  @objc public static let unsupportedMessage =
    "JSON to .rc conversion is available on Android only. Convert on the server or at build time "
      + "(tools/remote-compose-json) and pass the .rc as uri or base64."

  struct UnsupportedError: LocalizedError {
    var errorDescription: String? {
      RemoteComposeJson.unsupportedMessage
    }
  }
}

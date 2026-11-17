import RcComposePlayerSwiftUI

/// `RemoteComposeHostView`'s props, as one value: staged one setter at a time, applied together
/// in `commit()`.
struct HostViewProps: Equatable {
  var documentBase64: String?
  var documentUri: String?
  var documentHeaders: [String] = []
  var documentJson: String?
  var namedValues: [HostValue] = []
  var theme = RemoteComposeTheme.defaultValue
  var lenient = false

  /// The document to show, by the spec's priority: base64, then JSON, then uri; nil for none.
  var source: DocumentSource? {
    if let documentBase64, !documentBase64.isEmpty {
      return .base64(documentBase64)
    }
    if let documentJson, !documentJson.isEmpty {
      return .json(documentJson)
    }
    if let documentUri, !documentUri.isEmpty {
      return .uri(documentUri, headers: documentHeaders)
    }
    return nil
  }

  var configuration: RemoteComposePlayerConfiguration {
    RemoteComposePlayerConfiguration(
      theme: theme.playerTheme,
      compatibility: lenient ? .compatible : .strict,
      background: .transparent
    )
  }
}

extension RemoteComposeTheme {
  var playerTheme: RemoteComposePlayerTheme {
    switch self {
    case .system: .system
    case .light: .light
    case .dark: .dark
    }
  }
}

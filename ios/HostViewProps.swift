import RcComposePlayerSwiftUI

/// `RemoteComposeHostView`'s props, typed: what the view compares and acts on.
struct HostViewProps: Equatable {
  var documentBase64 = ""
  var documentUri = ""
  var documentHeaders: [String] = []
  var documentJson = ""
  var namedValues: [HostValue] = []
  var theme = RemoteComposeTheme.defaultValue
  var lenient = false

  init() {}

  init(_ props: RemoteComposeProps) {
    documentBase64 = props.documentBase64
    documentUri = props.documentUri
    documentHeaders = props.documentHeaders
    documentJson = props.documentJson
    namedValues = props.namedValues.map(HostValue.init)
    theme = props.theme
    lenient = props.lenient
  }

  /// The document to show, by the spec's priority: base64, then JSON, then uri; nil for none.
  var source: DocumentSource? {
    if !documentBase64.isEmpty {
      return .base64(documentBase64)
    }
    if !documentJson.isEmpty {
      return .json(documentJson)
    }
    if !documentUri.isEmpty {
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

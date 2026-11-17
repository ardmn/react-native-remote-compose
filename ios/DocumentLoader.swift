import Foundation

/// Where a document comes from.
enum DocumentSource: Equatable {
  case base64(String)
  /// AndroidX authoring JSON. iOS has no converter; reported as unsupported.
  case json(String)
  /// `headers` are flattened as `[name, value, name, value, …]`, as the spec sends them.
  case uri(String, headers: [String])
}

/// Turns a `DocumentSource` into `.rc` bytes. Runs off the main actor; cancelling the task cancels
/// the read.
enum DocumentLoader {
  /// Larger documents are refused as soon as the limit is passed, not after reading them.
  static let maxDocumentBytes = 16 * 1024 * 1024
  private static let timeout: TimeInterval = 15

  enum Failure: LocalizedError {
    case invalidBase64
    case invalidURL(String)
    case invalidHeaders
    case http(status: Int, url: String)
    case tooLarge(limit: Int)

    var errorDescription: String? {
      switch self {
      case .invalidBase64: "Invalid base64 document"
      case let .invalidURL(uri): "Invalid document uri: \(uri)"
      case .invalidHeaders: "Headers must alternate names and values"
      case let .http(status, url): "HTTP \(status) for \(url)"
      case let .tooLarge(limit): "Document larger than \(limit) bytes"
      }
    }
  }

  static func load(_ source: DocumentSource) async throws -> Data {
    switch source {
    case let .base64(encoded):
      guard let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
        throw Failure.invalidBase64
      }
      return data
    case .json:
      throw RemoteComposeJson.UnsupportedError()
    case let .uri(uri, headers):
      guard let url = URL(string: uri) else { throw Failure.invalidURL(uri) }
      return url.isFileURL ? try readFile(url) : try await fetch(url, headers: headers)
    }
  }

  private static func readFile(_ url: URL) throws -> Data {
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size <= maxDocumentBytes else { throw Failure.tooLarge(limit: maxDocumentBytes) }
    return try Data(contentsOf: url)
  }

  private static func fetch(_ url: URL, headers: [String]) async throws -> Data {
    guard headers.count.isMultiple(of: 2) else { throw Failure.invalidHeaders }
    var request = URLRequest(url: url, timeoutInterval: timeout)
    for index in stride(from: 0, to: headers.count, by: 2) {
      request.setValue(headers[index + 1], forHTTPHeaderField: headers[index])
    }
    let (bytes, response) = try await URLSession.shared.bytes(for: request)
    if let http = response as? HTTPURLResponse, !(200 ..< 300).contains(http.statusCode) {
      throw Failure.http(status: http.statusCode, url: url.absoluteString)
    }
    guard response.expectedContentLength <= maxDocumentBytes else {
      throw Failure.tooLarge(limit: maxDocumentBytes)
    }
    var data = Data()
    if response.expectedContentLength > 0 {
      data.reserveCapacity(Int(response.expectedContentLength))
    }
    for try await byte in bytes {
      guard data.count < maxDocumentBytes else { throw Failure.tooLarge(limit: maxDocumentBytes) }
      data.append(byte)
    }
    return data
  }
}

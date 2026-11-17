import Foundation
import RcComposePlayerSwiftUI
import UIKit

/// The UIKit side of `RemoteComposeView`: loads a document off the main thread and hosts
/// rc-players' `RemoteComposePlayerViewController` (the Compose Multiplatform player).
///
/// Props are staged by the Fabric component and applied together in `commit()`.
@objc(RemoteComposeHostView)
@MainActor
public final class RemoteComposeHostView: UIView {
  @objc public var onAction: (([String: Any]) -> Void)?
  @objc public var onError: (([String: Any]) -> Void)?
  @objc public var onLoad: (([String: Any]) -> Void)?

  private struct Request: Equatable {
    var base64: String?
    var uri: String?
    var headers: [String] = []
    var json: String?

    var isEmpty: Bool {
      (base64 ?? "").isEmpty && (uri ?? "").isEmpty && (json ?? "").isEmpty
    }
  }

  private struct HostValue: Equatable {
    let name: String
    let type: String
    let text: String
    let number: Double
  }

  private var request = Request()
  private var appliedRequest: Request?
  private var values: [HostValue] = []
  private var configuration = RemoteComposePlayerConfiguration(background: .transparent)
  private var appliedConfiguration: RemoteComposePlayerConfiguration?

  private let playerController = RemoteComposePlayerController()
  private var playerViewController: RemoteComposePlayerViewController?
  private var documentData: Data?
  private var loadTask: Task<Void, Never>?
  private var generation = 0

  override public init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  // MARK: - Props

  @objc public func setDocumentBase64(_ value: String?) {
    request.base64 = value
  }

  @objc public func setDocumentUri(_ value: String?) {
    request.uri = value
  }

  @objc public func setDocumentHeaders(_ value: [String]) {
    request.headers = value
  }

  @objc public func setDocumentJson(_ value: String?) {
    request.json = value
  }

  @objc public func setTheme(_ value: String) {
    configuration.theme =
      switch value {
      case "light": .light
      case "dark": .dark
      default: .system
      }
  }

  @objc public func setLenient(_ value: Bool) {
    configuration.compatibility = value ? .compatible : .strict
  }

  @objc public func setNamedValues(_ entries: [[String: Any]]) {
    values = entries.map {
      HostValue(
        name: $0["name"] as? String ?? "",
        type: $0["type"] as? String ?? "",
        text: $0["text"] as? String ?? "",
        number: ($0["number"] as? NSNumber)?.doubleValue ?? 0
      )
    }
  }

  @objc public func commit() {
    if request != appliedRequest {
      appliedRequest = request
      appliedConfiguration = configuration
      reload(request)
    } else if configuration != appliedConfiguration {
      appliedConfiguration = configuration
      if let documentData {
        install(documentData, loadMs: 0, byteLength: documentData.count)
      }
    } else {
      applyNamedValues()
    }
  }

  @objc public func prepareForRecycle() {
    loadTask?.cancel()
    generation += 1
    removePlayer()
    request = Request()
    appliedRequest = nil
    appliedConfiguration = nil
    values = []
    documentData = nil
  }

  // MARK: - Loading

  private func reload(_ request: Request) {
    loadTask?.cancel()
    generation += 1
    let current = generation
    guard !request.isEmpty else {
      removePlayer()
      documentData = nil
      return
    }
    if let json = request.json, !json.isEmpty, (request.base64 ?? "").isEmpty {
      emitError("unsupported", RemoteComposeJson.unsupportedMessage)
      return
    }
    loadTask = Task.detached(priority: .userInitiated) { [request] in
      let start = DispatchTime.now().uptimeNanoseconds
      do {
        let data = try await Self.load(request)
        let loadMs = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
        await MainActor.run { [weak self] in
          guard let self, generation == current else { return }
          documentData = data
          install(data, loadMs: loadMs, byteLength: data.count)
        }
      } catch is CancellationError {
        return
      } catch {
        await MainActor.run { [weak self] in
          guard let self, generation == current else { return }
          emitError("load", error.localizedDescription)
        }
      }
    }
  }

  private nonisolated static func load(_ request: Request) async throws -> Data {
    if let base64 = request.base64, !base64.isEmpty {
      guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
        throw LoadError("Invalid base64 document")
      }
      return data
    }
    guard let uri = request.uri, let url = URL(string: uri) else {
      throw LoadError("No document source")
    }
    if url.isFileURL {
      return try Data(contentsOf: url)
    }
    var urlRequest = URLRequest(url: url, timeoutInterval: 15)
    for item in stride(from: 0, to: request.headers.count - 1, by: 2) {
      urlRequest.setValue(request.headers[item + 1], forHTTPHeaderField: request.headers[item])
    }
    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    if let http = response as? HTTPURLResponse, !(200 ..< 300).contains(http.statusCode) {
      throw LoadError("HTTP \(http.statusCode) for \(uri)")
    }
    return data
  }

  /// Builds the player. On iOS the player decodes and validates inside its controller factory,
  /// which runs on the main thread; that cost is measured and reported as `decodeMs`.
  private func install(_ data: Data, loadMs: Double, byteLength: Int) {
    var failed = false
    let current = generation
    let start = DispatchTime.now().uptimeNanoseconds
    let onEvent: (RemoteComposePlayerEvent) -> Void = { [weak self] event in
      self?.dispatch(event)
    }
    let onError: (RemoteComposePlayerError) -> Void = { [weak self] error in
      guard let self, generation == current else { return }
      failed = true
      emitError("document", error.localizedDescription)
    }
    if let player = playerViewController {
      player.update(
        data: data, configuration: configuration, onEvent: onEvent, onError: onError
      )
    } else {
      let player = RemoteComposePlayerViewController(
        data: data, controller: playerController, configuration: configuration,
        onEvent: onEvent, onError: onError
      )
      attach(player)
    }
    // Loading the controller's view builds the Compose content synchronously.
    playerViewController?.loadViewIfNeeded()
    let decodeMs = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    guard !failed else { return }
    applyNamedValues()
    onLoad?([
      "byteLength": byteLength,
      "loadMs": loadMs,
      "decodeMs": decodeMs,
      "namedValues": playerController.names.map { $0.hasPrefix("USER:") ? String($0.dropFirst(5)) : $0 },
    ])
  }

  private func attach(_ player: RemoteComposePlayerViewController) {
    playerViewController = player
    player.view.frame = bounds
    player.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    player.view.backgroundColor = .clear
    if let parent = parentViewController {
      parent.addChild(player)
      addSubview(player.view)
      player.didMove(toParent: parent)
    } else {
      addSubview(player.view)
    }
  }

  private func removePlayer() {
    guard let player = playerViewController else { return }
    player.willMove(toParent: nil)
    player.view.removeFromSuperview()
    player.removeFromParent()
    playerViewController = nil
  }

  override public func didMoveToWindow() {
    super.didMoveToWindow()
    // Re-parent the controller once the view is in a hierarchy, so it gets lifecycle callbacks.
    guard let player = playerViewController, player.parent == nil, let parent = parentViewController
    else { return }
    parent.addChild(player)
    player.didMove(toParent: parent)
  }

  private var parentViewController: UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController {
        return controller
      }
      responder = next
    }
    return nil
  }

  // MARK: - Named values and events

  /// iOS's player controller sets floats, strings and colours. Integers and booleans are written
  /// as floats when the document declares a float, and reported otherwise.
  private func applyNamedValues() {
    guard playerViewController != nil else { return }
    let declared = Set(playerController.names)
    for value in values {
      let qualified = value.name.contains(":") ? value.name : "USER:\(value.name)"
      guard declared.contains(qualified) else { continue }
      let accepted: Bool =
        switch value.type {
        case "string": playerController.setString(value.text, for: value.name)
        case "color":
          playerController.setColor(UInt32(truncatingIfNeeded: Int64(value.number)), for: value.name)
        default: playerController.setFloat(Float(value.number), for: value.name)
        }
      if !accepted {
        emitError(
          "document",
          "Named value '\(value.name)' (\(value.type)) does not match the document's type"
            + (value.type == "int" || value.type == "boolean"
              ? " (the iOS player sets float, string and color values only)" : "")
        )
      }
    }
  }

  private func dispatch(_ event: RemoteComposePlayerEvent) {
    var payload: [String: Any] = [
      "kind": "named", "actionId": 0, "name": "", "metadata": "", "valueType": "none",
      "text": "", "number": 0.0, "numbers": [Double](),
    ]
    switch event {
    case let .action(id):
      payload["kind"] = "host"
      payload["actionId"] = id
    case let .actionWithMetadata(id, metadata):
      payload["kind"] = "metadata"
      payload["actionId"] = id
      payload["metadata"] = metadata
    case let .namedAction(name, value):
      payload["name"] = name
      switch value {
      case .none, .unsupported: break
      case let .float(number):
        payload["valueType"] = "float"
        payload["number"] = Double(number)
      case let .integer(number):
        payload["valueType"] = "int"
        payload["number"] = Double(number)
      case let .text(text):
        payload["valueType"] = "string"
        payload["text"] = text
      case let .floatList(numbers):
        payload["valueType"] = "floatList"
        payload["numbers"] = numbers.map(Double.init)
      }
    default:
      return
    }
    onAction?(payload)
  }

  private func emitError(_ code: String, _ message: String) {
    onError?(["code": code, "message": message])
  }

  private struct LoadError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) {
      errorDescription = message
    }
  }
}

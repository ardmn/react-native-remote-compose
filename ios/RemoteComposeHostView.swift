import Foundation
import RcComposePlayerSwiftUI
import UIKit

/// The UIKit side of `RemoteComposeView`: loads a document off the main thread and hosts
/// rc-players' `RemoteComposePlayerViewController` (the Compose Multiplatform player).
///
/// **Threading.** The class is `@MainActor`, so the compiler confines all its state to the main
/// thread. Loading runs in a detached task that touches no view state and hands its result back to
/// the main actor, where a newer load (`generation`) discards an older one's result.
@objc(RemoteComposeHostView)
@MainActor
public final class RemoteComposeHostView: UIView {
  @objc public var onAction: ((RemoteComposeActionEvent) -> Void)?
  @objc public var onError: ((RemoteComposeErrorEvent) -> Void)?
  @objc public var onLoad: ((RemoteComposeLoadEvent) -> Void)?

  /// A document that was loaded and handed to the player.
  private struct Shown {
    let data: Data
    let configuration: RemoteComposePlayerConfiguration
  }

  /// The props last applied; the shown (or loading) document was requested with them.
  private var committedProps: HostViewProps?
  private var shown: Shown?

  private let playerController = RemoteComposePlayerController()
  private var playerViewController: RemoteComposePlayerViewController?
  private var loadTask: Task<Void, Never>?
  /// Incremented by every load, so a finished load can tell whether it is still the latest.
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

  /// Applies a new set of props: reloads when the source changed, rebuilds the player when only
  /// its configuration changed, and otherwise just writes the host values.
  @objc public func update(_ newProps: RemoteComposeProps) {
    let props = HostViewProps(newProps)
    let previous = committedProps
    committedProps = props
    if props.source != previous?.source {
      load(props)
    } else if let shown, props.configuration != shown.configuration {
      // Theme and compatibility are fixed when the player is built: rebuild it.
      install(shown.data, configuration: props.configuration, loadMs: 0)
    } else {
      applyHostValues(props.namedValues)
    }
  }

  @objc public func prepareForRecycle() {
    loadTask?.cancel()
    generation += 1
    removePlayer()
    committedProps = nil
    shown = nil
  }

  // MARK: - Loading

  private func load(_ props: HostViewProps) {
    loadTask?.cancel()
    generation += 1
    let current = generation
    guard let source = props.source else {
      removePlayer()
      shown = nil
      return
    }
    loadTask = Task.detached(priority: .userInitiated) { [weak self] in
      let start = DispatchTime.now().uptimeNanoseconds
      let result: Result<Data, Error>
      do {
        result = try await .success(DocumentLoader.load(source))
      } catch is CancellationError {
        return
      } catch {
        result = .failure(error)
      }
      let loadMs = Self.milliseconds(since: start)
      await self?.finishLoad(result, generation: current, loadMs: loadMs)
    }
  }

  private func finishLoad(_ result: Result<Data, Error>, generation loaded: Int, loadMs: Double) {
    guard loaded == generation, let props = committedProps else { return }
    switch result {
    case let .success(data):
      install(data, configuration: props.configuration, loadMs: loadMs)
    case let .failure(error as RemoteComposeJson.UnsupportedError):
      emitError(.unsupported, error.localizedDescription)
    case let .failure(error):
      emitError(.load, error.localizedDescription)
    }
  }

  /// Builds the player. On iOS the player decodes and validates inside its controller factory,
  /// which runs on the main thread; that cost is measured and reported as `decodeMs`.
  private func install(
    _ data: Data, configuration: RemoteComposePlayerConfiguration, loadMs: Double
  ) {
    let current = generation
    var rejected = false
    let start = DispatchTime.now().uptimeNanoseconds
    let onEvent: (RemoteComposePlayerEvent) -> Void = { [weak self] event in
      guard let action = ActionEvents.make(event) else { return }
      self?.onAction?(action)
    }
    let onError: (RemoteComposePlayerError) -> Void = { [weak self] error in
      guard let self, generation == current else { return }
      rejected = true
      emitError(.document, error.localizedDescription)
    }
    if let player = playerViewController {
      player.update(data: data, configuration: configuration, onEvent: onEvent, onError: onError)
    } else {
      attach(
        RemoteComposePlayerViewController(
          data: data, controller: playerController, configuration: configuration,
          onEvent: onEvent, onError: onError
        )
      )
    }
    // Loading the controller's view builds the Compose content synchronously, so a document the
    // player rejects has reported it by the time this returns.
    playerViewController?.loadViewIfNeeded()
    let decodeMs = Self.milliseconds(since: start)
    shown = Shown(data: data, configuration: configuration)
    guard !rejected else { return }
    applyHostValues(committedProps?.namedValues ?? [])
    onLoad?(
      RemoteComposeLoadEvent(
        byteLength: Int32(clamping: data.count),
        loadMs: loadMs,
        decodeMs: decodeMs,
        namedValues: playerController.names.map(UserDomain.unqualify).sorted()
      )
    )
  }

  private func attach(_ player: RemoteComposePlayerViewController) {
    playerViewController = player
    player.view.frame = bounds
    player.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    player.view.backgroundColor = .clear
    addSubview(player.view)
    if let parent = parentViewController {
      parent.addChild(player)
      player.didMove(toParent: parent)
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
    sequence(first: next, next: { $0?.next }).lazy.compactMap { $0 as? UIViewController }.first
  }

  // MARK: - Named values and errors

  /// Writes the host values the shown document declares and reports the ones whose declared type
  /// they cannot drive. Undeclared names are skipped: one set of values can serve many documents.
  private func applyHostValues(_ values: [HostValue]) {
    guard playerViewController != nil else { return }
    let declared = Set(playerController.names)
    for value in values where declared.contains(UserDomain.qualify(value.name)) {
      guard !value.apply(to: playerController) else { continue }
      emitError(
        .document,
        "Named value '\(value.name)' (\(value.type.wireValue)) does not match the document's type"
          + (value.type == .int || value.type == .boolean
            ? " (the iOS player sets float, string and color values only)" : "")
      )
    }
  }

  private func emitError(_ code: RemoteComposeErrorCode, _ message: String) {
    onError?(RemoteComposeErrorEvent(code: code, message: message))
  }

  private nonisolated static func milliseconds(since start: UInt64) -> Double {
    Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
  }
}

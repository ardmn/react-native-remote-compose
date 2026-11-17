@testable import RemoteCompose
import XCTest

/// Documents load from every source the spec allows, and bad input fails with a clear error.
final class DocumentLoaderTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    try FileManager.default.removeItem(at: directory)
  }

  private func assertFails(
    _ source: DocumentSource,
    file: StaticString = #filePath,
    line: UInt = #line,
    _ check: (Error) -> Void
  ) async {
    do {
      _ = try await DocumentLoader.load(source)
      XCTFail("expected a failure", file: file, line: line)
    } catch {
      check(error)
    }
  }

  func testBase64DecodesToTheDocumentBytes() async throws {
    let data = try await DocumentLoader.load(.base64(Data([1, 2, 3]).base64EncodedString()))
    XCTAssertEqual(data, Data([1, 2, 3]))
  }

  func testInvalidBase64Fails() async {
    await assertFails(.base64("%%%")) { error in
      guard case DocumentLoader.Failure.invalidBase64 = error else {
        return XCTFail("\(error)")
      }
    }
  }

  func testJsonIsReportedAsUnsupportedOnIOS() async {
    await assertFails(.json("{}")) { error in
      XCTAssertTrue(error is RemoteComposeJson.UnsupportedError, "\(error)")
      XCTAssertEqual(error.localizedDescription, RemoteComposeJson.unsupportedMessage)
    }
  }

  func testAFileWithinTheLimitIsRead() async throws {
    let url = directory.appendingPathComponent("doc.rc")
    try Data([7, 8, 9]).write(to: url)
    let data = try await DocumentLoader.load(.uri(url.absoluteString, headers: []))
    XCTAssertEqual(data, Data([7, 8, 9]))
  }

  func testAFileOverTheLimitIsRefusedWithoutReadingIt() async throws {
    let url = directory.appendingPathComponent("huge.rc")
    FileManager.default.createFile(atPath: url.path, contents: nil)
    let handle = try FileHandle(forWritingTo: url)
    // Sparse: the size is set without writing the bytes.
    try handle.truncate(atOffset: UInt64(DocumentLoader.maxDocumentBytes + 1))
    try handle.close()
    await assertFails(.uri(url.absoluteString, headers: [])) { error in
      guard case DocumentLoader.Failure.tooLarge = error else {
        return XCTFail("\(error)")
      }
    }
  }

  func testHeadersThatDoNotPairNamesWithValuesFailBeforeAnyRequest() async {
    await assertFails(.uri("https://example.invalid/doc.rc", headers: ["Authorization"])) { error in
      guard case DocumentLoader.Failure.invalidHeaders = error else {
        return XCTFail("\(error)")
      }
    }
  }
}

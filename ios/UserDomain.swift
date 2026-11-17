/// The `USER` domain host-settable variables are declared in (AndroidX's `RemoteState.Domain.User`).
/// Neither AndroidX nor rc-players exports the constant, so it is defined once here.
enum UserDomain {
  private static let separator: Character = ":"
  private static let prefix = "USER\(separator)"

  /// `title` → `USER:title`; a name that already has a domain is left alone.
  static func qualify(_ name: String) -> String {
    name.contains(separator) ? name : prefix + name
  }

  /// `USER:title` → `title`; names in other domains are left alone.
  static func unqualify(_ name: String) -> String {
    name.hasPrefix(prefix) ? String(name.dropFirst(prefix.count)) : name
  }
}

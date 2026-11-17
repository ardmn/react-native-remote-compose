require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# rc-players ships its Apple player only through Swift Package Manager (a prebuilt
# Compose Multiplatform XCFramework behind a checksum-pinned binary target). React Native's
# own `spm_dependency` helper wires that package into the Pods project.
RC_PLAYERS_VERSION = "3.8.0"

Pod::Spec.new do |s|
  s.name         = "RemoteCompose"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # The XCFramework has no x86_64 slices and its Swift overlay targets iOS 15+ APIs.
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/ardmn/react-native-remote-compose.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"
  s.swift_version = "5.10"
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    # Apple-silicon simulators and devices only: rc-players publishes no x86_64 slice.
    "EXCLUDED_ARCHS[sdk=iphonesimulator*]" => "x86_64",
  }

  spm_dependency(s,
    url: "https://github.com/yschimke/rc-players.git",
    requirement: { "kind" => "exactVersion", "version" => RC_PLAYERS_VERSION },
    products: ["RcComposePlayerSwiftUI"]
  )

  install_modules_dependencies(s)
end

require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# rc-players ships its Apple player only through Swift Package Manager (a prebuilt
# Compose Multiplatform XCFramework behind a checksum-pinned binary target). React Native's
# own `spm_dependency` helper wires that package into the Pods project.
rc_players_version = "3.8.0"

# React Native 0.87+ builds a static pod that has an `spm_dependency` into the shared products dir
# (facebook/react-native#57602) and rewrites the app's `-fmodule-map-file` flags to match, but not
# the pod's test-spec xcconfigs, so the `Tests` target looks for a module map that is never made.
# Same approach as @rnmapbox/maps and PostHog (posthog-js#5606): extend React Native's rewrite and
# let it run first. It changes nothing when no app enables the test spec, and before React Native
# 0.87 the method does not exist and nothing is patched.
module RemoteComposeTestSpecModuleMaps
  def rewrite_aggregate_modulemap_references(installer, pod_names)
    super
    installer.pod_targets.each do |pod|
      next unless pod_names.include?(pod.label) && pod.pod_name == "RemoteCompose"

      module_name = pod.product_module_name
      Dir.glob(File.join(pod.support_files_dir, "*.unit-tests.*.xcconfig")).each do |path|
        text = File.read(path)
        fixed = text.gsub("${PODS_CONFIGURATION_BUILD_DIR}/#{pod.label}/#{module_name}.modulemap",
                          "${PODS_CONFIGURATION_BUILD_DIR}/#{module_name}.modulemap")
        File.write(path, fixed) unless fixed == text
      end
    end
  end
end

if defined?(::SPMManager) &&
   ::SPMManager.private_method_defined?(:rewrite_aggregate_modulemap_references) &&
   !(::SPMManager < RemoteComposeTestSpecModuleMaps)
  ::SPMManager.prepend(RemoteComposeTestSpecModuleMaps)
end

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
  s.exclude_files = "ios/Tests/**"
  s.private_header_files = "ios/**/*.h"
  s.swift_version = "5.10"
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    # Apple-silicon simulators and devices only: rc-players publishes no x86_64 slice.
    "EXCLUDED_ARCHS[sdk=iphonesimulator*]" => "x86_64",
  }

  spm_dependency(s,
    url: "https://github.com/yschimke/rc-players.git",
    requirement: { "kind" => "exactVersion", "version" => rc_players_version },
    products: ["RcComposePlayerSwiftUI"]
  )

  install_modules_dependencies(s)

  # XCTest unit tests for the Swift layer. An app opts in with
  # `pod "RemoteCompose", :path => ..., :testspecs => ["Tests"]` (the example app does).
  s.test_spec "Tests" do |test_spec|
    test_spec.source_files = "ios/Tests/**/*.swift"
  end
end

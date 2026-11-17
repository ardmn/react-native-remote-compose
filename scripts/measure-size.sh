#!/usr/bin/env bash
# What react-native-remote-compose adds to an app, measured on release builds of the bare demo:
# built once with the library and once with its native part unlinked (RC_SIZE_BASELINE=1); the
# JS is identical, so the difference is the library's native cost.
#
#   Android: arm64-v8a release APK. APK bytes ≈ Play download for one device (Play serves
#            per-ABI splits); unzipped bytes ≈ install size. Measured with R8 on and off.
#   iOS:     arm64 device Release .app. Bytes ≈ install size; zip -9 of it ≈ App Store download.
#
# Usage: scripts/measure-size.sh [android|ios|all]   (results in build/size/report.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/size"; mkdir -p "$OUT"
WHAT="${1:-all}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

bytes() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1"; }
unzipped() { unzip -l "$1" | tail -1 | awk '{print $1}'; }
dirbytes() { find "$1" -type f -exec stat -f%z {} + 2>/dev/null | awk '{s+=$1} END {print s}'; }

android() { # $1 = with|without, $2 = r8 true|false
  local label="android-$1-r8-$2"
  # The React Native Gradle plugin caches autolinking; a stale cache would link the library anyway.
  rm -rf "$ROOT/example/android/build/generated/autolinking"
  ( cd "$ROOT/example/android"
    RC_SIZE_BASELINE=$([ "$1" = without ] && echo 1 || echo 0) \
      ./gradlew --console=plain -q clean :app:assembleRelease \
      -PreactNativeArchitectures=arm64-v8a \
      -PenableProguardInReleaseBuilds="$2" >"$OUT/$label.log" 2>&1 )
  local apk="$ROOT/example/android/app/build/outputs/apk/release/app-release.apk"
  cp "$apk" "$OUT/$label.apk"
  echo "$label $(bytes "$apk") $(unzipped "$apk")" >>"$OUT/raw.txt"
}

ios() { # $1 = with|without
  local label="ios-$1"
  ( cd "$ROOT/example"
    RC_SIZE_BASELINE=$([ "$1" = without ] && echo 1 || echo 0) bundle exec pod install --project-directory=ios >"$OUT/$label-pod.log" 2>&1
    xcodebuild -workspace ios/RemoteComposeExample.xcworkspace -scheme RemoteComposeExample \
      -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
      -derivedDataPath "$OUT/dd-$1" CODE_SIGNING_ALLOWED=NO build >"$OUT/$label.log" 2>&1 )
  local app="$OUT/dd-$1/Build/Products/Release-iphoneos/RemoteComposeExample.app"
  ( cd "$(dirname "$app")" && rm -f "$OUT/$label.zip" && zip -qr9 "$OUT/$label.zip" "$(basename "$app")" )
  echo "$label $(bytes "$OUT/$label.zip") $(dirbytes "$app")" >>"$OUT/raw.txt"
}

: >"$OUT/raw.txt"
if [ "$WHAT" = android ] || [ "$WHAT" = all ]; then
  for r8 in true false; do android without $r8; android with $r8; done
fi
if [ "$WHAT" = ios ] || [ "$WHAT" = all ]; then
  ios without; ios with
  ( cd "$ROOT/example" && bundle exec pod install --project-directory=ios >/dev/null 2>&1 ) # restore
fi

python3 - "$OUT/raw.txt" >"$OUT/report.md" <<'PY'
import sys
rows = {l.split()[0]: (int(l.split()[1]), int(l.split()[2])) for l in open(sys.argv[1]) if l.strip()}
mb = lambda b: f"{b/1_000_000:.2f} MB"
print("| Build | Download (compressed) | Install | Library adds: download / install |")
print("|---|---|---|---|")
for base, lib, name in [
    ("android-without-r8-true", "android-with-r8-true", "Android arm64, R8 on"),
    ("android-without-r8-false", "android-with-r8-false", "Android arm64, R8 off"),
    ("ios-without", "ios-with", "iOS arm64 Release"),
]:
    if base in rows and lib in rows:
        (bd, bi), (ld, li) = rows[base], rows[lib]
        print(f"| {name} | {mb(bd)} → {mb(ld)} | {mb(bi)} → {mb(li)} | **+{mb(ld-bd)} / +{mb(li-bi)}** |")
PY
cat "$OUT/report.md"

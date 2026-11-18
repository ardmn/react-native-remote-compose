# react-native-remote-compose

Play [Remote Compose](https://developer.android.com/jetpack/androidx/releases/compose-remote)
documents (`.rc`) in React Native on **Android and iOS**, drive them from JS with **named values**
(text, numbers, colors) and receive their **actions** (click, long press) as typed events.

Both platforms draw with the same renderer — the Compose Multiplatform player from
[rc-players](https://github.com/yschimke/rc-players) — so one document looks and behaves the same
everywhere. AndroidX's authoring JSON is supported too: converted on the device on Android, and by
the bundled CLI for servers and iOS builds.

```tsx
<RemoteComposeView
  style={{ height: 220 }}
  source={require('./product_card.rc')}           // or { uri }, { base64 }, { json }
  namedValues={{ title: 'Flat white', count, accent: { type: 'color', value: '#6750A4' } }}
  onAction={(e) => e.kind === 'named' && e.name === 'add_to_cart' && setCount((c) => c + 1)}
  onError={(e) => report(e)}                       // also logged to the console with fixes
/>
```

## Get started

Five steps from an empty React Native app to a document that reacts to your state and your taps.
Everything below is copy-paste; the document in step 3 is public, so it works as is.

### 1. Check the requirements

- React Native **0.88+** with the New Architecture (the default), or Expo SDK **58+**.
- **Android:** Kotlin Gradle plugin **2.3 or newer** in the app (step 2 shows where), minSdk 24.
- **iOS:** 15.1+, Xcode 16+, Apple-silicon simulators and devices (rc-players ships no x86_64 slice).
- Expo Go cannot load native code: use a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

### 2. Install

**Bare React Native**

```sh
yarn add react-native-remote-compose        # or: npm install react-native-remote-compose
cd ios && bundle exec pod install && cd ..
```

In `android/build.gradle`, use a Kotlin that can read rc-players (built with Kotlin 2.4; React
Native's default 2.2 fails with `compiler version 2.2.0 can read versions up to 2.3.0`):

```groovy
buildscript {
  ext {
    kotlinVersion = "2.3.21"
  }
  dependencies {
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
  }
}
```

In `ios/<YourApp>/Info.plist`, let animations run at the display's full rate (ProMotion):

```xml
<key>CADisableMinimumFrameDurationOnPhone</key>
<true/>
```

**Expo**

```sh
npx expo install react-native-remote-compose
```

```json
{
  "expo": {
    "plugins": ["react-native-remote-compose"]
  }
}
```

The config plugin does both edits above for you (it never lowers a newer Kotlin or deployment
target). Then build and run a development build: `npx expo run:android` / `npx expo run:ios`
(or EAS Build).

Rebuild the native app after installing; a hot reload is not enough.

### 3. Show a document

```tsx
import { View } from 'react-native';
import { RemoteComposeView } from 'react-native-remote-compose';

const CARD =
  'https://raw.githubusercontent.com/ardmn/react-native-remote-compose/main/example-shared/documents/rc/product_card.rc';

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <RemoteComposeView style={{ height: 240, margin: 16 }} source={{ uri: CARD }} />
    </View>
  );
}
```

You should see a product card with a title, a rating bar and an **Add to cart** button.
`product_card.rc` is the demo document in this repository; its source is
[`product_card.json`](example-shared/documents/json/product_card.json).

### 4. Drive it from your state, react to its actions

The card declares the named values `title` and `subtitle` (text), `rating` and `count` (numbers)
and the color `accent`, and raises the actions `add_to_cart` (click) and `show_details` (long
press). `onLoad` lists the names any document declares.

```tsx
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { RemoteComposeView } from 'react-native-remote-compose';

const CARD =
  'https://raw.githubusercontent.com/ardmn/react-native-remote-compose/main/example-shared/documents/rc/product_card.rc';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <RemoteComposeView
        style={{ height: 240, margin: 16 }}
        source={{ uri: CARD }}
        namedValues={{
          title: 'Flat white',                          // a string sets text
          subtitle: 'Oat milk, extra hot',
          rating: 0.8,                                  // a number sets a number (0…1 here)
          count,
          accent: { type: 'color', value: '#6750A4' },  // colors are tagged; any React Native color
        }}
        onAction={(event) => {
          if (event.kind !== 'named') return;
          if (event.name === 'add_to_cart') setCount((c) => c + 1);
          if (event.name === 'show_details') Alert.alert('Details', 'Long press in the document');
        }}
        onLoad={(event) => console.log('declares', event.namedValues)}
        onError={(error) => console.warn(error.code, error.message)}
      />
    </View>
  );
}
```

Tap **Add to cart**: `count` goes up in React state and the document shows it. Long-press the
card: the alert opens. Change `title` or `accent` and the document updates in place, without
reloading.

### 5. Ship documents with the app (optional)

Load documents from your server as above, or bundle them so they work offline. Download
[`product_card.rc`](https://raw.githubusercontent.com/ardmn/react-native-remote-compose/main/example-shared/documents/rc/product_card.rc)
next to your code, and let Metro bundle `.rc` files:

```js
// metro.config.js
const { getDefaultConfig } = require('@react-native/metro-config'); // Expo: require('expo/metro-config')

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('rc');
module.exports = config;
```

```tsx
<RemoteComposeView source={require('./product_card.rc')} />
```

Restart Metro with `--reset-cache` after changing `assetExts`.

### Before you release

- **Android: turn on R8** (`def enableProguardInReleaseBuilds = true` in `android/app/build.gradle`;
  React Native's template ships it off). It cuts the library's cost from +7.2 MB to +1.3 MB
  download (see [App size](#app-size)). No keep rules are needed.
- **Errors are logged for you.** Every error is printed once to the console with how to fix it,
  whether or not you pass `onError`:

  ```
  [react-native-remote-compose] load error: HTTP 404 for https://…/card.rc
  How to fix:
    • Check the document URL; the server has no file there.
  ```

## Platform support

| | Android | iOS |
|---|---|---|
| Renderer | rc-players `RcComposePlayer` in a `ComposeView` | rc-players `RcComposePlayer.xcframework` (SwiftPM) |
| `.rc` from `uri` / `require` / `base64` | ✅ | ✅ |
| AndroidX JSON (`{ json }`, `convertJsonToRc`) | ✅ on device (AndroidX `RemoteComposeJsonParser`) | ❌ — convert with `tools/remote-compose-json` |
| Named values: float, string, color | ✅ | ✅ |
| Named values: int, boolean | ✅ | ❌ (the iOS player controller sets float/string/color only) |
| Actions: click, long press, metadata, numeric | ✅ | ✅ |
| Bare React Native | ✅ | ✅ |
| Expo (development build) | ✅ | ✅ |
| Expo Go | ❌ (no third-party native code) | ❌ |

## API

### `<RemoteComposeView>`

| Prop | Type | |
|---|---|---|
| `source` | `require(...)` · `{ uri, headers? }` · `{ base64 }` · `{ json }` | Loaded natively, off the main thread. |
| `namedValues` | `Record<string, number \| string \| boolean \| {type, value}>` | Plain values infer float/string/boolean; use `{ type: 'color' \| 'int', value }` otherwise. Bare names address the document's `USER:` domain. |
| `theme` | `'system' \| 'light' \| 'dark'` | Picks the light/dark half of themed colors. Default `system`. |
| `lenient` | `boolean` | Draw nothing for operations the player knows but cannot draw, instead of refusing the document. |
| `onAction` | `(e) => void` | `{kind:'named', name, valueType, value}` (value typed by `valueType`: `none` → `null`, `float`/`int` → number, `string` → string, `floatList` → number[]) · `{kind:'host', actionId}` · `{kind:'metadata', actionId, metadata}` |
| `onLoad` | `(e) => void` | `{ byteLength, loadMs, decodeMs, namedValues }` — the names the document lets you set. |
| `onError` | `(e) => void` | `{ code, message }`, see [Errors](#errors). |
| `ref` | `Ref` | The native view, for `measure` and friends. |

### Functions

- `isJsonConversionSupported(): boolean` — `true` on Android.
- `convertJsonToRc(json): Promise<string>` — AndroidX JSON → `.rc` (base64) on Android; rejects on iOS.
- `formatError(error): string` — the console text for an error.

### Errors

`onError` receives `{ code, message }`:

| `code` | Meaning |
|---|---|
| `props` | A prop is invalid (reported from JS, with the prop's name). An invalid `source` shows no document; an invalid named value is not sent, the valid ones still are. |
| `load` | The bytes could not be obtained: network, file, base64, JSON conversion. |
| `document` | The player refused the document, or a named value's type does not match the declared one. |
| `unsupported` | Not available on this platform: `{ json }` on iOS, or a platform without a player (web). |

Each one is also logged once to the console with fix suggestions. Importing the library never
crashes the app; a missing native module is reported when first used, with rebuild instructions.

## Authoring documents

**See every building block first:** the
[Remote Compose Storybook](https://ardmn.github.io/remote-compose-storybook/) is a live catalog of
the public `@RemoteComposable` API: each component and modifier rendered, with the code that
produces it and what it writes into the document.

Author in Kotlin with Remote Compose's `@RemoteComposable` API, or as
[AndroidX authoring JSON](https://github.com/androidx/androidx/blob/androidx-main/compose/remote/Documentation/parts/json-parser.md)
from any backend. Convert JSON with the bundled CLI — it also runs rc-players' own renderability
check, so a document the player would refuse fails **at build time**, not on a device:

```sh
tools/remote-compose-json/gradlew -p tools/remote-compose-json installDist
remote-compose-json card.json card.rc          # one file
remote-compose-json --dir documents/ out/      # every *.json
remote-compose-json --dump card.rc             # print a document's structure
```

Lessons from the demo documents (all verified on devices):

- **Host values live in `USER:`.** The JSON parser declares bare names (`accent`); the converter moves
  them to `USER:accent`, which every player addresses (the iOS player only accepts that form).
- **Text the host changes must not animate its bounds.** AndroidX animates every component to its new
  size by default; a growing title then wraps out of sight for ~280 ms while it animates. Put
  `{"animationSpec": 0}` (AndroidX's "land at once") on host-driven texts.
- **Press, click and long press are different events.** `onTouchDown`/`onTouchUp`/`onTouchCancel`
  drive a pressed state; `onClick` fires on release; `multiClick` with `clickType: 1` is a long press
  (needs header `"profiles": 513`). Keep the pressed look for a minimum time after release
  (`max(@pressed, clamp(1 - (time - @releasedAt) / 0.22, 0, 1))`) so fast taps are visible.
- **Reference variables as `@name`** in action targets; a bare `"name"` becomes a text, not the variable.
- **Read the clock through an expression** (`"time + 0"`), not the bare system id, in value changes.
- Set `"densityBehavior": 2` and `"apiLevel": 8` so sizes are dp, not pixels.

## Performance

Measured with `yarn measure:perf android|ios` on **release** builds of the bare demo (Android with
R8): 12 documents mounted at once, each animating continuously, 6 runs (run 1 cold), median with the
range in brackets. Emulator and simulator on an Apple-silicon Mac with the host otherwise idle —
indicative, not a phone benchmark; repeat on target devices before relying on exact numbers.

| | Android (emulator, API 37) | iOS (simulator, iPhone 17) |
|---|---|---|
| 12 documents mounted → all loaded | **67 ms** (58–117) | **163 ms** (153–726) |
| Load per document | 26 ms (16–31), background thread | 0.1 ms (bundled file), background |
| Decode + validate per document | 8 ms (5–18), background thread | 2.5 ms (2.4–5), main thread¹ |
| UI thread, 12 animating: janky frames | **0.5 %** (0–1.1) | — |
| Longest JS-thread stall: no document → 12 animating | 25 → **21 ms** | 9.8 → **8.8 ms** |
| JS frame callbacks/s: no document → 12 animating | 41 → 30 (both vary 30–60)² | 60 → **60** |

What this shows: loading, decoding and validation never run on the JS thread; documents animate
on the native side, so a dozen animating documents leave the JS thread as responsive as with none.

¹ rc-players' iOS controller decodes as it is created; it runs on the main thread by design.
² The Android emulator alternates JS frame callbacks between 30 and 60 per second even with no
document on screen, so that row does not isolate the documents' cost.

## App size

Measured with `yarn measure:size` (`scripts/measure-size.ts`) on release builds of the bare demo,
built with and without the library's native part (same JS, so the difference is the library):

| | App without → with the library: download | on device | **Library adds** |
|---|---|---|---|
| **Android** arm64, R8 on | 6.39 → 7.72 MB | 16.71 → 19.37 MB | **+1.3 MB download / +2.7 MB on device** |
| Android arm64, R8 off | 9.57 → 16.77 MB | 26.23 → 46.42 MB | +7.2 MB / +20.2 MB |
| **iOS** arm64 | 5.94 → 19.60 MB | 21.12 → 59.17 MB | **+13.7 MB download / +38.1 MB on device** |

How each number is obtained:

- **Android** is sized as Google Play serves it. The release App Bundle goes through Google's
  [bundletool](https://developer.android.com/tools/bundletool) for one arm64 phone:
  `get-size total` gives the *download*, and the split APKs bundletool would install for that phone
  give the size *on device*. That figure is the APKs only; Android adds compiled-code caches on top.
- **iOS** is a Release archive for devices (`xcodebuild archive`), whose binaries Xcode strips as
  for the App Store. *On device* is the `.app`'s bytes; *download* is a `zip -9` of it. That is a
  **lower bound**: the App Store encrypts the executable, and encrypted bytes do not compress, so
  the real figure (App Store Connect's App Thinning report) can be higher.

**Why iOS costs more.** Both platforms run the same Compose Multiplatform renderer, but:

- **Android** already ships the graphics engine: Compose draws through `android.graphics`, whose
  Skia lives in the OS. The APK carries no Skia at all (its only extra native file is androidx's
  10 KB `libandroidx.graphics.path.so`); what the library adds is Kotlin/JVM bytecode — Compose,
  the player, Kotlin coroutines — which **R8 shrinks to what is used**.
- **iOS** has no Compose and no Skia. rc-players' XCFramework statically links the Compose
  Multiplatform UI, **Skia (Skiko — ~102 000 Skia symbols in the framework)** and the Kotlin/Native
  runtime into the app binary. Static linking keeps only reachable code, but a whole UI toolkit and
  a 2D graphics engine remain.

**Enable R8 on Android** (`minifyEnabled true` in release; React Native's template ships it off):
without it the same library costs 5× more download and 7× more space on the device. The release build with R8
was run on a device with no extra keep rules (no crashes, documents render).

## How it works

- **JS** maps props to a flat Codegen spec and events back to typed objects; it never touches
  document bytes.
- **One contract.** `src/RemoteComposeViewNativeComponent.ts` is the only place prop, event and
  value names are written. React Native Codegen generates the C++ structs from it; `yarn contract`
  generates the Kotlin and Swift models (and their C++ conversions) Codegen does not, and CI fails
  when they drift from the spec.
- **Android** (Kotlin): `RemoteComposeView` (a `FrameLayout` hosting a `ComposeView`). Loading,
  JSON conversion, decoding and rc-players' support check run on background dispatchers; the main
  thread only swaps the decoded document into Compose state. Host values are matched against the
  names and types the document declares, with rc-players' own lookup; a mismatch is reported,
  never applied (the player would throw). Network loads use React Native's OkHttp client, so the
  app's network setup applies.
- **iOS** (Swift; Objective-C++ only for the Fabric component glue that Codegen requires):
  `RemoteComposeHostView` loads bytes off the main thread and hosts rc-players'
  `RemoteComposePlayerViewController`; values go through its `RemoteComposePlayerController`.

## Development

```
src/                 library TypeScript (Codegen spec, view, diagnostics)
android/  ios/       native views (Kotlin, Swift + thin Obj-C++)
plugin/              Expo config plugin
tools/remote-compose-json/   JSON → .rc CLI (AndroidX parser + rc-players checks)
example/             bare React Native demo        example-expo/   Expo demo (CNG)
example-shared/      screens and documents both demos use
e2e/                 Maestro device flows
scripts/             TypeScript tooling: native contract, measurements, document conversion (macOS, Linux, Windows)
```

```sh
yarn                        # install (lockfile immutable in CI)
yarn lint && yarn typecheck && yarn test
yarn example android | ios  # bare demo;  cd example-expo && npx expo run:android | run:ios
maestro test -e APP_ID=remotecompose.example e2e/host-values.yaml e2e/network.yaml
yarn contract               # regenerate native models after changing the Codegen spec
xcodebuild test -workspace example/ios/RemoteComposeExample.xcworkspace \
  -scheme RemoteCompose-Unit-Tests -destination 'platform=iOS Simulator,name=iPhone 17'
yarn documents              # regenerate demo .rc files from their JSON
yarn measure:size           # what the library adds to an app (Android on any OS, iOS on macOS)
yarn measure:perf android   # release-build performance (also: ios)
```

Tests describe behaviour, not implementation: the JS view contract and diagnostics (Jest +
Testing Library), the Expo plugin's rules, converter output and demo-document integrity (Kotlin),
host values, player events, props and bounded reads (Android unit, and Swift XCTest through the
podspec's `Tests` test spec), and device E2E on bare and Expo apps (Maestro).

### Releasing

Bump `version` in `package.json`, commit, wait for CI to pass, then push a tag `v<version>`. The
`Release` workflow checks that CI passed for that commit, runs the checks again from a clean
install and publishes with [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers):
no npm token exists, and npm attaches a provenance attestation to the release.

### Supply chain

Exact versions everywhere; `yarn.lock` is installed with `--immutable` in Yarn's hardened mode;
install scripts are disabled; npm releases younger than 7 days are never resolved
(`npmMinimalAgeGate`); OSV-Scanner gates CI with reviewed, expiring exceptions
(`osv-scanner.toml`); Dependabot proposes updates with the same 7-day cooldown; GitHub Actions are
pinned by SHA and downloaded tools by checksum. A local `commit-msg` hook enforces conventional
commits.

## Sources

React Native [Fabric native components](https://reactnative.dev/docs/fabric-native-components-introduction) ·
[create-react-native-library](https://oss.callstack.com/react-native-builder-bob/create) ·
Expo [config plugins](https://docs.expo.dev/config-plugins/introduction/),
[monorepos](https://docs.expo.dev/guides/monorepos/) ·
[Remote Compose Storybook](https://ardmn.github.io/remote-compose-storybook/) ·
[rc-players](https://github.com/yschimke/rc-players) (player API, Swift integration in
`docs/design/RC_PLAYER_SWIFT.md`) ·
AndroidX [Remote Compose](https://github.com/androidx/androidx/tree/androidx-main/compose/remote) ·
TypeScript 7 [side by side with 6](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) ·
[React Native Testing Library v14](https://oss.callstack.com/react-native-testing-library/) ·
[Maestro](https://maestro.mobile.dev) · [OSV-Scanner](https://google.github.io/osv-scanner/).

## License

MIT

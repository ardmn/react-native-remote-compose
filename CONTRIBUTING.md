# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

This project is a monorepo managed using [Yarn workspaces](https://yarnpkg.com/features/workspaces). It contains the following packages:

- The library package in the root directory.
- An example app in the `example/` directory.

To get started with the project, make sure you have the correct version of [Node.js](https://nodejs.org/) installed. See the [`.nvmrc`](./.nvmrc) file for the version used in this project.

Run `yarn` in the root directory to install the required dependencies for each package:

```sh
yarn
```

> Since the project relies on Yarn workspaces, you cannot use [`npm`](https://github.com/npm/cli) for development without manually migrating.

The [example app](/example/) demonstrates usage of the library. You need to run it to test any changes you make.

It is configured to use the local version of the library, so any changes you make to the library's source code will be reflected in the example app. Changes to the library's JavaScript code will be reflected in the example app without a rebuild, but native code changes will require a rebuild of the example app.

If you want to use Android Studio or Xcode to edit the native code, you can open the `example/android` or `example/ios` directories respectively in those editors. To edit the Objective-C or Swift files, open `example/ios/RemoteComposeExample.xcworkspace` in Xcode and find the source files at `Pods > Development Pods > react-native-remote-compose`.

To edit the Java or Kotlin files, open `example/android` in Android studio and find the source files at `react-native-remote-compose` under `Android`.

You can use various commands from the root directory to work with the project.

To start the packager:

```sh
yarn example start
```

To run the example app on Android:

```sh
yarn example android
```

To run the example app on iOS:

```sh
yarn example ios
```

Make sure your code passes TypeScript:

```sh
yarn typecheck
```

To check for linting errors, run the following:

```sh
yarn lint
```

To fix formatting errors, run the following:

```sh
yarn lint --fix
```

### Static analysis

CI runs these checks and fails on any finding, warnings included (`yarn lint` runs with
`--max-warnings 0`, Android Lint with `-PremoteComposeStrictLint=true`, which turns on
`warningsAsErrors`). Without that property Android Lint fails on errors only: `android/` ships in the
npm package, and an app that lints the library with a newer lint must not fail on a new warning.

No tool has a baseline of old findings. A finding is fixed, or, when the code is right as it is,
suppressed on the narrowest element with the reason next to it:

- ESLint: `// eslint-disable-next-line <rule> -- <reason>`. A disable that no longer matches a
  finding is reported, and fails with `--max-warnings 0`. No bulk suppressions
  (`eslint-suppressions.json`): they count per file and rule, so a fixed violation can hide a new one.
- detekt: `@Suppress("<Rule>")` on the catch parameter, expression or declaration, with a comment.
  Its baseline matched by file name and signature, so one entry hid every `catch (e: Exception)` in a
  file of that name.
- Android Lint: `@SuppressLint("<Id>")` (or `@Suppress`, in code the JVM-only CLI also compiles), with
  a comment.
- knip fails on an `ignoreDependencies` entry that is no longer needed. A `@knipignore` tag covers
  only the export it is on; knip does not report one left on an export that became used.
- Android Lint skips the checks whose result changes with no code change (newer versions published,
  Google's SDK Index, the date); see `lint` in `android/build.gradle`.

| Area | Tool (pinned in CI) | Run locally | Baseline |
| --- | --- | --- | --- |
| TypeScript | ESLint with typescript-eslint `strictTypeChecked` | `yarn lint` | none |
| TypeScript | `tsc` (`strict`, `noUncheckedIndexedAccess`) | `yarn typecheck` | none |
| All workspaces | knip 6.45.1 (unused files, exports, dependencies) | `yarn knip` | `ignoreDependencies` in `knip.jsonc`; `@knipignore` on single exports |
| Kotlin | ktlint 1.8.0 | `ktlint "android/src/**/*.kt" "!android/src/main/java/com/remotecompose/contract/**" "tools/remote-compose-json/**/*.kt" "tools/remote-compose-json/*.kts"` | none |
| Kotlin | detekt 1.23.8 | `detekt --build-upon-default-config --config detekt.yml --input android/src,tools/remote-compose-json/src --excludes '**/contract/**'` | none |
| Android | Android Lint | `example/android/gradlew -p example/android :react-native-remote-compose:lintDebug -PremoteComposeStrictLint=true` | none |
| Swift | SwiftFormat 0.64.7 | `swiftformat --lint ios` | none |
| Swift | SwiftLint 0.65.1 | `swiftlint lint --strict` | none |
| Secrets | gitleaks 8.30.1, every commit reachable from `HEAD` | `gitleaks git --config .gitleaks.toml --log-opts="--diff-merges=separate HEAD" .` | allowlist in `.gitleaks.toml` |
| Dependencies | OSV-Scanner | `osv-scanner scan --config=osv-scanner.toml --lockfile=yarn.lock --lockfile=example/Gemfile.lock --lockfile=example/android/app/gradle.lockfile --lockfile=tools/remote-compose-json/gradle.lockfile` | `osv-scanner.toml` |
| Versions | `scripts/check-versions.ts` (copies of native dependency versions agree) | `yarn lint` | none |

Use the versions in the table locally. CI downloads exactly those through
`.github/actions/fetch-tool`, which checks each file's SHA-256 (pinned in the `env` of the `lint` and
`secrets` jobs in `.github/workflows/ci.yml`) before using it, cached or not. CI runs SwiftLint's statically linked Linux build
(`swiftlint-static`), which has no SourceKit and skips the rules that need it (such as
`statement_position`; SwiftFormat covers that one). SwiftLint on macOS runs those rules too, so it can
report findings CI does not.

### Bumping AndroidX Remote Compose or rc-players

`android/gradle/libs.versions.toml` owns both versions for Android (the library) and the JSON CLI,
which imports it as its version catalog. Dependabot reads it (through both Gradle directories) and
proposes new releases; Compose Multiplatform (`composeMultiplatform`) is excluded there because it
follows rc-players. The copies
below exist because their tools cannot read the catalog; `yarn lint` (`scripts/check-versions.ts`)
fails while any of them disagrees with it, so a Dependabot bump fails CI until they are updated in the
same pull request:

- `androidxRemote`: the tested version in the README ("`{ json }` relies on an AndroidX-internal
  parser"). Then run `yarn documents` and review any changed `.rc`.
- `rcPlayers`: `rc_players_version` in `RemoteCompose.podspec` (iOS); the rc-players pin in
  `example/ios/RemoteComposeExample.xcworkspace/xcshareddata/swiftpm/Package.resolved` (version and
  revision; Xcode rewrites it when it resolves packages, e.g.
  `xcodebuild -resolvePackageDependencies -workspace example/ios/RemoteComposeExample.xcworkspace -scheme RemoteComposeExample`;
  the check does not verify the revision); and the tag in the fixtures URL and its comment in
  `example-shared/src/documents.ts`.
- `composeMultiplatform`: the Compose Multiplatform release the new rc-player-compose depends on
  (its POM); the check fails when `org.jetbrains.compose.ui:ui-android` in the example's lockfile is
  a different version, which catches rc-players moving ahead but not this value raised above it.
- Both Gradle lockfiles, which OSV-Scanner scans (CI fails when they do not match the dependencies;
  a Dependabot pull request may already have rewritten the CLI's):

  ```sh
  tools/remote-compose-json/gradlew -p tools/remote-compose-json dependencies --write-locks
  example/android/gradlew -p example/android :app:dependencies --configuration releaseRuntimeClasspath --write-locks
  ```

  The same applies to any other dependency change in those two builds. The library's own
  `android/build.gradle` has no lock: it runs inside each app's build, where a lock would pin the
  app's dependencies to ours, so the example app's lock stands for what an app ships.

The Kotlin floor has its owner in `MIN_KOTLIN` (`plugin/withRemoteCompose.js`); the same check
compares the default `kotlinVersion` in `android/build.gradle` and the README's Gradle snippet with it.

### Scripts

The `package.json` file contains various scripts for common tasks:

- `yarn`: setup project by installing dependencies.
- `yarn typecheck`: type-check files with TypeScript.
- `yarn lint`: lint files with [ESLint](https://eslint.org/).
- `yarn example start`: start the Metro server for the example app.
- `yarn example android`: run the example app on Android.
- `yarn example ios`: run the example app on iOS.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.

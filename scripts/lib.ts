/**
 * Process, file and build helpers for the repository scripts. They run with Node 24's built-in
 * TypeScript support (`node scripts/<name>.ts`, or the `yarn …` scripts) on macOS, Linux and
 * Windows; only iOS steps need macOS. A command's output goes to a log file as it runs, and a
 * failing command stops the script with a message that names the log and what to do.
 */
import crossSpawn from 'cross-spawn';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync, constants as zlib } from 'node:zlib';

export const ROOT = resolve(import.meta.dirname, '..');
export const IS_WINDOWS = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

/** The bare demo app, as the measurement scripts build and launch it. */
export const DEMO = {
  dir: join(ROOT, 'example'),
  androidProject: join(ROOT, 'example/android'),
  androidApplicationId: 'remotecompose.example',
  iosWorkspace: 'ios/RemoteComposeExample.xcworkspace',
  iosScheme: 'RemoteComposeExample',
  iosBundleId: 'remotecompose.example',
  iosAppName: 'RemoteComposeExample.app',
} as const;

const env = (name: string): string | undefined =>
  process.env[name] || undefined;

/** The Android SDK: ANDROID_HOME (or the older ANDROID_SDK_ROOT), else Android Studio's default. */
const ANDROID_SDK =
  env('ANDROID_HOME') ??
  env('ANDROID_SDK_ROOT') ??
  (IS_WINDOWS
    ? join(
        env('LOCALAPPDATA') ?? join(homedir(), 'AppData/Local'),
        'Android/Sdk'
      )
    : IS_MAC
      ? join(homedir(), 'Library/Android/sdk')
      : join(homedir(), 'Android/Sdk'));

const ADB = join(ANDROID_SDK, 'platform-tools', IS_WINDOWS ? 'adb.exe' : 'adb');

/** The JDK Gradle uses: JAVA_HOME, else `java` on the PATH. */
const JAVA = env('JAVA_HOME')
  ? join(env('JAVA_HOME')!, 'bin', IS_WINDOWS ? 'java.exe' : 'java')
  : 'java';

/** The Gradle wrapper of a project directory, as this OS runs it. */
export const gradlew = (dir: string) =>
  join(dir, IS_WINDOWS ? 'gradlew.bat' : 'gradlew');

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  /** Write stdout and stderr, interleaved and as they come, to this file instead of returning them. */
  log?: string;
};

/**
 * Runs a command without a shell (cross-spawn quotes arguments correctly for `.bat` files on
 * Windows). Returns stdout, or '' when the output goes to `log`. Throws, saying why and what to
 * check, when the command cannot start, is killed, or exits non-zero.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {}
): string {
  const logFd = options.log ? openSync(options.log, 'w') : undefined;
  try {
    const result = crossSpawn.sync(command, [...args], {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ANDROID_HOME: ANDROID_SDK, ...options.env },
      stdio:
        logFd === undefined
          ? ['ignore', 'pipe', 'pipe']
          : ['ignore', logFd, logFd],
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const shown = `${command} ${args.join(' ')}`;
    if (result.error) {
      const missing = 'code' in result.error && result.error.code === 'ENOENT';
      throw new Error(
        missing
          ? `${command} was not found. Install it, or check ANDROID_HOME / JAVA_HOME / PATH.`
          : `${shown} could not run: ${result.error.message}`
      );
    }
    if (result.signal)
      throw new Error(`${shown} was killed by ${result.signal}`);
    if (result.status !== 0) {
      const detail = options.log
        ? `see ${options.log}`
        : (result.stderr || result.stdout).slice(-2000);
      throw new Error(`${shown} exited with ${result.status} — ${detail}`);
    }
    return logFd === undefined ? result.stdout : '';
  } finally {
    if (logFd !== undefined) closeSync(logFd);
  }
}

/** Runs adb from the SDK; fails up front, with the fix, when the SDK is not where it is looked for. */
export function adb(...args: string[]): string {
  if (!existsSync(ADB)) {
    throw new Error(
      `adb not found at ${ADB}. Set ANDROID_HOME to your Android SDK.`
    );
  }
  return run(ADB, args);
}

/** Total bytes of the regular files under a directory. */
export function directoryBytes(dir: string): number {
  return regularFiles(dir).reduce(
    (total, file) => total + statSync(file).size,
    0
  );
}

/**
 * What a zip at maximum compression of a directory would weigh (each file deflated at level 9 —
 * what `zip -9` stores — plus the zip's per-file headers), computed in-process on every OS.
 */
export function deflatedBytes(dir: string): number {
  const ZIP_HEADERS_PER_FILE = 30 + 46; // local file header + central directory entry
  return regularFiles(dir).reduce((total, file) => {
    const bytes = readFileSync(file);
    const deflated = deflateRawSync(bytes, {
      level: zlib.Z_BEST_COMPRESSION,
    }).length;
    const nameBytes = 2 * Buffer.byteLength(file.slice(dir.length));
    return (
      total +
      Math.min(deflated, bytes.length) +
      ZIP_HEADERS_PER_FILE +
      nameBytes
    );
  }, 0);
}

function regularFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Megabytes with a sign, for deltas: `+1.52 MB`, `-0.01 MB`. */
export const signedMb = (bytes: number) =>
  `${bytes >= 0 ? '+' : '-'}${mb(Math.abs(bytes))}`;
export const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;

// region Android builds

export type AndroidBuild = {
  /** R8 code shrinking and obfuscation, as `minifyEnabled` in the demo's release build type. */
  r8: boolean;
  /** The single ABI to build native code for, e.g. `arm64-v8a`. */
  abi: string;
  /** Gradle task: `assembleRelease` for an APK to install, `bundleRelease` for an App Bundle. */
  output: 'apk' | 'bundle';
  env?: Record<string, string>;
  log: string;
};

/** Builds the demo's release APK or App Bundle from clean and returns its path. */
export function buildAndroidRelease(build: AndroidBuild): string {
  const project = DEMO.androidProject;
  // The React Native Gradle plugin caches autolinking; a stale cache would link the library anyway.
  rmSync(join(project, 'build/generated/autolinking'), {
    recursive: true,
    force: true,
  });
  // clean: the JS bundle task watches example/ only, not the shared screens in example-shared/.
  run(
    gradlew(project),
    [
      '--console=plain',
      'clean',
      build.output === 'apk' ? ':app:assembleRelease' : ':app:bundleRelease',
      `-PreactNativeArchitectures=${build.abi}`,
      `-PenableProguardInReleaseBuilds=${build.r8}`,
    ],
    { cwd: project, env: build.env, log: build.log }
  );
  return build.output === 'apk'
    ? join(project, 'app/build/outputs/apk/release/app-release.apk')
    : join(project, 'app/build/outputs/bundle/release/app-release.aab');
}

/** The connected device's primary ABI, after checking one is connected and authorised. */
export function connectedAndroidAbi(): string {
  try {
    adb('get-state');
  } catch (e) {
    throw new Error(
      `No Android device is ready: start an emulator or connect a device, then accept the USB-debugging prompt. (${e instanceof Error ? e.message : String(e)})`
    );
  }
  return adb('shell', 'getprop', 'ro.product.cpu.abi').trim();
}

// endregion

// region bundletool

const BUNDLETOOL = {
  version: '1.18.3',
  // From GitHub's release digest for bundletool-all-1.18.3.jar.
  sha256: 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29',
} as const;

/** Google's bundletool jar, downloaded once into build/tools and verified against its checksum. */
async function bundletoolJar(): Promise<string> {
  const name = `bundletool-all-${BUNDLETOOL.version}.jar`;
  const jar = join(ROOT, 'build/tools', name);
  if (!existsSync(jar)) {
    const url = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL.version}/${name}`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== BUNDLETOOL.sha256) {
      throw new Error(
        `${url} has checksum ${digest}, expected ${BUNDLETOOL.sha256}; refusing to run it.`
      );
    }
    mkdirSync(join(ROOT, 'build/tools'), { recursive: true });
    writeFileSync(jar, bytes);
  }
  return jar;
}

/** Runs bundletool with the JDK Gradle uses. */
export async function bundletool(
  args: readonly string[],
  log?: string
): Promise<string> {
  return run(JAVA, ['-jar', await bundletoolJar(), ...args], { log });
}

// endregion

// region iOS builds

/** Builds the demo for the simulator (to run) or archives it for devices (to measure). */
export function buildIos(build: {
  target: 'simulator' | 'device-archive';
  derivedData: string;
  log: string;
}): string {
  if (!IS_MAC) throw new Error('iOS builds need macOS with Xcode.');
  const common = [
    '-workspace',
    DEMO.iosWorkspace,
    '-scheme',
    DEMO.iosScheme,
    '-configuration',
    'Release',
    '-derivedDataPath',
    build.derivedData,
  ];
  if (build.target === 'simulator') {
    run(
      'xcodebuild',
      [...common, '-destination', 'generic/platform=iOS Simulator', 'build'],
      {
        cwd: DEMO.dir,
        log: build.log,
      }
    );
    return join(
      build.derivedData,
      'Build/Products/Release-iphonesimulator',
      DEMO.iosAppName
    );
  }
  // An archive, as for the App Store: Xcode's own install step strips the binaries
  // (DEPLOYMENT_POSTPROCESSING, STRIP_STYLE), so nothing is emulated here. No signing is needed
  // to measure it.
  const archive = join(build.derivedData, `${DEMO.iosScheme}.xcarchive`);
  rmSync(archive, { recursive: true, force: true });
  run(
    'xcodebuild',
    [
      ...common,
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archive,
      'CODE_SIGNING_ALLOWED=NO',
      'archive',
    ],
    { cwd: DEMO.dir, log: build.log }
  );
  return join(archive, 'Products/Applications', DEMO.iosAppName);
}

// endregion

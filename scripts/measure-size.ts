/**
 * What react-native-remote-compose adds to an app, from release builds of the bare demo built once
 * with the library and once with its native part unlinked (RC_SIZE_BASELINE=1, see
 * example/react-native.config.js). The JS is the same, so the difference is the library's cost.
 *
 *   Android  arm64-v8a release APK. APK bytes ≈ Play download for one device (Play serves per-ABI
 *            splits); uncompressed entries ≈ install size. Measured with R8 on and off.
 *   iOS      arm64 device Release .app, every Mach-O stripped as an App Store archive strips it.
 *            Bytes ≈ install size; a zip -9 of it ≈ App Store download (a lower bound: the store
 *            encrypts the executable, and encrypted bytes do not compress).
 *
 * Usage: yarn measure:size [android|ios|all]   → build/size/report.md
 * Android runs on macOS, Linux and Windows; iOS needs macOS.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  directoryBytes,
  gradlew,
  mb,
  run,
  zipUncompressedBytes,
} from './lib.ts';

const OUT = join(ROOT, 'build/size');
mkdirSync(OUT, { recursive: true });
const RAW = join(OUT, 'raw.json');
const what = process.argv[2] ?? 'all';
if (!['android', 'ios', 'all'].includes(what)) {
  console.error('usage: yarn measure:size [android|ios|all]');
  process.exit(2);
}

type Variant = 'with' | 'without';
type Row = { download: number; install: number };
const rows: Record<string, Row> =
  what !== 'all' && existsSync(RAW)
    ? JSON.parse(readFileSync(RAW, 'utf8'))
    : {};
for (const key of Object.keys(rows))
  if (key.startsWith(`${what}-`)) delete rows[key];
const baselineEnv = (variant: Variant) => ({
  RC_SIZE_BASELINE: variant === 'without' ? '1' : '0',
});

function android(variant: Variant, r8: boolean) {
  const label = `android-${variant}-r8-${r8 ? 'on' : 'off'}`;
  console.log(`building ${label}…`);
  const project = join(ROOT, 'example/android');
  // The React Native Gradle plugin caches autolinking; a stale cache would link the library anyway.
  rmSync(join(project, 'build/generated/autolinking'), {
    recursive: true,
    force: true,
  });
  // clean: the JS bundle task watches example/ only, not example-shared/.
  run(
    gradlew(project),
    [
      '--console=plain',
      '-q',
      'clean',
      ':app:assembleRelease',
      '-PreactNativeArchitectures=arm64-v8a',
      `-PenableProguardInReleaseBuilds=${r8}`,
    ],
    { cwd: project, env: baselineEnv(variant), log: join(OUT, `${label}.log`) }
  );
  const apk = join(OUT, `${label}.apk`);
  copyFileSync(
    join(project, 'app/build/outputs/apk/release/app-release.apk'),
    apk
  );
  rows[label] = {
    download: statSync(apk).size,
    install: zipUncompressedBytes(apk),
  };
}

function ios(variant: Variant) {
  const label = `ios-${variant}`;
  console.log(`building ${label}…`);
  const example = join(ROOT, 'example');
  run('bundle', ['exec', 'pod', 'install', '--project-directory=ios'], {
    cwd: example,
    env: baselineEnv(variant),
    log: join(OUT, `${label}-pod.log`),
  });
  const derived = join(OUT, `dd-${variant}`);
  run(
    'xcodebuild',
    [
      '-workspace',
      'ios/RemoteComposeExample.xcworkspace',
      '-scheme',
      'RemoteComposeExample',
      '-configuration',
      'Release',
      '-sdk',
      'iphoneos',
      '-destination',
      'generic/platform=iOS',
      '-derivedDataPath',
      derived,
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ],
    { cwd: example, log: join(OUT, `${label}.log`) }
  );
  const app = join(
    derived,
    'Build/Products/Release-iphoneos/RemoteComposeExample.app'
  );
  // An App Store archive strips the shipped binaries (STRIP_STYLE=all); `xcodebuild build` does not.
  for (const file of run('find', [app, '-type', 'f']).trim().split('\n')) {
    if (!run('file', [file]).includes('Mach-O')) continue;
    try {
      run('xcrun', ['strip', file]);
    } catch {
      run('xcrun', ['strip', '-x', file]);
    }
  }
  const zip = join(OUT, `${label}.zip`);
  rmSync(zip, { force: true });
  run('zip', ['-qr9', zip, 'RemoteComposeExample.app'], {
    cwd: join(app, '..'),
  });
  rows[label] = { download: statSync(zip).size, install: directoryBytes(app) };
}

if (what !== 'ios') {
  for (const r8 of [true, false]) {
    android('without', r8);
    android('with', r8);
  }
}
if (what !== 'android' && process.platform !== 'darwin') {
  console.error('iOS builds need macOS; skipping iOS.');
} else if (what !== 'android') {
  try {
    ios('without');
    ios('with');
  } finally {
    run('bundle', ['exec', 'pod', 'install', '--project-directory=ios'], {
      cwd: join(ROOT, 'example'),
      log: join(OUT, 'ios-restore-pod.log'),
    });
  }
}
writeFileSync(RAW, JSON.stringify(rows, null, 2));

const lines = [
  '| | App without → with the library: download | install | Library adds |',
  '|---|---|---|---|',
];
for (const [base, lib, name] of [
  ['android-without-r8-on', 'android-with-r8-on', 'Android arm64, R8 on'],
  ['android-without-r8-off', 'android-with-r8-off', 'Android arm64, R8 off'],
  ['ios-without', 'ios-with', 'iOS arm64'],
] as const) {
  const b = rows[base];
  const l = rows[lib];
  if (!b || !l) continue;
  lines.push(
    `| ${name} | ${mb(b.download)} → ${mb(l.download)} | ${mb(b.install)} → ${mb(l.install)} | **+${mb(l.download - b.download)} / +${mb(l.install - b.install)}** |`
  );
}
writeFileSync(join(OUT, 'report.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));

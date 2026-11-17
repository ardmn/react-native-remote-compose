/**
 * What react-native-remote-compose adds to an app: release builds of the bare demo, once with the
 * library and once with its native part unlinked (RC_SIZE_BASELINE=1, see
 * example/react-native.config.js). The JS is the same, so the difference is the library's cost.
 *
 *   Android  The release App Bundle, sized for one arm64 phone with Google's bundletool, as Play
 *            serves it: `get-size total` is the download; the split APKs bundletool installs for
 *            that device are the on-device size (APKs only; Android adds compiled-code caches on
 *            top). Measured with R8 on and off.
 *   iOS      A Release archive for devices (Xcode's own install step strips the binaries). The
 *            .app's bytes are the install size; a zip -9 of it estimates the App Store download
 *            (a lower bound: the store encrypts the executable, and encrypted bytes do not
 *            compress).
 *
 * Usage: yarn measure:size [android|ios|all]   → build/size/report.md
 * Android runs on macOS, Linux and Windows; iOS needs macOS.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEMO,
  IS_MAC,
  ROOT,
  buildAndroidRelease,
  buildIos,
  bundletool,
  deflatedBytes,
  directoryBytes,
  mb,
  run,
  signedMb,
} from './lib.ts';

const TARGETS = ['android', 'ios', 'all'] as const;
type Target = (typeof TARGETS)[number];
const isTarget = (value: string): value is Target =>
  (TARGETS as readonly string[]).includes(value);

const what = process.argv[2] ?? 'all';
if (!isTarget(what)) {
  console.error(`usage: yarn measure:size [${TARGETS.join('|')}]`);
  process.exit(2);
}
if (what === 'ios' && !IS_MAC) {
  console.error(
    'iOS builds need macOS with Xcode; run `yarn measure:size android` here.'
  );
  process.exit(1);
}

const OUT = join(ROOT, 'build/size');
mkdirSync(OUT, { recursive: true });
const RAW = join(OUT, 'raw.json');

/** The phone the Android sizes are for: what Play would serve to it. */
const DEVICE_SPEC = {
  supportedAbis: ['arm64-v8a'],
  supportedLocales: ['en'],
  screenDensity: 420,
  sdkVersion: 35,
};

type Variant = 'with' | 'without';
type Row = { download: number; install: number };

function isRow(value: unknown): value is Row {
  return (
    typeof value === 'object' &&
    value !== null &&
    'download' in value &&
    typeof value.download === 'number' &&
    'install' in value &&
    typeof value.install === 'number'
  );
}

/** Earlier results, so `android` and `ios` can be measured in separate runs into one report. */
function previousRows(): Record<string, Row> {
  if (what === 'all' || !existsSync(RAW)) return {};
  const parsed: unknown = JSON.parse(readFileSync(RAW, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, row]) => isRow(row) && !key.startsWith(`${what}-`)
    )
  );
}
const rows = previousRows();

/** Saved after every build, so a later failure keeps what was measured. */
const save = () => writeFileSync(RAW, JSON.stringify(rows, null, 2));

const baselineEnv = (variant: Variant) => ({
  RC_SIZE_BASELINE: variant === 'without' ? '1' : '0',
});

async function android(variant: Variant, r8: boolean) {
  const label = `android-${variant}-r8-${r8 ? 'on' : 'off'}`;
  console.log(`building ${label}…`);
  const bundle = buildAndroidRelease({
    r8,
    abi: 'arm64-v8a',
    output: 'bundle',
    env: baselineEnv(variant),
    log: join(OUT, `${label}.log`),
  });
  const spec = join(OUT, 'device-spec.json');
  writeFileSync(spec, JSON.stringify(DEVICE_SPEC));
  const apks = join(OUT, `${label}.apks`);
  await bundletool(
    [
      'build-apks',
      `--bundle=${bundle}`,
      `--output=${apks}`,
      `--device-spec=${spec}`,
      '--overwrite',
    ],
    join(OUT, `${label}-apks.log`)
  );
  // CSV: "MIN,MAX" then one row of bytes for the device spec.
  const csv = await bundletool([
    'get-size',
    'total',
    `--apks=${apks}`,
    `--device-spec=${spec}`,
  ]);
  const download = Number(csv.trim().split('\n').at(-1)?.split(',')[1]);
  if (!Number.isFinite(download))
    throw new Error(`bundletool get-size printed no size:\n${csv}`);
  const installed = join(OUT, `${label}-installed`);
  await bundletool([
    'extract-apks',
    `--apks=${apks}`,
    `--device-spec=${spec}`,
    `--output-dir=${installed}`,
  ]);
  rows[label] = { download, install: directoryBytes(installed) };
  save();
}

function ios(variant: Variant) {
  const label = `ios-${variant}`;
  console.log(`building ${label}…`);
  run('bundle', ['exec', 'pod', 'install', '--project-directory=ios'], {
    cwd: DEMO.dir,
    env: baselineEnv(variant),
    log: join(OUT, `${label}-pod.log`),
  });
  const app = buildIos({
    target: 'device-archive',
    derivedData: join(OUT, `dd-${variant}`),
    log: join(OUT, `${label}.log`),
  });
  rows[label] = { download: deflatedBytes(app), install: directoryBytes(app) };
  save();
}

/** Puts the demo's Pods back to "with the library", keeping the error that got us here. */
function restorePods() {
  try {
    run('bundle', ['exec', 'pod', 'install', '--project-directory=ios'], {
      cwd: DEMO.dir,
      log: join(OUT, 'ios-restore-pod.log'),
    });
  } catch (e) {
    console.error(
      `Could not restore the demo's Pods; run "bundle exec pod install" in example/ios. (${e instanceof Error ? e.message : String(e)})`
    );
  }
}

if (what !== 'ios') {
  for (const r8 of [true, false]) {
    await android('without', r8);
    await android('with', r8);
  }
}
if (what === 'all' && !IS_MAC) {
  console.warn(
    'iOS builds need macOS with Xcode; this report has Android only.'
  );
} else if (what !== 'android') {
  try {
    ios('without');
    ios('with');
  } finally {
    restorePods();
  }
}
save();

const lines = [
  '| | App without → with the library: download | on device | Library adds |',
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
    `| ${name} | ${mb(b.download)} → ${mb(l.download)} | ${mb(b.install)} → ${mb(l.install)} | **${signedMb(l.download - b.download)} / ${signedMb(l.install - b.install)}** |`
  );
}
writeFileSync(join(OUT, 'report.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));

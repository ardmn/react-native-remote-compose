/**
 * Performance of the bare demo's release build. The script serves a small HTTP endpoint; the app's
 * Performance screen (rcdemo://perf?autorun=1&report=<endpoint>) announces each phase there and
 * posts its result: native load/decode time per document, and the JS thread's frame rate and
 * longest stall with no document, while 12 mount, and while they animate. On Android the script
 * adds the system's UI-thread frame statistics (dumpsys gfxinfo) for the idle and animating
 * phases, reset exactly when each phase starts.
 *
 * Run 1 is a first launch (app data cleared); the others are repeat launches of a stopped app.
 * Medians and ranges are over the repeat launches; the first launch is reported on its own.
 *
 * Usage: yarn measure:perf android|ios [runs]   (runs ≥ 2, default 6) → build/perf/<platform>.json and .md
 *   android: release APK (R8 on) on the connected device or emulator. macOS, Linux and Windows.
 *   ios:     Release build on the booted simulator. macOS.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { availableParallelism, loadavg } from 'node:os';
import { join } from 'node:path';
import {
  PERF_PHASES,
  type PerfPhase,
  type PerfReport,
} from '../example-shared/src/perfReport.ts';
import {
  DEMO,
  IS_MAC,
  IS_WINDOWS,
  ROOT,
  adb,
  buildAndroidRelease,
  buildIos,
  connectedAndroidAbi,
  run,
} from './lib.ts';
import { type Frames, parseGfxinfo, parseReport } from './perf-parse.ts';
import { median } from './stats.ts';

const USAGE = 'usage: yarn measure:perf android|ios [runs ≥ 2, default 6]';
const platform = process.argv[2];
const runs = Number(process.argv[3] ?? 6);
if (platform !== 'android' && platform !== 'ios') {
  console.error(USAGE);
  process.exit(2);
}
if (!Number.isInteger(runs) || runs < 2) {
  console.error(
    `runs must be a whole number of at least 2 (a first launch and a repeat). ${USAGE}`
  );
  process.exit(2);
}
if (platform === 'ios' && !IS_MAC) {
  console.error('iOS needs macOS with Xcode and a booted simulator.');
  process.exit(1);
}

/** How long a run may take before the app is assumed not to be reporting. */
const RESULT_TIMEOUT_MS = 120_000;

// A busy machine slows an emulator or simulator as much as any library could: record the load
// with the results, and say so up front when it is high. Windows has no load average.
const cores = availableParallelism();
const hostLoad = (): string => (IS_WINDOWS ? 'n/a' : loadavg()[0]!.toFixed(1));
const loadAtStart = hostLoad();
if (!IS_WINDOWS && loadavg()[0]! > cores / 2) {
  console.warn(
    `warning: 1-min load ${loadAtStart} on ${cores} cores — results will be noisy; stop other work first.`
  );
}

const OUT = join(ROOT, 'build/perf');
mkdirSync(OUT, { recursive: true });

type Run = {
  firstLaunch: boolean;
  js: PerfReport;
  uiIdle?: Frames;
  uiAnimating?: Frames;
};

const isPhase = (value: unknown): value is PerfPhase =>
  typeof value === 'string' &&
  (PERF_PHASES as readonly string[]).includes(value);

/** Called for each phase marker before it is acknowledged; set per run. */
let onPhase: (phase: PerfPhase) => void = () => {};
/** Resolves with the current run's result; replaced per run. */
let deliverResult: (body: unknown) => void = () => {};

const server = createServer((request, response) => {
  let data = '';
  request.on('data', (chunk) => (data += chunk));
  request.on('end', () => {
    let body: unknown;
    try {
      body = JSON.parse(data);
    } catch {
      response.statusCode = 400;
      response.end('expected JSON');
      return;
    }
    const phase =
      typeof body === 'object' && body !== null && 'phase' in body
        ? body.phase
        : undefined;
    // Reset frame statistics before acknowledging, so they cover exactly the phase that follows.
    if (isPhase(phase)) onPhase(phase);
    else if (typeof body === 'object' && body !== null && 'result' in body)
      deliverResult(body.result);
    response.end('ok');
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (typeof address !== 'object' || address === null)
  throw new Error('The report server has no TCP port.');
const port = address.port;
const link = `rcdemo://perf?autorun=1&report=${encodeURIComponent(`http://127.0.0.1:${port}/`)}`;

function nextResult(): Promise<PerfReport> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `No result from the app within ${RESULT_TIMEOUT_MS / 1000} s. Check that it launched on the Performance tab, ` +
              `and look for RC_PERF_POST_FAILED in its log (Android: adb logcat; iOS: the simulator's console). ` +
              (platform === 'android'
                ? `adb reverse tcp:${port} must be in place.`
                : '')
          )
        ),
      RESULT_TIMEOUT_MS
    );
    deliverResult = (body) => {
      clearTimeout(timer);
      try {
        resolve(parseReport(body));
      } catch (e) {
        reject(e);
      }
    };
  });
}

let gfxSnapshots = 0;
/** Reads (and optionally resets) the frame statistics; the raw output is kept next to the report. */
function gfxinfo(reset = false): Frames {
  const text = adb(
    'shell',
    'dumpsys',
    'gfxinfo',
    DEMO.androidApplicationId,
    ...(reset ? ['reset'] : [])
  );
  writeFileSync(join(OUT, `gfxinfo-${++gfxSnapshots}.txt`), text);
  return parseGfxinfo(text);
}

async function measureAndroid(): Promise<{ device: string; results: Run[] }> {
  // Before the long build: a device must be there, and the build must match its ABI.
  const abi = connectedAndroidAbi();
  const apk = buildAndroidRelease({
    r8: true,
    abi,
    output: 'apk',
    log: join(OUT, 'android-build.log'),
  });
  adb('install', '-r', apk);
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  const id = DEMO.androidApplicationId;
  const results: Run[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const stats: { idle?: Frames; animating?: Frames } = {};
      // A phase's statistics are read (and reset) when the next phase starts.
      onPhase = (phase) => {
        const previous = gfxinfo(true);
        if (phase === 'mount') stats.idle = previous;
        if (phase === 'updates') stats.animating = previous;
      };
      adb('shell', 'am', 'force-stop', id);
      if (i === 0) adb('shell', 'pm', 'clear', id);
      const result = nextResult();
      // adb shell hands its arguments to the device's shell: quote the link, which contains '&'.
      adb('shell', `am start -a android.intent.action.VIEW -d '${link}' ${id}`);
      results.push({
        firstLaunch: i === 0,
        js: await result,
        uiIdle: stats.idle,
        uiAnimating: stats.animating,
      });
      console.log(`run ${i + 1}/${runs} done`);
    }
  } finally {
    adb('shell', 'am', 'force-stop', id);
    adb('reverse', '--remove', `tcp:${port}`);
  }
  const model = adb('shell', 'getprop', 'ro.product.model').trim();
  const emulator = adb('shell', 'getprop', 'ro.kernel.qemu').trim() === '1';
  return {
    device: `${model}${emulator ? ' (emulator)' : ''}, ${abi}`,
    results,
  };
}

async function measureIos(): Promise<{ device: string; results: Run[] }> {
  const booted = run('xcrun', ['simctl', 'list', 'devices', 'booted']).match(
    /^\s+(.+?) \(/m
  )?.[1];
  if (!booted)
    throw new Error(
      'No simulator is booted: open one (Xcode → Open Developer Tool → Simulator / DeviceHub).'
    );
  const app = buildIos({
    target: 'simulator',
    derivedData: join(OUT, 'dd-ios'),
    log: join(OUT, 'ios-build.log'),
  });
  const id = DEMO.iosBundleId;
  const terminate = () => {
    try {
      run('xcrun', ['simctl', 'terminate', 'booted', id]);
    } catch {
      // Not running: nothing to stop.
    }
  };
  const results: Run[] = [];
  onPhase = () => {};
  try {
    for (let i = 0; i < runs; i++) {
      terminate();
      if (i === 0) {
        // A first launch, as on Android after `pm clear`: no data left from earlier runs.
        try {
          run('xcrun', ['simctl', 'uninstall', 'booted', id]);
        } catch {
          // Not installed yet.
        }
        run('xcrun', ['simctl', 'install', 'booted', app]);
      }
      const result = nextResult();
      // A launch argument, not `simctl openurl`: iOS asks "Open in …?" for a URL from outside.
      run('xcrun', ['simctl', 'launch', 'booted', id, '-rcdemoLink', link]);
      results.push({ firstLaunch: i === 0, js: await result });
      console.log(`run ${i + 1}/${runs} done`);
    }
  } finally {
    terminate();
  }
  return { device: `${booted} (simulator)`, results };
}

const round = (value: number) => Math.round(value * 10) / 10;

try {
  const { device, results } =
    platform === 'android' ? await measureAndroid() : await measureIos();
  writeFileSync(
    join(OUT, `${platform}.json`),
    JSON.stringify({ device, results }, null, 2)
  );

  const [first, ...repeats] = results;
  if (!first?.firstLaunch) throw new Error('Run 1 must be the first launch.');
  const row = (
    name: string,
    get: (r: Run) => number | undefined,
    unit: string
  ) => {
    const values = repeats.map(get).filter((v): v is number => v !== undefined);
    if (values.length === 0) return undefined;
    const firstValue = get(first);
    return `| ${name} | ${round(median(values))}${unit} | ${round(Math.min(...values))}–${round(Math.max(...values))}${unit} | ${firstValue === undefined ? '—' : `${round(firstValue)}${unit}`} |`;
  };
  const lines = [
    `${platform} · ${device} · ${repeats.length} repeat launches + 1 first launch · host load ${loadAtStart} → ${hostLoad()} on ${cores} cores`,
    '',
    '| Metric | Median (repeat launches) | Range | First launch |',
    '|---|---|---|---|',
    row(
      '12 documents mounted → all loaded',
      (r) => r.js.mountToAllLoadedMs,
      ' ms'
    ),
    row(
      'Load per document (native, off main thread)',
      (r) => r.js.loadMs.avg,
      ' ms'
    ),
    row('Decode per document (native)', (r) => r.js.decodeMs.avg, ' ms'),
    row('JS frame callbacks/s — no document', (r) => r.js.jsFpsIdle, ''),
    row(
      'JS frame callbacks/s — 12 animating',
      (r) => r.js.jsFpsWhileAnimating,
      ''
    ),
    row('Longest JS stall — no document', (r) => r.js.jsMaxStallMsIdle, ' ms'),
    row(
      'Longest JS stall — 12 mounting',
      (r) => r.js.jsMaxStallMsDuringMount,
      ' ms'
    ),
    row(
      'Longest JS stall — 12 animating',
      (r) => r.js.jsMaxStallMsWhileAnimating,
      ' ms'
    ),
    row(
      'Named-value updates/s to 12 documents',
      (r) => r.js.namedValueUpdatesPerSec,
      ''
    ),
    row('UI janky frames — no document', (r) => r.uiIdle?.jankyPercent, ' %'),
    row(
      'UI janky frames — 12 animating',
      (r) => r.uiAnimating?.jankyPercent,
      ' %'
    ),
    row('UI frame time p99 — 12 animating', (r) => r.uiAnimating?.p99, ' ms'),
  ].filter((line) => line !== undefined);
  writeFileSync(join(OUT, `${platform}.md`), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
} finally {
  server.close();
}

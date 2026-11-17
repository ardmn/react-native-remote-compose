/**
 * Performance of the bare demo's release build. The script serves a small HTTP endpoint; the app's
 * Performance screen (rcdemo://perf?autorun=1&report=<endpoint>) posts each phase and its result
 * there: native load/decode time per document, and the JS thread's frame rate and longest stall
 * with no document and while 12 animate. On Android the script adds the system's UI-thread frame
 * statistics (dumpsys gfxinfo) for the same two phases, reset exactly when each phase starts.
 *
 * Usage: yarn measure:perf android|ios [runs=6]   → build/perf/<platform>.json and .md
 *   android: release APK (R8 on) on the connected device/emulator; run 1 starts from cleared data.
 *            Works on macOS, Linux and Windows.
 *   ios:     Release build on the booted simulator (macOS).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { median } from './stats.ts';
import { ROOT, adb, gradlew, run } from './lib.ts';

const platform = process.argv[2];
const runs = Number(process.argv[3] ?? 6);
if (platform !== 'android' && platform !== 'ios') {
  console.error('usage: yarn measure:perf android|ios [runs]');
  process.exit(2);
}
// A busy machine slows an emulator or simulator as much as any library could: record the load
// with the results, and say so up front when it is high.
const cores = availableParallelism();
const loadAtStart = loadavg()[0]!;
if (loadAtStart > cores / 2) {
  console.warn(
    `warning: 1-min load ${loadAtStart.toFixed(1)} on ${cores} cores — results will be noisy; stop other work first.`
  );
}
const OUT = join(ROOT, 'build/perf');
mkdirSync(OUT, { recursive: true });
const PACKAGE = 'remotecompose.example';

type Frames = {
  frames: number;
  jankyPercent: number;
  p50: number;
  p90: number;
  p99: number;
};
type Result = Record<string, number | string | { avg: number; max: number }>;
type Run = {
  kind: 'cold' | 'warm';
  js: Result;
  uiIdle?: Frames;
  uiAnimating?: Frames;
};

/** One benchmark run's messages, delivered by the app through the HTTP endpoint. */
class Inbox {
  private waiters = new Map<string, (body: Record<string, unknown>) => void>();
  private received = new Map<string, Record<string, unknown>>();

  deliver(body: Record<string, unknown>) {
    const key =
      typeof body.phase === 'string' ? `phase:${body.phase}` : 'result';
    const waiter = this.waiters.get(key);
    if (waiter) {
      this.waiters.delete(key);
      waiter(body);
    } else this.received.set(key, body);
  }

  next(key: string, timeoutMs = 120_000): Promise<Record<string, unknown>> {
    const ready = this.received.get(key);
    if (ready) {
      this.received.delete(key);
      return Promise.resolve(ready);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${key}`)),
        timeoutMs
      );
      this.waiters.set(key, (body) => {
        clearTimeout(timer);
        resolve(body);
      });
    });
  }
}

let inbox = new Inbox();
let onPhase: (name: string) => void = () => {};
const server = createServer((request, response) => {
  let data = '';
  request.on('data', (chunk) => (data += chunk));
  request.on('end', () => {
    const body = JSON.parse(data || '{}') as Record<string, unknown>;
    // Reset frame statistics before acknowledging, so they cover exactly the phase that follows.
    if (typeof body.phase === 'string') onPhase(body.phase);
    inbox.deliver(body);
    response.end('ok');
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;
const link = `rcdemo://perf?autorun=1&report=${encodeURIComponent(`http://127.0.0.1:${port}/`)}`;

function gfxinfo(reset = false): Frames {
  const text = adb(
    'shell',
    'dumpsys',
    'gfxinfo',
    PACKAGE,
    ...(reset ? ['reset'] : [])
  );
  const number = (re: RegExp) => Number(text.match(re)?.[1] ?? NaN);
  return {
    frames: number(/Total frames rendered: (\d+)/),
    jankyPercent: number(/Janky frames: \d+ \(([\d.]+)%\)/),
    p50: number(/50th percentile: (\d+)ms/),
    p90: number(/90th percentile: (\d+)ms/),
    p99: number(/99th percentile: (\d+)ms/),
  };
}

async function measureAndroid(): Promise<Run[]> {
  const project = join(ROOT, 'example/android');
  // clean: the JS bundle task watches example/ only, not example-shared/.
  run(
    gradlew(project),
    [
      '--console=plain',
      '-q',
      'clean',
      ':app:assembleRelease',
      '-PreactNativeArchitectures=arm64-v8a',
      '-PenableProguardInReleaseBuilds=true',
    ],
    {
      cwd: project,
      log: join(OUT, 'android-build.log'),
    }
  );
  adb(
    'install',
    '-r',
    join(project, 'app/build/outputs/apk/release/app-release.apk')
  );
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  const results: Run[] = [];
  for (let i = 0; i < runs; i++) {
    inbox = new Inbox();
    const stats: Record<string, Frames> = {};
    // A phase's statistics are read when the next phase starts.
    onPhase = (name) => {
      if (name === 'animating') stats.idle = gfxinfo(true);
      else if (name === 'updates') stats.animating = gfxinfo(true);
      else gfxinfo(true);
    };
    adb('shell', 'am', 'force-stop', PACKAGE);
    if (i === 0) adb('shell', 'pm', 'clear', PACKAGE);
    // adb shell hands its arguments to the device's shell: quote the link, which contains '&'.
    adb(
      'shell',
      `am start -a android.intent.action.VIEW -d '${link}' ${PACKAGE}`
    );
    const result = (await inbox.next('result')).result as Result;
    results.push({
      kind: i === 0 ? 'cold' : 'warm',
      js: result,
      uiIdle: stats.idle,
      uiAnimating: stats.animating,
    });
    console.log(`run ${i + 1}/${runs} done`);
  }
  return results;
}

async function measureIos(): Promise<Run[]> {
  const derived = join(OUT, 'dd-ios');
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
      'iphonesimulator',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      derived,
      'build',
    ],
    {
      cwd: join(ROOT, 'example'),
      log: join(OUT, 'ios-build.log'),
    }
  );
  run('xcrun', [
    'simctl',
    'install',
    'booted',
    join(
      derived,
      'Build/Products/Release-iphonesimulator/RemoteComposeExample.app'
    ),
  ]);
  const results: Run[] = [];
  for (let i = 0; i < runs; i++) {
    inbox = new Inbox();
    onPhase = () => {};
    try {
      run('xcrun', ['simctl', 'terminate', 'booted', PACKAGE]);
    } catch {
      // not running
    }
    // A launch argument, not `simctl openurl`: iOS asks "Open in …?" for a URL from outside.
    run('xcrun', ['simctl', 'launch', 'booted', PACKAGE, '-rcdemoLink', link]);
    const result = (await inbox.next('result')).result as Result;
    results.push({ kind: i === 0 ? 'cold' : 'warm', js: result });
    console.log(`run ${i + 1}/${runs} done`);
  }
  return results;
}

try {
  const results =
    platform === 'android' ? await measureAndroid() : await measureIos();
  const device =
    platform === 'android'
      ? adb('shell', 'getprop', 'ro.product.model').trim()
      : (run('xcrun', ['simctl', 'list', 'devices', 'booted']).match(
          /^\s+(.+?) \(/m
        )?.[1] ?? 'simulator');
  writeFileSync(
    join(OUT, `${platform}.json`),
    JSON.stringify({ device, results }, null, 2)
  );

  const pick = (get: (r: Run) => number | undefined) =>
    results
      .map(get)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  const row = (name: string, values: number[], unit = '') =>
    values.length
      ? `| ${name} | ${median(values)}${unit} | ${Math.min(...values)}–${Math.max(...values)}${unit} |`
      : '';
  const js = (key: string) => pick((r) => r.js[key] as number);
  const avg = (key: string) => pick((r) => (r.js[key] as { avg: number }).avg);
  const lines = [
    `${platform} · ${device} · ${results.length} runs (run 1 cold) · host load ${loadAtStart.toFixed(1)} → ${loadavg()[0]!.toFixed(1)} on ${cores} cores`,
    '',
    '| Metric | Median | Range |',
    '|---|---|---|',
    row('12 documents mounted → all loaded', js('mountToAllLoadedMs'), ' ms'),
    row('Load per document (native, off main thread)', avg('loadMs'), ' ms'),
    row('Decode per document (native)', avg('decodeMs'), ' ms'),
    row('JS frame callbacks/s — no document', js('jsFpsIdle')),
    row('JS frame callbacks/s — 12 animating', js('jsFpsWhileAnimating')),
    row('Longest JS stall — no document', js('jsMaxStallMsIdle'), ' ms'),
    row(
      'Longest JS stall — 12 animating',
      js('jsMaxStallMsWhileAnimating'),
      ' ms'
    ),
    row(
      'UI janky frames — 12 animating',
      pick((r) => r.uiAnimating?.jankyPercent),
      ' %'
    ),
    row(
      'UI frame time p99 — 12 animating',
      pick((r) => r.uiAnimating?.p99),
      ' ms'
    ),
  ].filter(Boolean);
  writeFileSync(join(OUT, `${platform}.md`), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
} finally {
  server.close();
}

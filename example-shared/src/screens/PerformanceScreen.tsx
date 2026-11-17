import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  RemoteComposeView,
  type RemoteComposeLoadEvent,
} from 'react-native-remote-compose';
import { pulseRc } from '../documents';
import { Button, Mono, Row, Section, styles } from '../ui';

// Hermes provides the High Resolution Time API; React Native's types do not declare it.
declare const performance: { now(): number };

const PLAYERS = 12;
const ANIMATE_MS = 3000;

type Report = {
  platform: string;
  players: number;
  mountToAllLoadedMs: number;
  loadMs: { avg: number; max: number };
  decodeMs: { avg: number; max: number };
  jsMaxStallMsDuringMount: number;
  jsFpsWhileAnimating: number;
  jsMaxStallMsWhileAnimating: number;
  namedValueUpdatesPerSec: number;
};

const stats = (values: number[]) => ({
  avg: Number(
    (values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(2)
  ),
  max: Number(Math.max(0, ...values).toFixed(2)),
});

/** Watches the JS thread: the longest gap between 8 ms ticks is the longest block. */
function startStallMonitor() {
  let last = performance.now();
  let maxGap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last - 8);
    last = now;
  }, 8);
  return () => {
    clearInterval(timer);
    return Math.max(0, Number(maxGap.toFixed(1)));
  };
}

function measureFps(durationMs: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < durationMs) requestAnimationFrame(tick);
      else
        resolve(
          Number(((frames * 1000) / (performance.now() - start)).toFixed(1))
        );
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Proves where the work happens. Mounts several players at once and records the native,
 * off-JS-thread load/decode times each one reports, how long the JS thread was blocked, JS frame
 * rate while every document animates, and how fast host values can be pushed.
 * Results are printed as one `RC_PERF {…}` log line for collection from logcat / simctl.
 */
export function PerformanceScreen({ autorun = false }: { autorun?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const loads = useRef<RemoteComposeLoadEvent[]>([]);
  const allLoaded = useRef<() => void>(() => {});

  const onLoad = useCallback((event: RemoteComposeLoadEvent) => {
    loads.current.push(event);
    if (loads.current.length === PLAYERS) allLoaded.current();
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setReport(null);
    setMounted(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 300));
    loads.current = [];

    // 1. Mount PLAYERS documents at once.
    const stopMountMonitor = startStallMonitor();
    const mountStart = performance.now();
    const loadedPromise = new Promise<void>((resolve) => {
      allLoaded.current = resolve;
    });
    setMounted(true);
    await loadedPromise;
    const mountToAllLoadedMs = Number(
      (performance.now() - mountStart).toFixed(1)
    );
    const jsMaxStallMsDuringMount = stopMountMonitor();

    // 2. Every document animates; measure the JS thread meanwhile.
    const stopAnimMonitor = startStallMonitor();
    const jsFpsWhileAnimating = await measureFps(ANIMATE_MS);
    const jsMaxStallMsWhileAnimating = stopAnimMonitor();

    // 3. Push a named value to every player as fast as React commits.
    let updates = 0;
    const updateStart = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        updates += 1;
        setSpeed(1 + (updates % 8));
        if (performance.now() - updateStart < 2000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const namedValueUpdatesPerSec = Number(
      ((updates * 1000) / (performance.now() - updateStart)).toFixed(1)
    );

    const result: Report = {
      platform: `${Platform.OS} ${Platform.Version}`,
      players: PLAYERS,
      mountToAllLoadedMs,
      loadMs: stats(loads.current.map((l) => l.loadMs)),
      decodeMs: stats(loads.current.map((l) => l.decodeMs)),
      jsMaxStallMsDuringMount,
      jsFpsWhileAnimating,
      jsMaxStallMsWhileAnimating,
      namedValueUpdatesPerSec,
    };
    console.log(`RC_PERF ${JSON.stringify(result)}`);
    setReport(result);
    setRunning(false);
  }, []);

  useEffect(() => {
    if (autorun) run();
  }, [autorun, run]);

  return (
    <>
      <Section title={`Benchmark: ${PLAYERS} animated players`}>
        <Row>
          <Button
            testID="run-benchmark"
            label={running ? 'running…' : 'Run'}
            onPress={run}
          />
          <Button label="unmount" onPress={() => setMounted(false)} />
        </Row>
        {report ? <Mono>{JSON.stringify(report, null, 2)}</Mono> : null}
      </Section>
      {mounted ? (
        <View style={styles.grid}>
          {Array.from({ length: PLAYERS }, (_, i) => (
            <RemoteComposeView
              key={i}
              style={styles.gridCell}
              source={pulseRc}
              namedValues={{ speed, label: `#${i + 1}` }}
              onLoad={onLoad}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

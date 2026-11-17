/** The perf script reads exactly what the app and Android print, and fails loudly on anything else. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PerfReport } from '../../example-shared/src/perfReport.ts';
import { parseGfxinfo, parseReport } from '../perf-parse.ts';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

const report: PerfReport = {
  platform: 'android',
  players: 12,
  jsFpsIdle: 60,
  jsMaxStallMsIdle: 3,
  mountToAllLoadedMs: 67,
  loadMs: { avg: 1.2, max: 3 },
  decodeMs: { avg: 0.8, max: 2 },
  jsMaxStallMsDuringMount: 25,
  jsFpsWhileAnimating: 59,
  jsMaxStallMsWhileAnimating: 21,
  namedValueUpdatesPerSec: 58,
};

test('a complete report is read as sent', () => {
  assert.deepEqual(parseReport(JSON.parse(JSON.stringify(report))), report);
});

test('a report missing a number names it instead of dropping the metric', () => {
  const partial: Partial<PerfReport> = { ...report };
  delete partial.jsFpsIdle;
  assert.throws(() => parseReport(partial), /jsFpsIdle/);
});

test('a report with a mistyped statistic names it', () => {
  assert.throws(() => parseReport({ ...report, loadMs: 1.2 }), /loadMs/);
});

test('frame statistics are read from dumpsys gfxinfo', () => {
  // Captured during `yarn measure:perf android`: 12 documents animating, Android 17 emulator.
  assert.deepEqual(parseGfxinfo(fixture('gfxinfo-animating.txt')), {
    frames: 185,
    jankyPercent: 1.08,
    p99: 38,
  });
});

test('a phase with no frame is refused: Android prints a meaningless percentile then', () => {
  // Captured from an emulator (Android 17): 0 frames, yet "99th percentile: 4950ms".
  assert.throws(
    () => parseGfxinfo(fixture('gfxinfo-no-frames.txt')),
    /no frames/
  );
});

test('a changed dumpsys format fails naming the missing line', () => {
  assert.throws(
    () => parseGfxinfo('Total frames rendered: 10\nJanky: 1'),
    /Janky frames/
  );
});

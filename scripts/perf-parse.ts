/**
 * Parsing for `yarn measure:perf`: the app's posted report and Android's `dumpsys gfxinfo`. Pure
 * functions, so a format change fails loudly here (and in tests) instead of dropping a metric.
 */
import type { PerfReport } from '../example-shared/src/perfReport.ts';

const isStats = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'avg' in value &&
  typeof value.avg === 'number' &&
  'max' in value &&
  typeof value.max === 'number';

/** What is missing or mistyped in the app's report; empty when it is a complete PerfReport. */
function reportProblems(value: unknown): string[] {
  const numbers: (keyof PerfReport)[] = [
    'players',
    'jsFpsIdle',
    'jsMaxStallMsIdle',
    'mountToAllLoadedMs',
    'jsMaxStallMsDuringMount',
    'jsFpsWhileAnimating',
    'jsMaxStallMsWhileAnimating',
    'namedValueUpdatesPerSec',
  ];
  if (typeof value !== 'object' || value === null) return ['the whole result'];
  const record: Record<string, unknown> = { ...value };
  return [
    ...numbers.filter((key) => typeof record[key] !== 'number'),
    ...(['loadMs', 'decodeMs'] as const).filter((key) => !isStats(record[key])),
    ...(typeof record.platform === 'string' ? [] : ['platform']),
  ];
}

export const isPerfReport = (value: unknown): value is PerfReport =>
  reportProblems(value).length === 0;

/** The app's report, checked field by field: a missing number fails here, not as an empty row. */
export function parseReport(value: unknown): PerfReport {
  if (isPerfReport(value)) return value;
  throw new Error(
    `The app's result is missing or mistyped: ${reportProblems(value).join(', ')}. Rebuild the demo so the app and this script agree (example-shared/src/perfReport.ts).`
  );
}

/** UI-thread frame statistics for one phase, from `dumpsys gfxinfo`. */
export type Frames = { frames: number; jankyPercent: number; p99: number };

/** One labelled number from `dumpsys gfxinfo`; throws if the output format changed. */
function gfxNumber(text: string, label: string, re: RegExp): number {
  const match = text.match(re)?.[1];
  if (match === undefined) {
    throw new Error(
      `dumpsys gfxinfo printed no "${label}": its format changed; update parseGfxinfo() in scripts/perf-parse.ts.`
    );
  }
  return Number(match);
}

/**
 * The frame statistics `dumpsys gfxinfo <package>` prints. With no frame rendered, Android still
 * prints percentiles (its largest histogram bucket, e.g. 4950 ms): that phase has no data, so it
 * fails rather than reporting them.
 */
export function parseGfxinfo(text: string): Frames {
  const frames = gfxNumber(
    text,
    'Total frames rendered',
    /Total frames rendered: (\d+)/
  );
  if (frames === 0) {
    throw new Error(
      'dumpsys gfxinfo counted no frames in this phase: the app drew nothing (was it in front, and the screen on?).'
    );
  }
  return {
    frames,
    jankyPercent: gfxNumber(
      text,
      'Janky frames',
      /Janky frames: \d+ \(([\d.]+)%\)/
    ),
    p99: gfxNumber(text, '99th percentile', /99th percentile: (\d+)ms/),
  };
}

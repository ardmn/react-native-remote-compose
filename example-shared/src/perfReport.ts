/**
 * What the Performance screen measures and posts to `yarn measure:perf`. One type for both sides,
 * so the script reads exactly what the app sends.
 */
type PerfStats = { avg: number; max: number };

export type PerfReport = {
  platform: string;
  players: number;
  jsFpsIdle: number;
  jsMaxStallMsIdle: number;
  mountToAllLoadedMs: number;
  loadMs: PerfStats;
  decodeMs: PerfStats;
  jsMaxStallMsDuringMount: number;
  jsFpsWhileAnimating: number;
  jsMaxStallMsWhileAnimating: number;
  namedValueUpdatesPerSec: number;
};

/** The phases the screen announces, in order; each waits for the script's acknowledgement. */
export const PERF_PHASES = ['idle', 'mount', 'animating', 'updates'] as const;
export type PerfPhase = (typeof PERF_PHASES)[number];

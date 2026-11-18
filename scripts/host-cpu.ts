/**
 * How busy the host's CPUs are, from the cores' time counters (what `top` and Task Manager show).
 * The 1-minute load average is not used: on macOS it counts threads waiting on I/O too, so an
 * emulator's many threads or Spotlight's indexer keep it high while the CPUs are mostly idle, and
 * Windows has no load average at all.
 */
import { cpus } from 'node:os';

type Times = {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
};

/** The share of CPU time spent busy between two `os.cpus()` snapshots, in percent. */
export function busyPercent(
  before: readonly { times: Times }[],
  after: readonly { times: Times }[]
): number {
  let busy = 0;
  let total = 0;
  after.forEach((cpu, index) => {
    const start = before[index]?.times;
    if (!start) return;
    const delta = (key: keyof Times) => cpu.times[key] - start[key];
    const idle = delta('idle');
    const all =
      delta('user') + delta('nice') + delta('sys') + delta('irq') + idle;
    busy += all - idle;
    total += all;
  });
  return total > 0 ? (100 * busy) / total : 0;
}

/** CPU busy share over the next `ms` milliseconds. */
export async function sampleBusyPercent(ms: number): Promise<number> {
  const before = cpus();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return busyPercent(before, cpus());
}

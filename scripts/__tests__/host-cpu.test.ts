import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busyPercent, sampleBusyPercent } from '../host-cpu.ts';

const cpu = (user: number, sys: number, idle: number) => ({
  times: { user, nice: 0, sys, idle, irq: 0 },
});

test('busy share is busy time over all time, across every core', () => {
  // Core 1: 30 busy of 100; core 2: 70 busy of 100 → 100 of 200.
  const before = [cpu(0, 0, 0), cpu(0, 0, 0)];
  const after = [cpu(20, 10, 70), cpu(50, 20, 30)];
  assert.equal(busyPercent(before, after), 50);
});

test('an idle machine is 0 % busy, not a division by zero', () => {
  assert.equal(busyPercent([cpu(5, 5, 5)], [cpu(5, 5, 5)]), 0);
});

test('a real sample of this machine is a percentage', async () => {
  const busy = await sampleBusyPercent(200);
  assert.ok(busy >= 0 && busy <= 100, String(busy));
});

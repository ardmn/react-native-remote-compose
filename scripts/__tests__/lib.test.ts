import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflatedBytes, directoryBytes, run, signedMb } from '../lib.ts';

test('a size delta keeps its sign', () => {
  assert.equal(signedMb(1_520_000), '+1.52 MB');
  assert.equal(signedMb(-10_000), '-0.01 MB');
});

test('a command that does not exist fails saying so, not "exited with null"', () => {
  assert.throws(() => run('rc-no-such-command', []), /was not found/);
});

test('a failing command fails with its exit code and output', () => {
  assert.throws(
    () =>
      run(process.execPath, ['-e', 'console.error("boom"); process.exit(3)']),
    /exited with 3 — boom/
  );
});

test('a command writing to a log returns nothing and leaves its output in the log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-lib-'));
  const log = join(dir, 'out.log');
  assert.equal(
    run(process.execPath, ['-e', 'console.log("hello")'], { log }),
    ''
  );
  assert.match(readFileSync(log, 'utf8'), /hello/);
});

test('compressible files deflate to less than their size; the estimate counts every file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-zip-'));
  writeFileSync(join(dir, 'a.txt'), 'a'.repeat(100_000));
  writeFileSync(join(dir, 'b.bin'), Buffer.from([1, 2, 3]));
  assert.equal(directoryBytes(dir), 100_003);
  assert.ok(deflatedBytes(dir) < 2_000);
  assert.ok(deflatedBytes(dir) > 3);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { median } from '../stats.ts';

test('the median of an odd count is the middle value', () => {
  assert.equal(median([9, 1, 5]), 5);
});

test('the median of an even count is the mean of the middle two, unrounded', () => {
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(median([0.12, 0.13]), 0.125);
});

test('an empty list has no median', () => {
  assert.throws(() => median([]), /empty/);
});

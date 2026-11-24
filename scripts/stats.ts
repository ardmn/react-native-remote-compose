/** Median of a non-empty list. Formatting (rounding) is the caller's. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const at = (i: number) => {
    const value = sorted[i];
    if (value === undefined) throw new Error(`median: no value at ${i}`);
    return value;
  };
  return sorted.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
}

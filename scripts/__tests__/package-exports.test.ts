/**
 * The package as an app resolves it: through its `exports` map, from an app that depends on it
 * (the Expo demo links it like an installed package). Tools that honour `exports` — EAS CLI,
 * Node — must find every entry point an app or a tool loads by name.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../lib.ts';

const fromApp = createRequire(join(ROOT, 'example-expo/package.json'));

test('the Expo config plugin resolves by name and exports a plugin function', () => {
  const plugin: unknown = fromApp('react-native-remote-compose/app.plugin.js');
  assert.equal(typeof plugin, 'function');
});

test('package.json resolves by name (React Native autolinking reads it)', () => {
  assert.doesNotThrow(() =>
    fromApp.resolve('react-native-remote-compose/package.json')
  );
});

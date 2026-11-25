import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { iosAffected } from '../ios-affected.ts';
import { ROOT } from '../lib.ts';

await test('only documentation, Android and tooling changes skip the iOS build', () => {
  assert.equal(
    iosAffected([
      'README.md',
      'docs/preview.jpg',
      'android/src/main/java/com/remotecompose/RemoteComposeViewManager.kt',
      'example/android/app/build.gradle',
      'tools/remote-compose-json/build.gradle.kts',
      'e2e/ios/flow.yaml',
      '.github/dependabot.yml',
    ]),
    false
  );
});

await test('any file the iOS build may read runs it', () => {
  for (const path of [
    'ios/HostValue.swift',
    'ios/RemoteComposeView.mm',
    'RemoteCompose.podspec',
    'src/index.tsx',
    'package.json',
    'yarn.lock',
    'example/ios/Podfile.lock',
    'example/src/App.tsx',
    'example-shared/src/screens/Host.tsx',
    'example/assets/product_card.rc',
    '.github/workflows/ci.yml', // a CI change must run the job it changes
    'app.plugin.js',
    'turbo.json',
  ]) {
    assert.equal(iosAffected(['README.md', path]), true, path);
  }
});

await test('an empty change runs the build rather than skipping it', () => {
  assert.equal(iosAffected([]), true);
});

await test('the CLI runs the build for an unknown range and writes the step output', () => {
  const script = join(ROOT, 'scripts', 'ios-affected.ts');
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  assert.match(
    run('0000000000000000000000000000000000000000', 'HEAD'),
    /^ios=true \(range/
  );
  assert.match(run('', ''), /^ios=true \(range/);
  assert.match(run('HEAD', 'HEAD'), /^ios=true \(0 files\)/);
});

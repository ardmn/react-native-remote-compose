import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { changedFiles, iosAffected } from '../ios-affected.ts';
import { ROOT } from '../lib.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A throwaway repository: one commit per `{path: text}` map; returns each commit's SHA. */
function scratchRepo(...commits: Record<string, string | null>[]): {
  dir: string;
  shas: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'ios-affected-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  const shas: string[] = [];
  for (const files of commits) {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        git(dir, 'rm', '-q', path);
      } else {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
        git(dir, 'add', path);
      }
    }
    git(dir, 'commit', '-q', '--no-verify', '-m', 'c');
    shas.push(git(dir, 'rev-parse', 'HEAD'));
  }
  return { dir, shas };
}

await test('only documentation, Android and tooling changes skip the iOS build', () => {
  assert.equal(
    iosAffected([
      'README.md',
      'CONTRIBUTING.md',
      'docs/preview.jpg',
      'android/src/main/java/com/remotecompose/RemoteComposeViewManager.kt',
      'example/android/app/build.gradle',
      'example-expo/android/app/build.gradle',
      'tools/remote-compose-json/build.gradle.kts',
      'e2e/flows/host-values.yaml',
      '.github/dependabot.yml',
    ]),
    false
  );
});

await test('any file the iOS build may read runs it, including near misses', () => {
  for (const path of [
    'ios/HostValue.swift',
    'ios/RemoteComposeView.mm',
    'RemoteCompose.podspec',
    'src/index.tsx',
    'package.json',
    'yarn.lock',
    'example/ios/Podfile.lock',
    'example-expo/ios/Podfile', // only example-expo/android is irrelevant
    'example/README.md', // a turbo build:ios input; only top-level Markdown is skipped
    'ios/Tests/NOTES.md',
    'example/src/App.tsx',
    'example-shared/src/screens/Host.tsx',
    '.github/workflows/ci.yml', // a CI change must run the job it changes
    '.github/actions/setup/action.yml',
    'app.plugin.js',
    'turbo.json',
  ]) {
    assert.equal(iosAffected(['README.md', path]), true, path);
  }
});

await test('an empty change runs the build rather than skipping it', () => {
  assert.equal(iosAffected([]), true);
});

await test('no tracked file that turbo counts as a build:ios input is ever skipped', () => {
  // turbo.json build:ios: the example apps' own files except android/, plus these root paths.
  const turboInput =
    /^(example|example-expo)\/(?!android\/)|^(package\.json|yarn\.lock|app\.plugin\.js|react-native\.config\.js|[^/]+\.podspec)$|^(src|plugin|example-shared|ios)\//;
  const tracked = git(ROOT, 'ls-files').split('\n');
  const wronglySkipped = tracked.filter(
    (path) => turboInput.test(path) && !iosAffected([path])
  );
  assert.deepEqual(wronglySkipped, []);
});

await test('a real range: docs only skips, a moved iOS file and an iOS edit build', () => {
  const { dir, shas } = scratchRepo(
    { 'README.md': 'a', 'ios/fixture.json': '{}' },
    { 'README.md': 'b' }, // docs only
    { 'ios/fixture.json': null, 'docs/fixture.json': '{}' }, // moved out of ios/
    { 'ios/HostValue.swift': 'let x = 1' } // iOS edit
  );
  const [first, docs, moved, edit] = shas as [string, string, string, string];
  assert.deepEqual(changedFiles(first, docs, dir), ['README.md']);
  assert.equal(iosAffected(changedFiles(first, docs, dir) ?? []), false);
  const movedFiles = changedFiles(docs, moved, dir) ?? [];
  assert.ok(movedFiles.includes('ios/fixture.json'), movedFiles.join(','));
  assert.equal(iosAffected(movedFiles), true);
  assert.equal(iosAffected(changedFiles(moved, edit, dir) ?? []), true);
  assert.equal(changedFiles('0'.repeat(40), edit, dir), null);
});

await test('the CLI writes its decision to GITHUB_OUTPUT', () => {
  const { dir, shas } = scratchRepo({ 'README.md': 'a' }, { 'README.md': 'b' });
  const output = join(dir, 'github-output');
  writeFileSync(output, '');
  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [join(ROOT, 'scripts', 'ios-affected.ts'), ...args],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: output },
      }
    );
  assert.match(run(shas[0] ?? '', shas[1] ?? ''), /^ios=false \(1 files\)/);
  assert.match(run('0'.repeat(40), 'HEAD'), /^ios=true \(range/);
  assert.equal(readFileSync(output, 'utf8'), 'ios=false\nios=true\n');
});

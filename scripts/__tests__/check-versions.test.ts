import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CATALOG, catalogVersions, findMismatches } from '../check-versions.ts';
import { ROOT } from '../lib.ts';

const readRepo = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The repository's files, with one file's text changed. */
const withEdit =
  (file: string, edit: (text: string) => string) => (path: string) =>
    path === file ? edit(readRepo(path)) : readRepo(path);

await test('every copy in the repository agrees with its owner', () => {
  assert.deepEqual(findMismatches(readRepo), []);
});

await test('a podspec left behind after a catalog bump is reported, naming both values', () => {
  const rcPlayers = catalogVersions(readRepo(CATALOG)).get('rcPlayers');
  assert.ok(rcPlayers);
  const problems = findMismatches(
    withEdit(CATALOG, (text) =>
      text.replace(`rcPlayers = "${rcPlayers}"`, 'rcPlayers = "99.0.0"')
    )
  );
  assert.ok(
    problems.some(
      (p) =>
        p.startsWith('RemoteCompose.podspec: rc_players_version is ') &&
        p.endsWith(`[versions] rcPlayers is 99.0.0`)
    ),
    problems.join('\n')
  );
  // Every rc-players copy disagrees now, the lockfiles included, and nothing else.
  assert.equal(problems.length, 6, problems.join('\n'));
});

await test('a copy that can no longer be found fails instead of passing silently', () => {
  const problems = findMismatches(
    withEdit('RemoteCompose.podspec', (text) =>
      text.replace(/^rc_players_version = .*$/m, 'rc_version = "1"')
    )
  );
  assert.deepEqual(problems, [
    'RemoteCompose.podspec: rc_players_version not found; update scripts/check-versions.ts if it moved',
  ]);
});

await test('a Kotlin floor raised in the Expo plugin only is reported for build.gradle and the README', () => {
  const problems = findMismatches(
    withEdit('plugin/withRemoteCompose.js', (text) =>
      text.replace(
        /^const MIN_KOTLIN = '[^']+';$/m,
        "const MIN_KOTLIN = '9.9.9';"
      )
    )
  );
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.ok(problems.every((p) => p.endsWith('MIN_KOTLIN is 9.9.9')));
});

await test('the catalog reader returns [versions] and accepts [libraries] inline tables', () => {
  const versions = catalogVersions(
    [
      '\uFEFF# comment',
      '[versions]',
      'a = "1.0"',
      '[libraries]',
      'b = { module = "g:n", version.ref = "a" }',
    ].join('\r\n')
  );
  assert.deepEqual([...versions], [['a', '1.0']]);
  assert.throws(
    () => catalogVersions('[libraries]\nb = "2.0"'),
    /line 2 is not one/
  );
});

await test('a catalog line android/build.gradle cannot read fails the check, as it fails that build', () => {
  const problems = findMismatches(
    withEdit(CATALOG, (text) =>
      text.replace(/^rcPlayers = "([^"]+)"$/m, 'rcPlayers = "$1"  # note')
    )
  );
  assert.ok(problems.length > 0);
  assert.ok(
    problems.every((p) =>
      p.includes('is not one android/build.gradle can read')
    ),
    problems.join('\n')
  );
});

/** The native contract is generated from the spec, deterministically, on every OS. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../lib.ts';
import {
  checkIdentifier,
  generate,
  isStale,
  repoPath,
} from '../generate-native-contract.ts';

test('the committed native files are what the spec generates', () => {
  for (const [path, text] of generate()) {
    assert.equal(isStale(readFileSync(path, 'utf8'), text), false, path);
  }
});

test('a CRLF checkout of an unchanged file is not stale; a changed one is', () => {
  const generated = 'line one\nline two\n';
  assert.equal(isStale(generated.replace(/\n/g, '\r\n'), generated), false);
  assert.equal(isStale('line one\nline 2\n', generated), true);
  assert.equal(isStale(undefined, generated), true);
});

test('paths printed into generated files use / on Windows too', () => {
  assert.equal(
    repoPath('C:\\repo\\src\\Spec.ts', 'C:\\repo', win32),
    'src/Spec.ts'
  );
});

test('the generated header names the spec with a repository path', () => {
  for (const [, text] of generate()) {
    assert.match(text, /from src\/RemoteComposeViewNativeComponent\.ts\./);
  }
});

test('a wire value that cannot be a Kotlin/Swift enum case is refused, naming the field', () => {
  assert.throws(() => {
    checkIdentifier('theme', 'default');
  }, /theme: "default"/);
  assert.throws(() => {
    checkIdentifier('code', 'not-found');
  }, /code: "not-found"/);
  assert.doesNotThrow(() => {
    checkIdentifier('valueType', 'floatList');
  });
});

test('a spec whose event uses such a value fails generation', () => {
  const spec = readFileSync(
    join(ROOT, 'src/RemoteComposeViewNativeComponent.ts'),
    'utf8'
  );
  const broken = spec.replace(
    "code: 'load' | 'document' | 'unsupported';",
    "code: 'load' | 'document' | 'default';"
  );
  assert.notEqual(broken, spec);
  const dir = mkdtempSync(join(tmpdir(), 'rc-spec-'));
  const path = join(dir, 'RemoteComposeViewNativeComponent.ts');
  writeFileSync(path, broken);
  assert.throws(() => generate(path), /onRemoteError\.code: "default"/);
});

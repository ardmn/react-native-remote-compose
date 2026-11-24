import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import { ensureVerifiedFile } from '../verified-download.ts';

const TOOL = Buffer.from('#!/bin/sh\necho pinned tool\n');
const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** Paths the test server answers; every request is counted per path. */
const routes = new Map<string, { status: number; body: Uint8Array }>();
const requests = new Map<string, number>();
let server: Server;
let base: string;

before(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '';
    requests.set(path, (requests.get(path) ?? 0) + 1);
    const route = routes.get(path) ?? { status: 404, body: new Uint8Array() };
    res.writeHead(route.status).end(route.body);
  });
  await new Promise<void>((listening) =>
    server.listen(0, '127.0.0.1', listening)
  );
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

after(() => {
  server.close();
});

const tempDir = () => mkdtempSync(join(tmpdir(), 'rc-download-'));
const quiet = { retryDelayMs: 1, warn: () => undefined };

test('a missing file is downloaded, checked and written', async () => {
  routes.set('/tool', { status: 200, body: TOOL });
  const file = join(tempDir(), 'nested/tool');
  const downloaded = await ensureVerifiedFile(
    file,
    { url: `${base}/tool`, sha256: sha256(TOOL) },
    quiet
  );
  assert.equal(downloaded, true);
  assert.deepEqual(readFileSync(file), TOOL);
  assert.equal(existsSync(`${file}.part`), false);
});

test('a cached file that matches is used without a request', async () => {
  routes.set('/cached', { status: 200, body: TOOL });
  const file = join(tempDir(), 'tool');
  writeFileSync(file, TOOL);
  const downloaded = await ensureVerifiedFile(
    file,
    { url: `${base}/cached`, sha256: sha256(TOOL) },
    quiet
  );
  assert.equal(downloaded, false);
  assert.equal(requests.get('/cached'), undefined);
});

test('a corrupted cached file is reported and replaced by a verified download', async () => {
  routes.set('/corrupted', { status: 200, body: TOOL });
  const file = join(tempDir(), 'tool');
  writeFileSync(file, 'truncated');
  const warnings: string[] = [];
  const downloaded = await ensureVerifiedFile(
    file,
    { url: `${base}/corrupted`, sha256: sha256(TOOL) },
    { retryDelayMs: 1, warn: (message) => warnings.push(message) }
  );
  assert.equal(downloaded, true);
  assert.deepEqual(readFileSync(file), TOOL);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /downloading it again/);
});

test('a download that fails its checksum is refused and never written', async () => {
  routes.set('/tampered', { status: 200, body: Buffer.from('tampered') });
  const file = join(tempDir(), 'tool');
  await assert.rejects(
    ensureVerifiedFile(
      file,
      { url: `${base}/tampered`, sha256: sha256(TOOL) },
      quiet
    ),
    /has checksum .*, expected .*refusing to use it/
  );
  assert.equal(existsSync(file), false);
  assert.equal(existsSync(`${file}.part`), false);
});

test('a server error is retried up to the attempt limit, a 404 is not', async () => {
  routes.set('/flaky', { status: 503, body: new Uint8Array() });
  await assert.rejects(
    ensureVerifiedFile(
      join(tempDir(), 'tool'),
      { url: `${base}/flaky`, sha256: sha256(TOOL) },
      quiet
    ),
    /failed after 3 tries: HTTP 503/
  );
  assert.equal(requests.get('/flaky'), 3);

  await assert.rejects(
    ensureVerifiedFile(
      join(tempDir(), 'tool'),
      { url: `${base}/missing`, sha256: sha256(TOOL) },
      quiet
    ),
    /failed: HTTP 404/
  );
  assert.equal(requests.get('/missing'), 1);
});

test('a malformed pinned checksum is refused before any request', async () => {
  await assert.rejects(
    ensureVerifiedFile(
      join(tempDir(), 'tool'),
      { url: `${base}/never`, sha256: sha256(TOOL).toUpperCase() },
      quiet
    ),
    /64 lowercase hex digits/
  );
  assert.equal(requests.get('/never'), undefined);
});

// The CI step (scripts/fetch-tool.ts), run as the fetch-tool action runs it. Asynchronously: the
// test server runs on this process's event loop.
const FETCH_TOOL = resolve(import.meta.dirname, '../fetch-tool.ts');

async function fetchTool(env: Record<string, string>) {
  const runnerTemp = tempDir();
  const githubPath = join(runnerTemp, 'github_path');
  const githubOutput = join(runnerTemp, 'github_output');
  writeFileSync(githubPath, '');
  writeFileSync(githubOutput, '');
  await promisify(execFile)(process.execPath, [FETCH_TOOL], {
    env: {
      ...process.env,
      RUNNER_TEMP: runnerTemp,
      GITHUB_PATH: githubPath,
      GITHUB_OUTPUT: githubOutput,
      CACHE_FILE: join(runnerTemp, 'cache/download'),
      ARCHIVE_PATH: '',
      ...env,
    },
  });
  return {
    path: readFileSync(githubPath, 'utf8'),
    output: readFileSync(githubOutput, 'utf8'),
    cacheFile: join(runnerTemp, 'cache/download'),
    bin: join(runnerTemp, 'tools'),
  };
}

test('fetch-tool installs a plain download as an executable on PATH', async () => {
  routes.set('/plain', { status: 200, body: TOOL });
  const result = await fetchTool({
    NAME: 'tool',
    URL: `${base}/plain`,
    SHA256: sha256(TOOL),
  });
  const installed = join(result.bin, 'tool/bin/tool');
  assert.equal(result.path, `${join(result.bin, 'tool/bin')}\n`);
  assert.equal(result.output, `path=${installed}\ndownloaded=true\n`);
  assert.deepEqual(readFileSync(installed), TOOL);
  assert.match(statSync(installed).mode.toString(8), /755$/);
  assert.deepEqual(readFileSync(result.cacheFile), TOOL);
});

test('fetch-tool extracts the named file from a tar archive', async () => {
  const source = tempDir();
  mkdirSync(join(source, 'dist'));
  writeFileSync(join(source, 'dist/tool'), TOOL);
  writeFileSync(join(source, 'README'), 'not installed');
  const archive = join(tempDir(), 'tool.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', source, 'dist', 'README']);
  const bytes = readFileSync(archive);
  routes.set('/archive.tar.gz', { status: 200, body: bytes });
  const result = await fetchTool({
    NAME: 'tool',
    URL: `${base}/archive.tar.gz`,
    SHA256: sha256(bytes),
    ARCHIVE_PATH: 'dist/tool',
  });
  assert.deepEqual(readFileSync(join(result.bin, 'tool/bin/tool')), TOOL);
  assert.match(result.output, /downloaded=true/);
});

test('fetch-tool extracts the named file from a zip archive', async () => {
  const source = tempDir();
  writeFileSync(join(source, 'tool_linux'), TOOL);
  writeFileSync(join(source, 'LICENSE'), 'not installed');
  const archive = join(tempDir(), 'tool.zip');
  execFileSync('zip', ['-q', archive, 'tool_linux', 'LICENSE'], {
    cwd: source,
  });
  const bytes = readFileSync(archive);
  routes.set('/archive.zip', { status: 200, body: bytes });
  const result = await fetchTool({
    NAME: 'tool',
    URL: `${base}/archive.zip`,
    SHA256: sha256(bytes),
    ARCHIVE_PATH: 'tool_linux',
  });
  assert.deepEqual(readFileSync(join(result.bin, 'tool/bin/tool')), TOOL);
});

test('fetch-tool refuses a download that fails its checksum and installs nothing', async () => {
  routes.set('/bad', { status: 200, body: Buffer.from('tampered') });
  const runnerTemp = tempDir();
  await assert.rejects(
    fetchTool({
      NAME: 'tool',
      URL: `${base}/bad`,
      SHA256: sha256(TOOL),
      RUNNER_TEMP: runnerTemp,
    }),
    /refusing to use it/
  );
  assert.equal(existsSync(join(runnerTemp, 'tools')), false);
});

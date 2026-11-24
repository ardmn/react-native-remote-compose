/**
 * The step of .github/actions/fetch-tool: makes the cached download hold the pinned release file
 * (verified-download.ts replaces a missing or corrupted one), then installs the tool into
 * $RUNNER_TEMP/tools/<name>/bin and puts that directory on the job's PATH.
 *
 * Inputs, as environment variables: NAME (the installed file name), URL, SHA256, ARCHIVE_PATH (the
 * file inside a zip or tar archive; empty when the download is the tool itself) and CACHE_FILE
 * (where the download is kept, the path actions/cache saves), and CACHE_KEY (its cache entry, named
 * in the warning for a corrupted copy; optional). Outputs, to $GITHUB_OUTPUT: `path`
 * (the installed file) and `downloaded` (`true` when the cached file was missing or replaced).
 */
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { ensureVerifiedFile } from './verified-download.ts';

function input(name: string, required = true): string {
  // unknown: process.env's values are `any` in this repository's TypeScript program.
  const raw: unknown = process.env[name];
  const value = typeof raw === 'string' ? raw : '';
  if (required && value === '') throw new Error(`${name} is not set.`);
  return value;
}

/** A zip starts with "PK"; anything else is left to tar, which detects its compression. */
function isZip(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    const magic = Buffer.alloc(2);
    readSync(fd, magic, 0, 2, 0);
    return magic.toString('latin1') === 'PK';
  } finally {
    closeSync(fd);
  }
}

const name = input('NAME');
const archivePath = input('ARCHIVE_PATH', false);
const cacheFile = input('CACHE_FILE');
const cacheKey = input('CACHE_KEY', false);
if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) {
  throw new Error(`NAME must be a plain file name, got '${name}'.`);
}

const downloaded = await ensureVerifiedFile(
  cacheFile,
  { url: input('URL'), sha256: input('SHA256') },
  {
    warn: (message) => {
      const entry =
        cacheKey === '' ? 'the cache entry' : `gh cache delete ${cacheKey}`;
      console.log(
        `::warning::${message} A cache entry cannot be overwritten and does not expire while runs restore it: run ${entry} to stop downloading on every run.`
      );
    },
  }
);

const dir = join(input('RUNNER_TEMP'), 'tools', name);
const bin = join(dir, 'bin');
const tool = join(bin, name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(bin, { recursive: true });
if (archivePath === '') {
  copyFileSync(cacheFile, tool);
} else {
  const extracted = join(dir, 'extracted');
  mkdirSync(extracted);
  if (isZip(cacheFile)) {
    execFileSync('unzip', ['-q', cacheFile, archivePath, '-d', extracted], {
      stdio: 'inherit',
    });
  } else {
    execFileSync('tar', ['-xf', cacheFile, '-C', extracted, archivePath], {
      stdio: 'inherit',
    });
  }
  renameSync(join(extracted, archivePath), tool);
}
chmodSync(tool, 0o755);

appendFileSync(input('GITHUB_PATH'), `${bin}\n`);
appendFileSync(
  input('GITHUB_OUTPUT'),
  `path=${tool}\ndownloaded=${String(downloaded)}\n`
);
console.log(
  `${name}: ${downloaded ? 'downloaded and verified' : 'cached copy verified'}, installed at ${tool}`
);

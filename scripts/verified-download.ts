/**
 * Pinned downloads: a file fetched from a URL is used only when its SHA-256 matches the pinned one.
 * The one owner of this rule for the repository scripts (bundletool in lib.ts) and CI's tools
 * (fetch-tool.ts, through .github/actions/fetch-tool). No dependencies beyond Node, so a CI job can
 * run it without installing node_modules.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export type Pinned = {
  url: string;
  /** The SHA-256 of the file, from its official release: 64 lowercase hex digits. */
  sha256: string;
};

export type DownloadOptions = {
  /** Tries per download; a 5xx, 429 or network error is retried, anything else is not. */
  attempts?: number;
  /** Milliseconds before the first retry; doubled for each further one. */
  retryDelayMs?: number;
  /** Where a corrupted file that is being replaced is reported. */
  warn?: (message: string) => void;
};

const sha256Of = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Makes `file` hold the pinned download. A file already there is kept only when its checksum
 * matches; one that does not (truncated, corrupted, another version) is reported and downloaded
 * again. The download is checked before it is written, and written next to `file` and renamed, so
 * `file` never holds bytes that failed the check. Returns whether it downloaded.
 */
export async function ensureVerifiedFile(
  file: string,
  pinned: Pinned,
  options: DownloadOptions = {}
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(pinned.sha256)) {
    throw new Error(
      `The pinned sha256 for ${pinned.url} must be 64 lowercase hex digits, got '${pinned.sha256}'.`
    );
  }
  if (existsSync(file)) {
    const found = sha256Of(readFileSync(file));
    if (found === pinned.sha256) return false;
    (options.warn ?? console.warn)(
      `${file} has checksum ${found}, expected ${pinned.sha256}; downloading it again.`
    );
    rmSync(file, { force: true });
  }
  const bytes = await download(pinned.url, options);
  const digest = sha256Of(bytes);
  if (digest !== pinned.sha256) {
    throw new Error(
      `${pinned.url} has checksum ${digest}, expected ${pinned.sha256}; refusing to use it.`
    );
  }
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, file);
  return true;
}

async function download(
  url: string,
  { attempts = 3, retryDelayMs = 1000 }: DownloadOptions
): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    let failure: string;
    try {
      const response = await fetch(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = `HTTP ${String(response.status)}`;
      const retryable = response.status >= 500 || response.status === 429;
      if (!retryable) throw new Error(`Downloading ${url} failed: ${failure}`);
    } catch (e) {
      // fetch rejects with a TypeError on a network failure; anything else is final.
      if (!(e instanceof TypeError)) throw e;
      failure = e.cause instanceof Error ? e.cause.message : e.message;
    }
    if (attempt >= attempts) {
      throw new Error(
        `Downloading ${url} failed after ${String(attempts)} tries: ${failure}`
      );
    }
    await new Promise((done) =>
      setTimeout(done, retryDelayMs * 2 ** (attempt - 1))
    );
  }
}

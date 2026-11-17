/**
 * Process and file helpers for the measurement scripts. They run with Node 24's built-in
 * TypeScript support (`node scripts/<name>.ts`, or the `yarn measure:*` scripts) on macOS, Linux
 * and Windows; only iOS steps need macOS. Every command's output goes to a log file, and a failing
 * command stops the script naming that log.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const IS_WINDOWS = process.platform === 'win32';

/** The Android SDK: ANDROID_HOME, else Android Studio's default location on this OS. */
export const ANDROID_SDK =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (IS_WINDOWS
    ? join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'),
        'Android/Sdk'
      )
    : process.platform === 'darwin'
      ? join(homedir(), 'Library/Android/sdk')
      : join(homedir(), 'Android/Sdk'));

export const ADB = join(
  ANDROID_SDK,
  'platform-tools',
  IS_WINDOWS ? 'adb.exe' : 'adb'
);

/** The Gradle wrapper of a project directory, as this OS runs it. */
export const gradlew = (dir: string) =>
  join(dir, IS_WINDOWS ? 'gradlew.bat' : 'gradlew');

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  log?: string;
};

/** Runs a command; throws (naming the log) when it exits non-zero. Returns stdout. */
export function run(
  command: string,
  args: string[],
  options: RunOptions = {}
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ANDROID_HOME: ANDROID_SDK, ...options.env },
    // A .bat file (gradlew.bat) only runs through the shell on Windows.
    shell: IS_WINDOWS && command.endsWith('.bat'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (options.log) writeFileSync(options.log, output);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}` +
        (options.log ? ` — see ${options.log}` : `\n${output.slice(-2000)}`)
    );
  }
  return result.stdout ?? '';
}

export const adb = (...args: string[]): string => run(ADB, args);

/** Total bytes of the regular files under a directory. */
export function directoryBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile())
      total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

/**
 * Sum of the uncompressed sizes of a zip's entries (≈ an APK's install size), read from the zip's
 * central directory, so no `unzip` is needed.
 */
export function zipUncompressedBytes(path: string): number {
  const zip = readFileSync(path);
  // End of central directory record (signature 0x06054b50) within the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path} is not a zip file`);
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50)
      throw new Error(`${path}: bad central directory`);
    total += zip.readUInt32LE(offset + 24);
    offset +=
      46 +
      zip.readUInt16LE(offset + 28) +
      zip.readUInt16LE(offset + 30) +
      zip.readUInt16LE(offset + 32);
  }
  return total;
}

export const sleep = (ms: number) =>
  new Promise((done) => setTimeout(done, ms));

export const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;

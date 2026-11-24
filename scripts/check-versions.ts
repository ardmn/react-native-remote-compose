/**
 * Fails when a copy of a native dependency version disagrees with the file that owns it. Each
 * version has one owner; the copies below exist because their tools cannot read the owner:
 *
 * - `android/gradle/libs.versions.toml` (Android library and JSON CLI; Dependabot bumps it):
 *   rc-players in RemoteCompose.podspec, the example's Package.resolved, the fixtures URL in
 *   example-shared/src/documents.ts and both Gradle lockfiles; AndroidX Remote Compose in the
 *   README's tested version and both Gradle lockfiles; Compose Multiplatform against what
 *   rc-players resolves in the example's lockfile.
 * - `plugin/withRemoteCompose.js` MIN_KOTLIN (the Kotlin floor): the default in android/build.gradle
 *   and the README's Gradle snippet.
 *
 *   node scripts/check-versions.ts   (part of `yarn lint`)
 *
 * Not checked: the Package.resolved revision (it needs the network; Xcode rewrites version and
 * revision together when it resolves packages).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.ts';

export const CATALOG = 'android/gradle/libs.versions.toml';
const KOTLIN_FLOOR = 'plugin/withRemoteCompose.js';

type Read = (path: string) => string;

/** A copy: where it is, how to find the value in that file, and which owned value it must equal. */
type Copy = {
  file: string;
  what: string;
  find: (text: string) => string | undefined;
  owner: string;
  ownerValue: (read: Read) => string;
};

/**
 * The `[versions]` table of a version catalog. Accepts exactly the subset android/build.gradle reads
 * and throws on any other line, as that build does: a catalog the library cannot read inside an
 * app's build must fail here too.
 */
export function catalogVersions(text: string): Map<string, string> {
  const versions = new Map<string, string>();
  let section = '';
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (line === '' || line.startsWith('#')) return;
    const header = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line)?.[1];
    if (header !== undefined) {
      section = header;
      return;
    }
    const [, name, value] =
      /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"$/.exec(line) ?? [];
    const isLibrary =
      /^[A-Za-z0-9_-]+\s*=\s*\{\s*module\s*=\s*"[^":]+:[^":]+"\s*,\s*version\.ref\s*=\s*"[A-Za-z0-9_-]+"\s*\}$/.test(
        line
      );
    if (section === 'versions' && name && value) {
      versions.set(name, value);
    } else if (!(section === 'libraries' && isLibrary)) {
      throw new Error(
        `line ${String(index + 1)} is not one android/build.gradle can read: ${raw}`
      );
    }
  });
  return versions;
}

const match =
  (pattern: RegExp) =>
  (text: string): string | undefined =>
    pattern.exec(text)?.[1];

/** A lockfile line `group:name:version=configurations`. */
const locked = (module: string) =>
  match(new RegExp(`^${module.replace(/\./g, '\\.')}:([^=\\s]+)=`, 'm'));

function catalog(name: string): Pick<Copy, 'owner' | 'ownerValue'> {
  return {
    owner: `${CATALOG} [versions] ${name}`,
    ownerValue: (read) => {
      let versions: Map<string, string>;
      try {
        versions = catalogVersions(read(CATALOG));
      } catch (error) {
        throw new Error(`${CATALOG}: ${(error as Error).message}`);
      }
      const value = versions.get(name);
      if (value === undefined) {
        throw new Error(`${CATALOG}: [versions] ${name} is missing`);
      }
      return value;
    },
  };
}

const kotlinFloor: Pick<Copy, 'owner' | 'ownerValue'> = {
  owner: `${KOTLIN_FLOOR} MIN_KOTLIN`,
  ownerValue: (read) => {
    const value = match(/^const MIN_KOTLIN = '([^']+)';$/m)(read(KOTLIN_FLOOR));
    if (value === undefined)
      throw new Error(`${KOTLIN_FLOOR}: MIN_KOTLIN not found`);
    return value;
  },
};

const EXAMPLE_LOCK = 'example/android/app/gradle.lockfile';
const CLI_LOCK = 'tools/remote-compose-json/gradle.lockfile';

export const COPIES: readonly Copy[] = [
  {
    file: 'RemoteCompose.podspec',
    what: 'rc_players_version',
    find: match(/^rc_players_version = "([^"]+)"$/m),
    ...catalog('rcPlayers'),
  },
  {
    file: 'example/ios/RemoteComposeExample.xcworkspace/xcshareddata/swiftpm/Package.resolved',
    what: 'the rc-players pin',
    find: (text) => {
      const resolved = JSON.parse(text) as {
        pins?: { identity?: string; state?: { version?: string } }[];
      };
      return resolved.pins?.find((pin) => pin.identity === 'rc-players')?.state
        ?.version;
    },
    ...catalog('rcPlayers'),
  },
  {
    file: 'example-shared/src/documents.ts',
    what: 'the rc-players tag in the fixtures URL',
    find: match(/raw\.githubusercontent\.com\/yschimke\/rc-players\/([^/]+)\//),
    ...catalog('rcPlayers'),
  },
  {
    file: 'example-shared/src/documents.ts',
    what: 'the rc-players tag in the fixtures comment',
    find: match(/pinned to the rc-players (\S+) tag/),
    ...catalog('rcPlayers'),
  },
  {
    file: 'README.md',
    what: 'the tested remote-creation-core version',
    find: match(
      /`androidx\.compose\.remote:remote-creation-core` \*\*([^*]+)\*\*/
    ),
    ...catalog('androidxRemote'),
  },
  {
    file: EXAMPLE_LOCK,
    what: 'rc-player-compose',
    find: locked('ee.schimke.composeai:rc-player-compose'),
    ...catalog('rcPlayers'),
  },
  {
    file: EXAMPLE_LOCK,
    what: 'remote-creation-core',
    find: locked('androidx.compose.remote:remote-creation-core'),
    ...catalog('androidxRemote'),
  },
  {
    // The library declares foundation itself; ui comes only through rc-player-compose and
    // foundation, so a newer version here means rc-players moved to a newer Compose Multiplatform.
    // One direction only: a catalog value raised above rc-players' shows up here too (foundation
    // pulls ui up), which is why Dependabot ignores org.jetbrains.compose*.
    file: EXAMPLE_LOCK,
    what: 'org.jetbrains.compose.ui:ui-android (the Compose Multiplatform rc-players resolves)',
    find: locked('org.jetbrains.compose.ui:ui-android'),
    ...catalog('composeMultiplatform'),
  },
  {
    file: CLI_LOCK,
    what: 'rc-player-edit',
    find: locked('ee.schimke.composeai:rc-player-edit'),
    ...catalog('rcPlayers'),
  },
  {
    file: CLI_LOCK,
    what: 'remote-creation-core',
    find: locked('androidx.compose.remote:remote-creation-core'),
    ...catalog('androidxRemote'),
  },
  {
    file: 'android/build.gradle',
    what: 'the default kotlinVersion',
    find: match(/rootProject\.ext\.get\("kotlinVersion"\) : "([^"]+)"/),
    ...kotlinFloor,
  },
  {
    file: 'README.md',
    what: 'kotlinVersion in the Gradle snippet',
    find: match(/^\s*kotlinVersion = "([^"]+)"$/m),
    ...kotlinFloor,
  },
];

/** One message per copy that disagrees with its owner or can no longer be found. */
export function findMismatches(read: Read, copies = COPIES): string[] {
  const problems: string[] = [];
  for (const copy of copies) {
    let expected: string;
    let actual: string | undefined;
    try {
      expected = copy.ownerValue(read);
      actual = copy.find(read(copy.file));
    } catch (error) {
      problems.push(`${copy.file}: ${copy.what}: ${(error as Error).message}`);
      continue;
    }
    if (actual === undefined) {
      problems.push(
        `${copy.file}: ${copy.what} not found; update scripts/check-versions.ts if it moved`
      );
    } else if (actual !== expected) {
      problems.push(
        `${copy.file}: ${copy.what} is ${actual}, but ${copy.owner} is ${expected}`
      );
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = findMismatches((path) =>
    readFileSync(join(ROOT, path), 'utf8')
  );
  if (problems.length > 0) {
    console.error(
      'Version copies disagree with their owner:\n' +
        problems.map((problem) => `  ${problem}`).join('\n') +
        '\nCONTRIBUTING.md ("Bumping AndroidX Remote Compose or rc-players") says how to update each.'
    );
    process.exit(1);
  }
  console.log(
    `version copies: ${String(COPIES.length)} agree with their owners`
  );
}

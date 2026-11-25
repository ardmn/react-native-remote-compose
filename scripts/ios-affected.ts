/**
 * Whether a change can affect the iOS build, so CI can skip the macOS job (scarce, slow runners)
 * when it cannot. Conservative: the job is skipped only when EVERY changed file matches a path
 * that the iOS build provably does not read; anything else, an empty list, or an unknown range
 * runs it.
 *
 *   node scripts/ios-affected.ts <base> <head>   # prints ios=true|false, also to $GITHUB_OUTPUT
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** Paths the iOS example build and the Swift unit tests never read. */
const IOS_IRRELEVANT: readonly RegExp[] = [
  /\.md$/, // documentation anywhere
  /^docs\//,
  /^android\//, // the library's Android module
  /^example\/android\//,
  /^example-expo\/android\//,
  /^tools\//, // the Kotlin JSON -> .rc converter; generated documents are committed separately
  /^e2e\//, // Maestro flows, run on devices, not in CI's iOS build
  /^detekt\.yml$/,
  /^LICENSE$/,
  /^\.github\/dependabot\.yml$/,
  /^\.github\/ISSUE_TEMPLATE\//,
];

/** True unless every path is known not to affect the iOS build. An empty list runs the build. */
export function iosAffected(paths: readonly string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some(
    (path) => !IOS_IRRELEVANT.some((pattern) => pattern.test(path))
  );
}

/** A range git cannot resolve (a new branch's all-zero `before`) means "run the build". */
function changedFiles(base: string, head: string): string[] | null {
  if (!base || !head || /^0+$/.test(base)) return null;
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', `${base}...${head}`],
      {
        encoding: 'utf8',
      }
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const [base = '', head = ''] = process.argv.slice(2);
  const files = changedFiles(base, head);
  const affected = files === null ? true : iosAffected(files);
  const line = `ios=${String(affected)}`;
  console.log(
    files === null
      ? `${line} (range ${base}...${head} unknown)`
      : `${line} (${files.length} files)`
  );
  // unknown: process.env's values are `any` in this repository's TypeScript program.
  const output: unknown = process.env.GITHUB_OUTPUT;
  if (typeof output === 'string' && output !== '')
    appendFileSync(output, `${line}\n`);
}

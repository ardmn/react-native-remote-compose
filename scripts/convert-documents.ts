/**
 * Regenerates the demo documents: every example-shared/documents/json/*.json becomes
 * example-shared/documents/rc/<name>.rc through tools/remote-compose-json (AndroidX's parser plus
 * rc-players' renderability check). Works on macOS, Linux and Windows.
 *
 * Usage: yarn documents
 */
import { join } from 'node:path';
import { IS_WINDOWS, ROOT, gradlew, run } from './lib.ts';

const tool = join(ROOT, 'tools/remote-compose-json');
run(gradlew(tool), ['-q', '--console=plain', 'installDist'], { cwd: tool });
const cli = join(
  tool,
  'build/install/remote-compose-json/bin',
  IS_WINDOWS ? 'remote-compose-json.bat' : 'remote-compose-json'
);
const docs = join(ROOT, 'example-shared/documents');
process.stdout.write(run(cli, ['--dir', join(docs, 'json'), join(docs, 'rc')]));

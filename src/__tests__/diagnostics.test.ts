/**
 * The diagnostics contract: every error a developer can see comes with at least one actionable
 * suggestion, and the suggestion matches the cause rather than being generic when the cause is known.
 */
import { fixesFor, formatError } from '../diagnostics';
import type { RemoteComposeErrorEvent } from '../types';

const codes: RemoteComposeErrorEvent['code'][] = [
  'load',
  'document',
  'unsupported',
  'props',
];

it.each(codes)(
  'gives at least one fix for any %s error, even an unknown message',
  (code) => {
    expect(
      fixesFor({ code, message: 'something nobody anticipated' }).length
    ).toBeGreaterThan(0);
  }
);

it.each([
  ['load', 'HTTP 404 for https://x/a.rc', /URL/],
  ['load', 'HTTP 401 for https://x/a.rc', /headers/],
  ['load', 'No bundled asset named src_card', /assetExts/],
  [
    'unsupported',
    'JSON documents are converted on Android only.',
    /remote-compose-json/,
  ],
  ['load', 'Parsing error at ContextPath: root -> children[3]', /ContextPath/],
  [
    'document',
    "Named value 'count' (int) does not match the document's type",
    /declares/,
  ],
  ['document', 'paint style 2 is not implemented', /lenient/],
] as const)(
  'suggests a cause-specific fix for %s "%s"',
  (code, message, expected) => {
    expect(fixesFor({ code, message }).join('\n')).toMatch(expected);
  }
);

it('formats the code, the original message and the fixes', () => {
  const text = formatError({
    code: 'load',
    message: 'HTTP 404 for https://x/a.rc',
  });
  expect(text).toContain('load');
  expect(text).toContain('HTTP 404 for https://x/a.rc');
  expect(text).toMatch(/How to fix:\n {2}• /);
});

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
    // iOS's message, word for word (ios/RemoteComposeJson.swift).
    'unsupported',
    'JSON to .rc conversion is available on Android only. Convert on the server or at build time (tools/remote-compose-json) and pass the .rc as uri or base64.',
    /remote-compose-json/,
  ],
  // Android's base64 decoder and iOS's loader word an invalid base64 source differently.
  ['load', 'bad base-64', /RFC 4648/],
  ['load', 'Invalid base64 document', /RFC 4648/],
  ['load', 'Unsupported uri scheme: ftp://x/a.rc', /http\(s\)/],
  ['load', 'Invalid document uri: ::', /http\(s\)/],
  ['load', 'Document larger than 16777216 bytes', /16 MB/],
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

it('never gives a hint meant for another kind of failure', () => {
  // "timed out" is a network hint for load errors; a player message that says it is not one.
  const fixes = fixesFor({
    code: 'document',
    message: 'animation timed out after 3 frames',
  });
  expect(fixes.join('\n')).not.toMatch(/connectivity/);
});

it('formats the code, the original message and the fixes', () => {
  const text = formatError({
    code: 'load',
    message: 'HTTP 404 for https://x/a.rc',
  });
  expect(text).toContain('load');
  expect(text).toContain('HTTP 404 for https://x/a.rc');
  expect(text).toMatch(/How to fix:\n {2}• /);
});

import type { RemoteComposeErrorEvent } from './types';

const TAG = '[react-native-remote-compose]';

type Hint = { when: RegExp; fixes: string[] };

/**
 * Known failure messages (from the native loaders, rc-players and AndroidX's JSON parser) mapped
 * to what the developer can do about them. Matched against the message; first match wins.
 */
const HINTS: Hint[] = [
  {
    when: /HTTP 40[13]/,
    fixes: [
      'The server refused the request: pass credentials with source={{ uri, headers: { Authorization: … } }}.',
    ],
  },
  {
    when: /HTTP 404/,
    fixes: ['Check the document URL; the server has no file there.'],
  },
  {
    when: /HTTP \d{3}/,
    fixes: [
      'The document server answered with an error status; check its logs.',
    ],
  },
  {
    when: /UnknownHost|Unable to resolve host|offline|not connected|timed out|Timeout/i,
    fixes: [
      'The device could not reach the server: check connectivity and the URL host.',
      'On Android, a cleartext http:// URL also needs usesCleartextTraffic or a network security config.',
    ],
  },
  {
    when: /No bundled asset|No such file|Cannot open/i,
    fixes: [
      "Bundle .rc files as assets: add 'rc' to resolver.assetExts in metro.config.js and use source={require('./doc.rc')}.",
      'Restart Metro with --reset-cache after changing assetExts.',
    ],
  },
  {
    when: /Invalid base64/i,
    fixes: [
      'source.base64 must be standard base64 of the .rc bytes (RFC 4648, padded).',
    ],
  },
  {
    when: /JSON documents are converted on Android only|available on Android only/i,
    fixes: [
      'Convert the JSON once on your server or at build time: `tools/remote-compose-json in.json out.rc`.',
      'Then pass the .rc as source={{ uri }} or source={require(...)} on every platform.',
    ],
  },
  {
    when: /Parsing error|Unknown (component|token|shape|header)|Variable not found|JSONException/i,
    fixes: [
      'The authoring JSON is invalid; the ContextPath in the message points at the failing node.',
      'Reference: AndroidX compose/remote/Documentation/parts/json-parser.md.',
    ],
  },
  {
    when: /does not match the document's type/,
    fixes: [
      "Pass the type the document declares: { type: 'color', value: '#…' } for colors, a plain number for floats, a string for text.",
      'The onLoad event lists the names the document declares.',
      'On iOS the player sets float, string and color values only (not int or boolean).',
    ],
  },
  {
    when: /not implemented|unsupported operation|cannot draw|not supported by|blocking/i,
    fixes: [
      'The document uses operations this player cannot draw. Set lenient to draw the rest of it.',
      'Or author the document against the operations rc-players supports (check its release notes).',
    ],
  },
  {
    when: /typeface|font family/i,
    fixes: [
      'The document names a font the player does not have. Use a system family or embed the font in the document.',
    ],
  },
];

const GENERIC: Record<RemoteComposeErrorEvent['code'], string[]> = {
  load: [
    'The document bytes could not be obtained. Check the source (uri / base64 / json) and the network.',
  ],
  document: [
    'The player rejected the document. Validate it on a desktop with `tools/remote-compose-json --dump doc.rc`.',
  ],
  unsupported: [
    'This feature is not available on this platform; see the README platform table.',
  ],
  props: [
    'Fix the props passed to <RemoteComposeView>; the message names the offending prop.',
  ],
};

/** Fix suggestions for an error, most specific first. Never empty. */
export function fixesFor(error: RemoteComposeErrorEvent): string[] {
  const hint = HINTS.find((h) => h.when.test(error.message));
  return hint ? hint.fixes : GENERIC[error.code];
}

/** One readable, multi-line console message for an error. */
export function formatError(error: RemoteComposeErrorEvent): string {
  const fixes = fixesFor(error)
    .map((fix) => `  • ${fix}`)
    .join('\n');
  return `${TAG} ${error.code} error: ${error.message}\nHow to fix:\n${fixes}`;
}

/** Logs every error the view reports, whether or not the app handles `onError`. */
export function reportError(error: RemoteComposeErrorEvent): void {
  console.error(formatError(error));
}

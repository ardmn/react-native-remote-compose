import type { RemoteComposeErrorEvent } from './types';

/** The package name, as the app's console and error messages show it. */
export const LIBRARY = 'react-native-remote-compose';
const TAG = `[${LIBRARY}]`;

type Code = RemoteComposeErrorEvent['code'];

type Hint = {
  /** The error codes the hint applies to: a pattern never matches an unrelated kind of failure. */
  codes: readonly Code[];
  when: RegExp;
  fixes: readonly string[];
};

/**
 * Known failure messages (from the native loaders on both platforms, rc-players and AndroidX's
 * JSON parser) mapped to what the developer can do about them. First match wins.
 */
const HINTS: readonly Hint[] = [
  {
    codes: ['load'],
    when: /HTTP 40[13]/,
    fixes: [
      'The server refused the request: pass credentials with source={{ uri, headers: { Authorization: … } }}.',
    ],
  },
  {
    codes: ['load'],
    when: /HTTP 404/,
    fixes: ['Check the document URL; the server has no file there.'],
  },
  {
    codes: ['load'],
    when: /HTTP \d{3}/,
    fixes: [
      'The document server answered with an error status; check its logs.',
    ],
  },
  {
    codes: ['load'],
    when: /UnknownHost|Unable to resolve host|offline|not connected|timed out|Timeout/i,
    fixes: [
      'The device could not reach the server: check connectivity and the URL host.',
      'On Android, a cleartext http:// URL also needs usesCleartextTraffic or a network security config.',
    ],
  },
  {
    codes: ['load'],
    when: /No bundled asset|No such file|Cannot open/i,
    fixes: [
      "Bundle .rc files as assets: add 'rc' to resolver.assetExts in metro.config.js and use source={require('./doc.rc')}.",
      'Restart Metro with --reset-cache after changing assetExts.',
    ],
  },
  {
    codes: ['load'],
    // iOS: "Invalid base64 document"; Android's decoder: "bad base-64".
    when: /Invalid base64|bad base-64/i,
    fixes: [
      'source.base64 must be standard base64 of the .rc bytes (RFC 4648, padded).',
    ],
  },
  {
    codes: ['load'],
    // Android: "Unsupported uri scheme: …"; iOS: "Invalid document uri: …".
    when: /Unsupported uri scheme|Invalid document uri/i,
    fixes: [
      "source.uri must be an http(s):// or file:// URL; bundle files with source={require('./doc.rc')}.",
    ],
  },
  {
    codes: ['load'],
    when: /Document larger than/i,
    fixes: [
      'Documents are limited to 16 MB. Split the screen into several documents, or move images out of it.',
    ],
  },
  {
    codes: ['unsupported', 'load'],
    when: /available on Android only/i,
    fixes: [
      'Convert the JSON once on your server or at build time: `tools/remote-compose-json in.json out.rc`.',
      'Then pass the .rc as source={{ uri }} or source={require(...)} on every platform.',
    ],
  },
  {
    codes: ['load'],
    when: /Parsing error|Unknown (component|token|shape|header)|Variable not found|JSONException/i,
    fixes: [
      'The authoring JSON is invalid; the ContextPath in the message points at the failing node.',
      'Reference: AndroidX compose/remote/Documentation/parts/json-parser.md.',
    ],
  },
  {
    codes: ['document'],
    when: /does not match the document's type/,
    fixes: [
      "Pass the type the document declares: { type: 'color', value: '#…' } for colors, a number for floats and integers, true/false for booleans (integer variables), a string for text.",
      'The onLoad event lists the names the document declares.',
    ],
  },
  {
    codes: ['document'],
    when: /not implemented|unsupported operation|cannot draw|not supported by|blocking/i,
    fixes: [
      'The document uses operations this player cannot draw. Set lenient to draw the rest of it.',
      'Or author the document against the operations rc-players supports (check its release notes).',
    ],
  },
  {
    codes: ['document'],
    when: /typeface|font family/i,
    fixes: [
      'The document names a font the player does not have. Use a system family or embed the font in the document.',
    ],
  },
];

const GENERIC: Readonly<Record<Code, readonly string[]>> = {
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
export function fixesFor(error: RemoteComposeErrorEvent): readonly string[] {
  const hint = HINTS.find(
    (h) => h.codes.includes(error.code) && h.when.test(error.message)
  );
  return hint ? hint.fixes : GENERIC[error.code];
}

/** One readable, multi-line message: what failed and how to fix it. */
export function formatProblem(title: string, fixes: readonly string[]): string {
  return `${TAG} ${title}\nHow to fix:\n${fixes.map((fix) => `  • ${fix}`).join('\n')}`;
}

/** One readable, multi-line console message for an error. */
export function formatError(error: RemoteComposeErrorEvent): string {
  return formatProblem(
    `${error.code} error: ${error.message}`,
    fixesFor(error)
  );
}

/** Logs every error the view reports, whether or not the app handles `onError`. */
export function reportError(error: RemoteComposeErrorEvent): void {
  console.error(formatError(error));
}

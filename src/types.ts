import type { ColorValue, NativeSyntheticEvent, ViewProps } from 'react-native';

/**
 * Where the `.rc` document comes from. Exactly one of the shapes.
 *
 * - `{ uri }`: `http(s)://`, `file://`, or `require('./screen.rc')` (add `rc` to Metro's
 *   `assetExts`, see the README).
 * - `{ base64 }`: the document bytes, base64-encoded.
 * - `{ json }`: AndroidX Remote Compose authoring JSON. Converted on the device on Android; iOS has
 *   no converter, so convert on your server or at build time (`remote-compose-json` CLI) and pass
 *   the `.rc` instead. On iOS this source reports `onError` with code `unsupported`.
 */
export type RemoteComposeSource =
  | number
  | { uri: string; headers?: Record<string, string> }
  | { base64: string }
  | { json: string | object };

/**
 * A value pushed into the document's host-bound named variables (`USER:` namespace by default).
 *
 * Plain values are inferred: `number` → float, `string` → string, `boolean` → boolean.
 * Use the tagged form for colors and integers.
 */
export type RemoteComposeNamedValue =
  | number
  | string
  | boolean
  | { type: 'float'; value: number }
  | { type: 'int'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'string'; value: string }
  | { type: 'color'; value: ColorValue };

export type RemoteComposeActionEvent =
  | { kind: 'host'; actionId: number }
  | { kind: 'metadata'; actionId: number; metadata: string }
  | {
      kind: 'named';
      name: string;
      value: null | number | string | readonly number[];
      valueType: 'none' | 'float' | 'int' | 'string' | 'floatList';
    };

export type RemoteComposeErrorEvent = {
  /**
   * - `load`: the bytes could not be obtained (network, file, base64, JSON conversion).
   * - `document`: the player rejected the document (malformed, operations it cannot draw,
   *   a named value of the wrong type).
   * - `unsupported`: the feature is not available on this platform (`{ json }` on iOS).
   * - `props`: the props passed to the view are invalid (reported from JS, nothing is loaded).
   */
  code: 'load' | 'document' | 'unsupported' | 'props';
  message: string;
};

export type RemoteComposeLoadEvent = {
  byteLength: number;
  /** Native, off-main-thread time to obtain the bytes (fetch / base64 / JSON conversion), ms. */
  loadMs: number;
  /** Native, off-main-thread time to decode and validate the document, ms. */
  decodeMs: number;
  /** Host-settable names the document declares (bare names for the `USER:` namespace). */
  namedValues: readonly string[];
};

export type RemoteComposeTheme = 'system' | 'light' | 'dark';

export type RemoteComposeViewProps = ViewProps & {
  source: RemoteComposeSource;
  namedValues?: Readonly<Record<string, RemoteComposeNamedValue>>;
  theme?: RemoteComposeTheme;
  /** Draw nothing for operations this player knows but cannot draw, instead of failing. */
  lenient?: boolean;
  onAction?: (event: RemoteComposeActionEvent) => void;
  onError?: (event: RemoteComposeErrorEvent) => void;
  onLoad?: (event: RemoteComposeLoadEvent) => void;
};

export type NativeEvent<T> = NativeSyntheticEvent<T>;

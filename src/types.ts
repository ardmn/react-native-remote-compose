import type { ComponentRef, Ref } from 'react';
import type { ColorValue, HostComponent, ViewProps } from 'react-native';
import type {
  NativeActionEvent,
  NativeErrorEvent,
  NativeLoadEvent,
  NativeNamedValueType,
  NativeProps,
} from './RemoteComposeViewNativeComponent';

/** `true` when `A` and `B` are the same set of string literals. */
type SameKeys<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
/** Fails to compile unless `T` is `true`. */
type Assert<T extends true> = T;

type DocumentKey = 'uri' | 'base64' | 'json';
/** `T`, with the other document keys forbidden, so a source names exactly one document. */
type Exclusive<T> = T & { [K in Exclude<DocumentKey, keyof T>]?: never };

/**
 * Where the `.rc` document comes from: exactly one of the shapes.
 *
 * - `require('./screen.rc')`: a bundled asset (add `rc` to Metro's `assetExts`, see the README).
 * - `{ uri }`: `http(s)://` or `file://`, with optional request `headers`.
 * - `{ base64 }`: the document bytes, base64-encoded.
 * - `{ json }`: AndroidX Remote Compose authoring JSON. Converted on the device on Android; iOS has
 *   no converter, so convert on your server or at build time (`remote-compose-json` CLI) and pass
 *   the `.rc` instead. On iOS this source reports `onError` with code `unsupported`.
 */
export type RemoteComposeSource =
  | number
  | Exclusive<{ uri: string; headers?: Readonly<Record<string, string>> }>
  | Exclusive<{ base64: string }>
  | Exclusive<{ json: string | object }>;

/** The JS value each named-value type takes. Must cover exactly the spec's types. */
type NamedValueTypes = {
  float: number;
  int: number;
  boolean: boolean;
  string: string;
  color: ColorValue;
};
/**
 * Compile-time check, exported only so `noUnusedLocals` accepts it.
 * @knipignore
 */
export type NamedValueTypesMatchSpec = Assert<
  SameKeys<keyof NamedValueTypes, NativeNamedValueType>
>;

/**
 * A value pushed into the document's host-bound named variables (`USER:` namespace by default).
 *
 * Plain values are inferred: `number` → float, `string` → string, `boolean` → an integer variable
 * holding 1 or 0 (Remote Compose has no boolean variable type).
 * Use the tagged form for colors and integers.
 */
export type RemoteComposeNamedValue =
  | number
  | string
  | boolean
  | {
      [T in NativeNamedValueType]: { type: T; value: NamedValueTypes[T] };
    }[NativeNamedValueType];

/** A named action's value, typed by its `valueType`. */
export type RemoteComposeNamedActionValue =
  | { valueType: 'none'; value: null }
  | { valueType: 'float' | 'int'; value: number }
  | { valueType: 'string'; value: string }
  | { valueType: 'floatList'; value: readonly number[] };
/**
 * Compile-time check, exported only so `noUnusedLocals` accepts it.
 * @knipignore
 */
export type NamedActionValueMatchesSpec = Assert<
  SameKeys<
    RemoteComposeNamedActionValue['valueType'],
    NativeActionEvent['valueType']
  >
>;

export type RemoteComposeActionEvent =
  | { kind: 'host'; actionId: number }
  | { kind: 'metadata'; actionId: number; metadata: string }
  | ({ kind: 'named'; name: string } & RemoteComposeNamedActionValue);

export type RemoteComposeErrorEvent = {
  /**
   * - `load`: the bytes could not be obtained (network, file, base64, JSON conversion).
   * - `document`: the player rejected the document (malformed, operations it cannot draw,
   *   a named value of the wrong type).
   * - `unsupported`: the feature is not available on this platform (`{ json }` on iOS).
   * - `props`: the props passed to the view are invalid (reported from JS). An invalid `source`
   *   shows no document; an invalid named value is not sent, the valid ones still are.
   */
  code: NativeErrorEvent['code'] | 'props';
  message: string;
};

/** Sent when a document has loaded; see the spec for the fields. */
export type RemoteComposeLoadEvent = NativeLoadEvent;

export type RemoteComposeTheme = NonNullable<NativeProps['theme']>;

export type RemoteComposeViewProps = ViewProps & {
  ref?: Ref<ComponentRef<HostComponent<NativeProps>>>;
  source: RemoteComposeSource;
  namedValues?: Readonly<Record<string, RemoteComposeNamedValue>>;
  /** Light or dark variant of the document's colors. Default: follow the system. */
  theme?: RemoteComposeTheme;
  /** Draw nothing for operations this player knows but cannot draw, instead of failing. */
  lenient?: boolean;
  onAction?: (event: RemoteComposeActionEvent) => void;
  /** Every error, also logged to the console with fix suggestions. */
  onError?: (event: RemoteComposeErrorEvent) => void;
  onLoad?: (event: RemoteComposeLoadEvent) => void;
};

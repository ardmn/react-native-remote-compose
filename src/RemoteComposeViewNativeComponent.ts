/**
 * The native contract of `RemoteComposeView`: the single source of truth for every prop, event,
 * field name and string value that crosses the JS ↔ native boundary.
 *
 * - React Native Codegen turns it into the C++ props/event structs and enums (both platforms) and
 *   the Java props interface (Android).
 * - `yarn contract` (scripts/generate-native-contract.ts) turns the same schema into the Kotlin and
 *   Swift models Codegen does not produce. CI fails when they drift from this file.
 *
 * Codegen has no union or map props, so the public, typed API lives in `types.ts` and is mapped to
 * this flat shape in `convert.ts`.
 */
import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

/**
 * The types a named value can have. Codegen (0.88) declares no C++ enum for a string union nested
 * in an object prop, so `NativeNamedValue.valueType` is a `string` on the wire; `yarn contract`
 * reads the values from this union instead.
 */
export type NativeNamedValueType =
  'float' | 'int' | 'boolean' | 'string' | 'color';

/** One host-supplied named value. */
export type NativeNamedValue = Readonly<{
  name: string;
  /** A {@link NativeNamedValueType}. */
  valueType: string;
  /** Set for `string`. */
  text: string;
  /** Set for `float`, `int`, `boolean` (0/1) and `color` (ARGB as produced by `processColor`). */
  number: CodegenTypes.Double;
}>;

export type NativeActionEvent = Readonly<{
  /** `host` (numeric id), `metadata` (id + text) or `named` (name + typed value). */
  kind: 'host' | 'metadata' | 'named';
  actionId: CodegenTypes.Int32;
  name: string;
  metadata: string;
  valueType: 'none' | 'float' | 'int' | 'string' | 'floatList';
  text: string;
  number: CodegenTypes.Double;
  numbers: CodegenTypes.Double[];
}>;

export type NativeErrorEvent = Readonly<{
  /** See `RemoteComposeErrorEvent`. */
  code: 'load' | 'document' | 'unsupported';
  message: string;
}>;

export type NativeLoadEvent = Readonly<{
  byteLength: CodegenTypes.Int32;
  /** Native time to obtain the bytes (fetch / base64 decode / JSON conversion), ms. */
  loadMs: CodegenTypes.Double;
  /** Native time to decode and validate the document, ms. */
  decodeMs: CodegenTypes.Double;
  /** Host-settable names the document declares, `USER:` prefix stripped. */
  namedValues: string[];
}>;

export interface NativeProps extends ViewProps {
  /** Base64 of `.rc` bytes. Highest priority source. */
  documentBase64?: string;
  /** http(s)://, file://, or a bundled-asset id resolved by `Image.resolveAssetSource`. */
  documentUri?: string;
  /** Request headers for `documentUri`, flattened as [name, value, name, value, …]. */
  documentHeaders?: ReadonlyArray<string>;
  /** AndroidX authoring JSON. Converted on the device where the platform supports it (Android). */
  documentJson?: string;
  namedValues?: ReadonlyArray<NativeNamedValue>;
  theme?: CodegenTypes.WithDefault<'system' | 'light' | 'dark', 'system'>;
  /** Draw nothing for known-but-unimplemented operations instead of refusing the document. */
  lenient?: CodegenTypes.WithDefault<boolean, false>;
  onRemoteAction?: CodegenTypes.DirectEventHandler<NativeActionEvent>;
  onRemoteError?: CodegenTypes.DirectEventHandler<NativeErrorEvent>;
  onRemoteLoad?: CodegenTypes.DirectEventHandler<NativeLoadEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'RemoteComposeView'
) as HostComponent<NativeProps>;

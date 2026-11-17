import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

/**
 * One host-supplied named value, flattened for Codegen (which has no union or map props).
 * The public, typed API lives in `RemoteComposeView.tsx`; this shape is internal.
 */
export type NativeNamedValue = Readonly<{
  name: string;
  /** `float` | `int` | `boolean` | `string` | `color` */
  type: string;
  /** Set for `string`. */
  text: string;
  /** Set for `float`, `int`, `boolean` (0/1) and `color` (ARGB as produced by `processColor`). */
  number: CodegenTypes.Double;
}>;

export type NativeActionEvent = Readonly<{
  /** `host` (numeric id), `metadata` (id + text) or `named` (name + typed value). */
  kind: string;
  actionId: CodegenTypes.Int32;
  name: string;
  metadata: string;
  /** `none` | `float` | `int` | `string` | `floatList` */
  valueType: string;
  text: string;
  number: CodegenTypes.Double;
  numbers: CodegenTypes.Double[];
}>;

export type NativeErrorEvent = Readonly<{
  /** `load` | `document` | `unsupported`, see `RemoteComposeErrorEvent`. */
  code: string;
  message: string;
}>;

export type NativeLoadEvent = Readonly<{
  byteLength: CodegenTypes.Int32;
  /** Native time to obtain the bytes (fetch / base64 decode / JSON conversion), ms. */
  loadMs: CodegenTypes.Double;
  /** Native time to decode and validate the document, ms. Both run off the main thread. */
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

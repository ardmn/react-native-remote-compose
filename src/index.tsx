import NativeRemoteComposeModule from './NativeRemoteComposeModule';

export { RemoteComposeView } from './RemoteComposeView';
export type {
  RemoteComposeActionEvent,
  RemoteComposeErrorEvent,
  RemoteComposeLoadEvent,
  RemoteComposeNamedValue,
  RemoteComposeSource,
  RemoteComposeTheme,
  RemoteComposeViewProps,
} from './types';

/** Whether `{ json }` sources and {@link convertJsonToRc} work on this platform (Android: yes). */
export function isJsonConversionSupported(): boolean {
  return NativeRemoteComposeModule.isJsonConversionSupported();
}

/**
 * AndroidX Remote Compose authoring JSON → `.rc` document, base64-encoded, using AndroidX's own
 * `RemoteComposeJsonParser` on the device. Rejects on platforms without it (iOS).
 */
export function convertJsonToRc(json: string | object): Promise<string> {
  return NativeRemoteComposeModule.convertJsonToRc(
    typeof json === 'string' ? json : JSON.stringify(json)
  );
}

import NativeRemoteComposeModule, {
  type Spec,
} from './NativeRemoteComposeModule';

export { RemoteComposeView } from './RemoteComposeView';
export { formatError } from './diagnostics';
export type {
  RemoteComposeActionEvent,
  RemoteComposeErrorEvent,
  RemoteComposeLoadEvent,
  RemoteComposeNamedValue,
  RemoteComposeSource,
  RemoteComposeTheme,
  RemoteComposeViewProps,
} from './types';

function nativeModule(): Spec {
  if (!NativeRemoteComposeModule) {
    throw new Error(
      '[react-native-remote-compose] The native module is not linked.\n' +
        'How to fix:\n' +
        '  • Rebuild the app after installing the package (bare: pod install + rebuild; Expo: npx expo prebuild, then a dev build).\n' +
        '  • Expo Go cannot load this library: use a development build.'
    );
  }
  return NativeRemoteComposeModule;
}

/** Whether `{ json }` sources and {@link convertJsonToRc} work on this platform (Android: yes). */
export function isJsonConversionSupported(): boolean {
  return nativeModule().isJsonConversionSupported();
}

/**
 * AndroidX Remote Compose authoring JSON → `.rc` document, base64-encoded, using AndroidX's own
 * `RemoteComposeJsonParser` on the device. Rejects on platforms without it (iOS).
 */
export function convertJsonToRc(json: string | object): Promise<string> {
  return nativeModule().convertJsonToRc(
    typeof json === 'string' ? json : JSON.stringify(json)
  );
}

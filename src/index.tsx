import NativeRemoteComposeModule, {
  type Spec,
} from './NativeRemoteComposeModule';
import { jsonText } from './convert';
import { formatProblem } from './diagnostics';

export { RemoteComposeView } from './RemoteComposeView';
export { formatError } from './diagnostics';
export type {
  RemoteComposeActionEvent,
  RemoteComposeErrorEvent,
  RemoteComposeLoadEvent,
  RemoteComposeNamedActionValue,
  RemoteComposeNamedValue,
  RemoteComposeSource,
  RemoteComposeTheme,
  RemoteComposeViewProps,
} from './types';

function nativeModule(): Spec {
  if (!NativeRemoteComposeModule) {
    throw new Error(
      formatProblem('The native module is not linked.', [
        'Rebuild the app after installing the package (bare: pod install + rebuild; Expo: npx expo prebuild, then a dev build).',
        'Expo Go cannot load this library: use a development build.',
      ])
    );
  }
  return NativeRemoteComposeModule;
}

/**
 * Whether `{ json }` sources and {@link convertJsonToRc} work on this platform (Android: yes).
 * Throws, with fix suggestions, when the native module is not linked.
 */
export function isJsonConversionSupported(): boolean {
  return nativeModule().isJsonConversionSupported();
}

/**
 * AndroidX Remote Compose authoring JSON → `.rc` document, base64-encoded, using AndroidX's own
 * `RemoteComposeJsonParser` on the device. Rejects on platforms without it (iOS), when the module
 * is not linked, and for JSON that cannot be serialised or parsed.
 */
export async function convertJsonToRc(json: string | object): Promise<string> {
  return nativeModule().convertJsonToRc(jsonText('json', json));
}

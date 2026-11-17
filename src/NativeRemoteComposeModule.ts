import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  /** Whether this platform can turn AndroidX authoring JSON into `.rc` bytes on the device. */
  isJsonConversionSupported(): boolean;
  /** AndroidX authoring JSON → `.rc` bytes, base64-encoded. Rejects where unsupported. */
  convertJsonToRc(json: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('RemoteComposeModule');

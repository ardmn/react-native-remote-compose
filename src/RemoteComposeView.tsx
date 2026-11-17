import type { RemoteComposeViewProps } from './types';

export function RemoteComposeView(_props: RemoteComposeViewProps): never {
  throw new Error(
    "'react-native-remote-compose' is only supported on Android and iOS."
  );
}

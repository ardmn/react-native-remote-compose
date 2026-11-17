import type { ColorValue, ViewProps } from 'react-native';

type Props = ViewProps & {
  color?: ColorValue;
};

export function RemoteComposeView(_props: Props): never {
  throw new Error(
    "'react-native-remote-compose' is only supported on native platforms."
  );
}

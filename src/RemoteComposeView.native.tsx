import { useCallback, useEffect, useEffectEvent, useMemo } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import NativeRemoteComposeView, {
  type NativeActionEvent,
  type NativeErrorEvent,
  type NativeLoadEvent,
} from './RemoteComposeViewNativeComponent';
import {
  fromNativeAction,
  toNativeNamedValues,
  toNativeSource,
  type NativeSourceProps,
} from './convert';
import { reportError } from './diagnostics';
import type { RemoteComposeErrorEvent, RemoteComposeViewProps } from './types';

/** The native source props for `source`, or the message explaining why it is invalid. */
function convertSource(
  source: RemoteComposeViewProps['source']
):
  | { props: NativeSourceProps; error?: undefined }
  | { props: {}; error: string } {
  try {
    return { props: toNativeSource(source) };
  } catch (e) {
    return { props: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Plays a Remote Compose document with the rc-players Compose Multiplatform player
 * (a Jetpack Compose view on Android, the RcComposePlayer XCFramework on iOS).
 *
 * Every error — invalid props, loading, or the player rejecting the document — is logged to the
 * console with fix suggestions and passed to `onError`.
 */
export function RemoteComposeView({
  ref,
  source,
  namedValues,
  theme,
  lenient,
  onAction,
  onError,
  onLoad,
  ...viewProps
}: RemoteComposeViewProps) {
  const nativeSource = useMemo(() => convertSource(source), [source]);
  const nativeValues = useMemo(
    () => toNativeNamedValues(namedValues),
    [namedValues]
  );

  const fail = useCallback(
    (error: RemoteComposeErrorEvent) => {
      reportError(error);
      onError?.(error);
    },
    [onError]
  );

  // Keyed on the message, not on object identity: inline props and an onError that re-renders the
  // app must not report the same problem again.
  const propsError = [nativeSource.error, ...nativeValues.errors]
    .filter((message) => message !== undefined)
    .join('\n');
  const reportPropsError = useEffectEvent((message: string) => {
    fail({ code: 'props', message });
  });
  useEffect(() => {
    if (propsError) reportPropsError(propsError);
  }, [propsError]);

  const handleAction = useCallback(
    (event: NativeSyntheticEvent<NativeActionEvent>) =>
      onAction?.(fromNativeAction(event.nativeEvent)),
    [onAction]
  );
  const handleError = useCallback(
    (event: NativeSyntheticEvent<NativeErrorEvent>) => {
      fail({
        code: event.nativeEvent.code,
        message: event.nativeEvent.message,
      });
    },
    [fail]
  );
  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<NativeLoadEvent>) =>
      onLoad?.(event.nativeEvent),
    [onLoad]
  );

  return (
    <NativeRemoteComposeView
      {...viewProps}
      {...nativeSource.props}
      ref={ref}
      namedValues={nativeValues.values}
      theme={theme}
      lenient={lenient}
      onRemoteAction={onAction ? handleAction : undefined}
      onRemoteError={handleError}
      onRemoteLoad={onLoad ? handleLoad : undefined}
    />
  );
}

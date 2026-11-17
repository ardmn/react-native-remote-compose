import { useCallback, useEffect, useMemo } from 'react';
import {
  fromNativeAction,
  toNativeNamedValues,
  toNativeSource,
} from './convert';
import { reportError } from './diagnostics';
import NativeRemoteComposeView, {
  type NativeActionEvent,
  type NativeErrorEvent,
  type NativeLoadEvent,
  type NativeProps,
} from './RemoteComposeViewNativeComponent';
import type {
  NativeEvent,
  RemoteComposeErrorEvent,
  RemoteComposeViewProps,
} from './types';

type Converted<T> =
  { value: T; error?: undefined } | { value?: undefined; error: Error };

function attempt<T>(fn: () => T): Converted<T> {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
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
  source,
  namedValues,
  theme = 'system',
  lenient = false,
  onAction,
  onError,
  onLoad,
  ...viewProps
}: RemoteComposeViewProps) {
  const nativeSource = useMemo(
    () => attempt(() => toNativeSource(source)),
    [source]
  );
  const nativeValues = useMemo(
    () => attempt(() => toNativeNamedValues(namedValues)),
    [namedValues]
  );

  const fail = useCallback(
    (error: RemoteComposeErrorEvent) => {
      reportError(error);
      onError?.(error);
    },
    [onError]
  );

  // Invalid props are reported once per change, not on every render.
  const propsError = nativeSource.error ?? nativeValues.error;
  useEffect(() => {
    if (propsError) fail({ code: 'props', message: propsError.message });
  }, [propsError, fail]);

  const handleAction = useCallback(
    (event: NativeEvent<NativeActionEvent>) =>
      onAction?.(fromNativeAction(event.nativeEvent)),
    [onAction]
  );
  const handleError = useCallback(
    (event: NativeEvent<NativeErrorEvent>) =>
      fail({
        code: event.nativeEvent.code as RemoteComposeErrorEvent['code'],
        message: event.nativeEvent.message,
      }),
    [fail]
  );
  const handleLoad = useCallback(
    (event: NativeEvent<NativeLoadEvent>) =>
      onLoad?.({
        byteLength: event.nativeEvent.byteLength,
        loadMs: event.nativeEvent.loadMs,
        decodeMs: event.nativeEvent.decodeMs,
        namedValues: event.nativeEvent.namedValues,
      }),
    [onLoad]
  );

  const documentProps: Partial<NativeProps> = nativeSource.value ?? {};

  return (
    <NativeRemoteComposeView
      {...viewProps}
      {...documentProps}
      namedValues={nativeValues.value ?? []}
      theme={theme}
      lenient={lenient}
      onRemoteAction={onAction ? handleAction : undefined}
      onRemoteError={handleError}
      onRemoteLoad={onLoad ? handleLoad : undefined}
    />
  );
}

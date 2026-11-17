import { useCallback, useMemo } from 'react';
import {
  fromNativeAction,
  toNativeNamedValues,
  toNativeSource,
} from './convert';
import NativeRemoteComposeView, {
  type NativeActionEvent,
  type NativeErrorEvent,
  type NativeLoadEvent,
} from './RemoteComposeViewNativeComponent';
import type {
  NativeEvent,
  RemoteComposeErrorEvent,
  RemoteComposeViewProps,
} from './types';

/**
 * Plays a Remote Compose document with the rc-players Compose Multiplatform player
 * (a Jetpack Compose view on Android, the RcComposePlayer XCFramework on iOS).
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
  const nativeSource = useMemo(() => toNativeSource(source), [source]);
  const nativeNamedValues = useMemo(
    () => toNativeNamedValues(namedValues),
    [namedValues]
  );

  const handleAction = useCallback(
    (event: NativeEvent<NativeActionEvent>) =>
      onAction?.(fromNativeAction(event.nativeEvent)),
    [onAction]
  );
  const handleError = useCallback(
    (event: NativeEvent<NativeErrorEvent>) =>
      onError?.({
        code: event.nativeEvent.code as RemoteComposeErrorEvent['code'],
        message: event.nativeEvent.message,
      }),
    [onError]
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

  return (
    <NativeRemoteComposeView
      {...viewProps}
      {...nativeSource}
      namedValues={nativeNamedValues}
      theme={theme}
      lenient={lenient}
      onRemoteAction={onAction ? handleAction : undefined}
      onRemoteError={onError ? handleError : undefined}
      onRemoteLoad={onLoad ? handleLoad : undefined}
    />
  );
}

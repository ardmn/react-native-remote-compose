import { useEffect, useEffectEvent } from 'react';
import { LIBRARY, reportError } from './diagnostics';
import type { RemoteComposeViewProps } from './types';

/**
 * Platforms other than Android and iOS (web, Windows, macOS): there is no player, so the view
 * renders nothing and reports why, instead of crashing the app.
 */
export function RemoteComposeView({ onError }: RemoteComposeViewProps): null {
  const report = useEffectEvent(() => {
    const error = {
      code: 'unsupported',
      message: `${LIBRARY} plays documents on Android and iOS only; this platform renders nothing.`,
    } as const;
    reportError(error);
    onError?.(error);
  });
  // Once per mount: the platform does not change.
  useEffect(() => report(), []);
  return null;
}

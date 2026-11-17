/**
 * On platforms without a player (web, Windows, macOS) the view renders nothing and says why,
 * instead of crashing the app.
 */
import { render } from '@testing-library/react-native';
import { RemoteComposeView } from '../RemoteComposeView.tsx';

it('renders nothing and reports the platform as unsupported, once', async () => {
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  const onError = jest.fn();
  const { toJSON, rerender } = await render(
    <RemoteComposeView source={{ base64: 'AA==' }} onError={onError} />
  );
  await rerender(
    <RemoteComposeView source={{ base64: 'AA==' }} onError={onError} />
  );
  expect(toJSON()).toBeNull();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith({
    code: 'unsupported',
    message: expect.stringContaining('Android and iOS only'),
  });
  expect(consoleError).toHaveBeenCalledWith(
    expect.stringContaining('How to fix')
  );
});

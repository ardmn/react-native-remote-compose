/**
 * Behaviour of <RemoteComposeView> as its public contract describes it (README / types.ts):
 * what reaches the native view for each kind of source and named value, how native events come
 * back to the app, and that every error is both logged with fix suggestions and passed to onError.
 */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Image, PlatformColor } from 'react-native';
import { RemoteComposeView } from '../RemoteComposeView';
import type { RemoteComposeNamedValue, RemoteComposeSource } from '../types';

type HostProps = Record<string, unknown>;

function nativeProps(): HostProps {
  return screen.getByTestId('player').props as HostProps;
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('source', () => {
  it('passes a remote uri and its headers to the native loader', async () => {
    await render(
      <RemoteComposeView
        testID="player"
        source={{
          uri: 'https://example.com/a.rc',
          headers: { Authorization: 'Bearer t' },
        }}
      />
    );
    expect(nativeProps().documentUri).toBe('https://example.com/a.rc');
    expect(nativeProps().documentHeaders).toEqual([
      'Authorization',
      'Bearer t',
    ]);
  });

  it('passes base64 bytes through unchanged', async () => {
    await render(
      <RemoteComposeView testID="player" source={{ base64: 'AAEC' }} />
    );
    expect(nativeProps().documentBase64).toBe('AAEC');
    expect(nativeProps().documentUri).toBeUndefined();
  });

  it('serialises a JSON object source to the exact JSON text', async () => {
    const json = { header: { width: 10 }, root: { box: {} } };
    await render(<RemoteComposeView testID="player" source={{ json }} />);
    expect(JSON.parse(nativeProps().documentJson as string)).toEqual(json);
  });

  it('keeps a JSON string source as written', async () => {
    await render(
      <RemoteComposeView testID="player" source={{ json: '{"root":{}}' }} />
    );
    expect(nativeProps().documentJson).toBe('{"root":{}}');
  });

  it('resolves a bundled asset (require) to a loadable uri', async () => {
    // Metro's asset registry is the boundary here: a module id resolves to wherever Metro serves it.
    const id = 42;
    jest.spyOn(Image, 'resolveAssetSource').mockImplementation((source) =>
      source === id
        ? {
            uri: 'http://localhost:8081/assets/card.rc',
            width: 0,
            height: 0,
            scale: 1,
          }
        : undefined
    );
    await render(<RemoteComposeView testID="player" source={id} />);
    expect(nativeProps().documentUri).toBe(
      'http://localhost:8081/assets/card.rc'
    );
  });
});

describe('namedValues', () => {
  it('infers float, string and boolean from plain JS values', async () => {
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={{ rating: 0.5, title: 'Hi', enabled: true }}
      />
    );
    expect(nativeProps().namedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'rating',
          valueType: 'float',
          number: 0.5,
        }),
        expect.objectContaining({
          name: 'title',
          valueType: 'string',
          text: 'Hi',
        }),
        expect.objectContaining({
          name: 'enabled',
          valueType: 'boolean',
          number: 1,
        }),
      ])
    );
  });

  it('sends a color as packed ARGB', async () => {
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={{ accent: { type: 'color', value: '#00897B' } }}
      />
    );
    const [accent] = nativeProps().namedValues as Array<{
      number: number;
      valueType: string;
    }>;
    expect(accent!.valueType).toBe('color');
    expect(Uint32Array.of(accent!.number)[0]).toBe(0xff00897b);
  });

  it('truncates an int to an integer', async () => {
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={{ tab: { type: 'int', value: 2.9 } }}
      />
    );
    expect(nativeProps().namedValues).toEqual([
      expect.objectContaining({ name: 'tab', valueType: 'int', number: 2 }),
    ]);
  });
});

describe('props reaching the player', () => {
  it('passes theme and lenient through, and leaves them to the native default when absent', async () => {
    const { rerender } = await render(
      <RemoteComposeView testID="player" source={{ base64: 'AA==' }} />
    );
    expect(nativeProps().theme).toBeUndefined();
    expect(nativeProps().lenient).toBeUndefined();
    await rerender(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        theme="dark"
        lenient
      />
    );
    expect(nativeProps().theme).toBe('dark');
    expect(nativeProps().lenient).toBe(true);
  });
});

describe('events from the document', () => {
  it('delivers a named action with its typed value', async () => {
    const onAction = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        onAction={onAction}
      />
    );
    await fireEvent(screen.getByTestId('player'), 'remoteAction', {
      nativeEvent: {
        kind: 'named',
        actionId: 0,
        name: 'add_to_cart',
        metadata: '',
        valueType: 'float',
        text: '',
        number: 1.5,
        numbers: [],
      },
    });
    expect(onAction).toHaveBeenCalledWith({
      kind: 'named',
      name: 'add_to_cart',
      value: 1.5,
      valueType: 'float',
    });
  });

  it.each([
    [
      { kind: 'metadata', actionId: 3, metadata: 'open', valueType: 'none' },
      { kind: 'metadata', actionId: 3, metadata: 'open' },
    ],
    [
      { kind: 'named', name: 'tap', valueType: 'none' },
      { kind: 'named', name: 'tap', valueType: 'none', value: null },
    ],
    [
      { kind: 'named', name: 'pick', valueType: 'string', text: 'Mocha' },
      { kind: 'named', name: 'pick', valueType: 'string', value: 'Mocha' },
    ],
    [
      {
        kind: 'named',
        name: 'path',
        valueType: 'floatList',
        numbers: [1, 2.5],
      },
      { kind: 'named', name: 'path', valueType: 'floatList', value: [1, 2.5] },
    ],
  ])('delivers %o as %o', async (fields, expected) => {
    const onAction = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        onAction={onAction}
      />
    );
    const empty = {
      kind: 'named',
      actionId: 0,
      name: '',
      metadata: '',
      valueType: 'none',
      text: '',
      number: 0,
      numbers: [],
    };
    await fireEvent(screen.getByTestId('player'), 'remoteAction', {
      nativeEvent: { ...empty, ...fields },
    });
    expect(onAction).toHaveBeenCalledWith(expected);
  });

  it('delivers numeric host actions with their id', async () => {
    const onAction = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        onAction={onAction}
      />
    );
    await fireEvent(screen.getByTestId('player'), 'remoteAction', {
      nativeEvent: {
        kind: 'host',
        actionId: 7,
        name: '',
        metadata: '',
        valueType: 'none',
        text: '',
        number: 0,
        numbers: [],
      },
    });
    expect(onAction).toHaveBeenCalledWith({ kind: 'host', actionId: 7 });
  });

  it('reports load details', async () => {
    const onLoad = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        onLoad={onLoad}
      />
    );
    await fireEvent(screen.getByTestId('player'), 'remoteLoad', {
      nativeEvent: {
        byteLength: 10,
        loadMs: 1,
        decodeMs: 2,
        namedValues: ['title'],
      },
    });
    expect(onLoad).toHaveBeenCalledWith({
      byteLength: 10,
      loadMs: 1,
      decodeMs: 2,
      namedValues: ['title'],
    });
  });
});

describe('errors', () => {
  const nativeError = (code: string, message: string) => ({
    nativeEvent: { code, message },
  });

  it('logs a native error with fix suggestions and passes it to onError', async () => {
    const onError = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ uri: 'https://x/a.rc' }}
        onError={onError}
      />
    );
    await fireEvent(
      screen.getByTestId('player'),
      'remoteError',
      nativeError('load', 'HTTP 404 for https://x/a.rc')
    );

    expect(onError).toHaveBeenCalledWith({
      code: 'load',
      message: 'HTTP 404 for https://x/a.rc',
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls[0][0] as string;
    expect(logged).toContain('HTTP 404');
    expect(logged).toContain('How to fix');
  });

  it('logs errors even when the app has no onError handler', async () => {
    await render(
      <RemoteComposeView testID="player" source={{ base64: 'AA==' }} />
    );
    await fireEvent(
      screen.getByTestId('player'),
      'remoteError',
      nativeError('document', 'unexpected opcode 999')
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('unexpected opcode 999')
    );
  });

  it('reports an invalid prop instead of throwing during render', async () => {
    const onError = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={{
          accent: { type: 'color', value: PlatformColor('systemBlue') },
        }}
        onError={onError}
      />
    );
    expect(screen.getByTestId('player')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'props',
        message: expect.stringContaining('accent'),
      })
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('How to fix')
    );
  });

  it('reports an invalid prop once, however the app writes its props', async () => {
    // Inline literals and a handler that sets state: how apps actually write it.
    function App() {
      const [errors, setErrors] = useState(0);
      return (
        <RemoteComposeView
          testID="player"
          source={{ base64: 'AA==' }}
          namedValues={{
            accent: { type: 'color', value: PlatformColor('systemBlue') },
          }}
          // Capped, so a regression ends the loop and fails the assertion instead of hanging.
          onError={() => setErrors((n) => Math.min(n + 1, 5))}
          accessibilityHint={String(errors)}
        />
      );
    }
    const { rerender } = await render(<App />);
    await rerender(<App />);
    await rerender(<App />);
    expect(screen.getByTestId('player').props.accessibilityHint).toBe('1');
  });

  it('reports a source that is not one of the documented shapes', async () => {
    for (const source of [
      null,
      'https://x/a.rc',
      { uri: '' },
      { base64: '' },
    ]) {
      const onError = jest.fn();
      await render(
        <RemoteComposeView
          testID="player"
          source={source as unknown as RemoteComposeSource}
          onError={onError}
        />
      );
      expect(onError).toHaveBeenCalledWith({
        code: 'props',
        message: expect.stringMatching(/source/),
      });
      expect(
        nativeProps().documentUri ?? nativeProps().documentBase64
      ).toBeUndefined();
    }
  });

  it('reports a source that names more than one document', async () => {
    const onError = jest.fn();
    const both = { uri: 'https://x/a.rc', base64: 'AA==' };
    await render(
      <RemoteComposeView
        testID="player"
        source={both as unknown as RemoteComposeSource}
        onError={onError}
      />
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'props' })
    );
  });

  it('reports a named value of an unknown type instead of sending it', async () => {
    const onError = jest.fn();
    const values = { rating: { type: 'double', value: 1 } };
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={
          values as unknown as Record<string, RemoteComposeNamedValue>
        }
        onError={onError}
      />
    );
    expect(onError).toHaveBeenCalledWith({
      code: 'props',
      message: expect.stringContaining('rating'),
    });
    expect(nativeProps().namedValues).toEqual([]);
  });

  it('still sends the valid named values when one is invalid', async () => {
    const onError = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={{ title: 'Hi', rating: Number.NaN }}
        onError={onError}
      />
    );
    expect(nativeProps().namedValues).toEqual([
      expect.objectContaining({ name: 'title', valueType: 'string' }),
    ]);
    expect(onError).toHaveBeenCalledWith({
      code: 'props',
      message: expect.stringContaining('namedValues.rating'),
    });
  });

  it.each([
    [{ count: { type: 'int', value: 2 ** 31 } }, /count.*32 bits/],
    [{ rating: Number.POSITIVE_INFINITY }, /rating.*finite/],
    [{ accent: { type: 'color', value: 'notacolor' } }, /accent.*not a color/],
    [{ title: { type: 'string', value: 5 } }, /title.*string/],
    [{ missing: undefined }, /missing.*number, string, boolean/],
  ])('reports %o with a message naming the value', async (values, message) => {
    const onError = jest.fn();
    await render(
      <RemoteComposeView
        testID="player"
        source={{ base64: 'AA==' }}
        namedValues={
          values as unknown as Record<string, RemoteComposeNamedValue>
        }
        onError={onError}
      />
    );
    expect(onError).toHaveBeenCalledWith({
      code: 'props',
      message: expect.stringMatching(message),
    });
    expect(nativeProps().namedValues).toEqual([]);
  });

  it('reports a bundled asset Metro cannot resolve, with how to bundle it', async () => {
    jest.spyOn(Image, 'resolveAssetSource').mockReturnValue(undefined);
    const onError = jest.fn();
    await render(
      <RemoteComposeView testID="player" source={7} onError={onError} />
    );
    expect(onError).toHaveBeenCalledWith({
      code: 'props',
      message: expect.stringContaining('assetExts'),
    });
  });
});

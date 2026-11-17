import { Image, processColor } from 'react-native';
import type {
  NativeActionEvent,
  NativeNamedValue,
  NativeProps,
} from './RemoteComposeViewNativeComponent';
import type {
  RemoteComposeActionEvent,
  RemoteComposeNamedValue,
  RemoteComposeSource,
} from './types';

type NativeSourceProps = Pick<
  NativeProps,
  'documentBase64' | 'documentUri' | 'documentHeaders' | 'documentJson'
>;

/** Maps the public `source` to the flat native props. Exactly one document prop is set. */
export function toNativeSource(source: RemoteComposeSource): NativeSourceProps {
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    if (!resolved?.uri) {
      throw new Error(`RemoteComposeView: asset ${source} did not resolve`);
    }
    return { documentUri: resolved.uri };
  }
  if ('base64' in source) {
    return { documentBase64: source.base64 };
  }
  if ('json' in source) {
    return {
      documentJson:
        typeof source.json === 'string'
          ? source.json
          : JSON.stringify(source.json),
    };
  }
  if ('uri' in source) {
    const headers = Object.entries(source.headers ?? {}).flat();
    return headers.length > 0
      ? { documentUri: source.uri, documentHeaders: headers }
      : { documentUri: source.uri };
  }
  throw new Error('RemoteComposeView: source needs uri, base64 or json');
}

function colorToArgb(name: string, value: unknown): number {
  const processed = processColor(value as Parameters<typeof processColor>[0]);
  if (typeof processed !== 'number') {
    throw new Error(
      `RemoteComposeView: named color "${name}" must be a plain color (hex, rgb(), name), not a platform color`
    );
  }
  return processed;
}

/** Maps the public `namedValues` record to the flat array Codegen can carry. */
export function toNativeNamedValues(
  values: Readonly<Record<string, RemoteComposeNamedValue>> | undefined
): NativeNamedValue[] {
  if (!values) return [];
  return Object.entries(values).map(([name, value]): NativeNamedValue => {
    if (typeof value === 'number') {
      return { name, type: 'float', text: '', number: value };
    }
    if (typeof value === 'string') {
      return { name, type: 'string', text: value, number: 0 };
    }
    if (typeof value === 'boolean') {
      return { name, type: 'boolean', text: '', number: value ? 1 : 0 };
    }
    switch (value.type) {
      case 'float':
        return { name, type: 'float', text: '', number: value.value };
      case 'int':
        return { name, type: 'int', text: '', number: Math.trunc(value.value) };
      case 'boolean':
        return { name, type: 'boolean', text: '', number: value.value ? 1 : 0 };
      case 'string':
        return { name, type: 'string', text: value.value, number: 0 };
      case 'color':
        return {
          name,
          type: 'color',
          text: '',
          number: colorToArgb(name, value.value),
        };
    }
  });
}

/** Maps the flat native action payload back to a discriminated union. */
export function fromNativeAction(
  event: NativeActionEvent
): RemoteComposeActionEvent {
  switch (event.kind) {
    case 'host':
      return { kind: 'host', actionId: event.actionId };
    case 'metadata':
      return {
        kind: 'metadata',
        actionId: event.actionId,
        metadata: event.metadata,
      };
    default: {
      const valueType = event.valueType as Extract<
        RemoteComposeActionEvent,
        { kind: 'named' }
      >['valueType'];
      const value =
        valueType === 'string'
          ? event.text
          : valueType === 'float' || valueType === 'int'
            ? event.number
            : valueType === 'floatList'
              ? event.numbers
              : null;
      return { kind: 'named', name: event.name, value, valueType };
    }
  }
}

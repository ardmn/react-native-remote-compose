import { Image, processColor } from 'react-native';
import type {
  NativeActionEvent,
  NativeNamedValue,
  NativeNamedValueType,
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

/** A {@link NativeNamedValue} whose `valueType` the compiler checks against the spec's union. */
type TypedNativeNamedValue = NativeNamedValue & {
  valueType: NativeNamedValueType;
};

/** Maps the public `namedValues` record to the flat array Codegen can carry. */
export function toNativeNamedValues(
  values: Readonly<Record<string, RemoteComposeNamedValue>> | undefined
): TypedNativeNamedValue[] {
  if (!values) return [];
  return Object.entries(values).map(([name, value]): TypedNativeNamedValue => {
    if (typeof value === 'number') {
      return { name, valueType: 'float', text: '', number: value };
    }
    if (typeof value === 'string') {
      return { name, valueType: 'string', text: value, number: 0 };
    }
    if (typeof value === 'boolean') {
      return { name, valueType: 'boolean', text: '', number: value ? 1 : 0 };
    }
    switch (value.type) {
      case 'float':
        return { name, valueType: 'float', text: '', number: value.value };
      case 'int':
        return {
          name,
          valueType: 'int',
          text: '',
          number: Math.trunc(value.value),
        };
      case 'boolean':
        return {
          name,
          valueType: 'boolean',
          text: '',
          number: value.value ? 1 : 0,
        };
      case 'string':
        return { name, valueType: 'string', text: value.value, number: 0 };
      case 'color':
        return {
          name,
          valueType: 'color',
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
    case 'named':
      return {
        kind: 'named',
        name: event.name,
        value: namedActionValue(event),
        valueType: event.valueType,
      };
  }
}

function namedActionValue(
  event: NativeActionEvent
): Extract<RemoteComposeActionEvent, { kind: 'named' }>['value'] {
  switch (event.valueType) {
    case 'none':
      return null;
    case 'float':
    case 'int':
      return event.number;
    case 'string':
      return event.text;
    case 'floatList':
      return event.numbers;
  }
}

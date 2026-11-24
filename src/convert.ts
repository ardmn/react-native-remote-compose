import { Image, processColor, type ColorValue } from 'react-native';
import type {
  NativeActionEvent,
  NativeNamedValue,
  NativeNamedValueType,
  NativeProps,
} from './RemoteComposeViewNativeComponent';
import type {
  RemoteComposeActionEvent,
  RemoteComposeNamedActionValue,
  RemoteComposeNamedValue,
  RemoteComposeSource,
} from './types';

export type NativeSourceProps = Pick<
  NativeProps,
  'documentBase64' | 'documentUri' | 'documentHeaders' | 'documentJson'
>;

/** A {@link NativeNamedValue} whose `valueType` the compiler checks against the spec's union. */
export type TypedNativeNamedValue = NativeNamedValue & {
  valueType: NativeNamedValueType;
};

/** The types a tagged named value can name, in the order the spec lists them. */
const NAMED_VALUE_TYPES = Object.keys({
  float: true,
  int: true,
  boolean: true,
  string: true,
  color: true,
} satisfies Record<NativeNamedValueType, true>);

const SOURCE_SHAPES =
  "source must be require('./doc.rc'), { uri }, { base64 } or { json }";

/** Native named variables of integer type are 32-bit. */
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/** A short, safe description of an unexpected value for an error message. */
function describe(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'object':
      return value === null ? 'null' : 'an object';
    case 'function':
      return 'a function';
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'symbol':
    case 'undefined':
      return String(value);
  }
}

function nonEmptyString(prop: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `${prop} must be a non-empty string, got ${describe(value)}`
    );
  }
  return value;
}

/** JSON text for a `{ json }` source or `convertJsonToRc`: strings as written, objects serialised. */
export function jsonText(prop: string, json: unknown): string {
  if (typeof json === 'string') return nonEmptyString(prop, json);
  if (typeof json !== 'object' || json === null) {
    throw new Error(
      `${prop} must be JSON text or an object, got ${describe(json)}`
    );
  }
  try {
    return JSON.stringify(json);
  } catch (e) {
    throw new Error(
      `${prop} could not be serialised to JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/** Maps the public `source` to the flat native props. Exactly one document prop is set. */
export function toNativeSource(source: RemoteComposeSource): NativeSourceProps {
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    if (!resolved?.uri) {
      throw new Error(
        `source: bundled asset ${source} did not resolve; add 'rc' to Metro's resolver.assetExts and restart Metro`
      );
    }
    return { documentUri: resolved.uri };
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JavaScript callers are not type-checked and can pass null.
  if (typeof source !== 'object' || source === null) {
    throw new Error(`${SOURCE_SHAPES}, got ${describe(source)}`);
  }
  const keys = (['uri', 'base64', 'json'] as const).filter(
    (key) => key in source
  );
  if (keys.length !== 1) {
    throw new Error(
      keys.length === 0
        ? `${SOURCE_SHAPES}, got an object with none of them`
        : `source names more than one document (${keys.join(', ')}); pass exactly one`
    );
  }
  if ('base64' in source) {
    return { documentBase64: nonEmptyString('source.base64', source.base64) };
  }
  if ('json' in source) {
    return { documentJson: jsonText('source.json', source.json) };
  }
  const uri = nonEmptyString('source.uri', source.uri);
  const headers = Object.entries(source.headers ?? {}).flat();
  return headers.length > 0
    ? { documentUri: uri, documentHeaders: headers }
    : { documentUri: uri };
}

function finiteNumber(prop: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${prop} must be a finite number, got ${describe(value)}`);
  }
  return value;
}

function int32(prop: string, value: unknown): number {
  const whole = Math.trunc(finiteNumber(prop, value));
  if (whole < INT32_MIN || whole > INT32_MAX) {
    throw new Error(`${prop} must fit in 32 bits, got ${whole}`);
  }
  return whole;
}

function colorToArgb(prop: string, value: ColorValue): number {
  const processed = processColor(value);
  if (typeof processed === 'number') return processed;
  throw new Error(
    typeof value === 'string'
      ? `${prop}: ${describe(value)} is not a color React Native can parse (hex, rgb(), hsl() or a named color)`
      : `${prop} must be a plain color (hex, rgb(), hsl() or a name), not a platform color`
  );
}

function toNativeNamedValue(
  name: string,
  value: RemoteComposeNamedValue
): TypedNativeNamedValue {
  const prop = `namedValues.${name}`;
  const text = (s: string): TypedNativeNamedValue => ({
    name,
    valueType: 'string',
    text: s,
    number: 0,
  });
  const number = (
    valueType: 'float' | 'int' | 'boolean' | 'color',
    n: number
  ): TypedNativeNamedValue => ({ name, valueType, text: '', number: n });

  switch (typeof value) {
    case 'number':
      return number('float', finiteNumber(prop, value));
    case 'string':
      return text(value);
    case 'boolean':
      return number('boolean', value ? 1 : 0);
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JavaScript callers are not type-checked and can pass null.
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `${prop} must be a number, string, boolean or { type, value }, got ${describe(value)}`
    );
  }
  switch (value.type) {
    case 'float':
      return number('float', finiteNumber(`${prop}.value`, value.value));
    case 'int':
      return number('int', int32(`${prop}.value`, value.value));
    case 'boolean':
      return number('boolean', value.value ? 1 : 0);
    case 'string': {
      // Typed as a string, but JS callers can pass anything.
      const given: unknown = value.value;
      if (typeof given !== 'string') {
        throw new Error(
          `${prop}.value must be a string, got ${describe(given)}`
        );
      }
      return text(given);
    }
    case 'color':
      return number('color', colorToArgb(prop, value.value));
    default: {
      const unknown: { type?: unknown } = value;
      throw new Error(
        `${prop} has unknown type ${describe(unknown.type)}; use one of ${NAMED_VALUE_TYPES.join(', ')}`
      );
    }
  }
}

/**
 * Maps the public `namedValues` record to the flat array Codegen can carry. A value that cannot be
 * sent is left out and described in `errors`; the others are still sent.
 */
export function toNativeNamedValues(
  values: Readonly<Record<string, RemoteComposeNamedValue>> | undefined
): { values: TypedNativeNamedValue[]; errors: string[] } {
  const result: TypedNativeNamedValue[] = [];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(values ?? {})) {
    try {
      result.push(toNativeNamedValue(name, value));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { values: result, errors };
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
      return { kind: 'named', name: event.name, ...namedActionValue(event) };
  }
}

function namedActionValue(
  event: NativeActionEvent
): RemoteComposeNamedActionValue {
  switch (event.valueType) {
    case 'none':
      return { valueType: 'none', value: null };
    case 'float':
    case 'int':
      return { valueType: event.valueType, value: event.number };
    case 'string':
      return { valueType: 'string', value: event.text };
    case 'floatList':
      return { valueType: 'floatList', value: event.numbers };
  }
}

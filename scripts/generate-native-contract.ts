/**
 * Generates the native side of the JS ↔ native contract from the Codegen spec
 * (src/RemoteComposeViewNativeComponent.ts), so field names, event names and string values are
 * written down exactly once.
 *
 * React Native Codegen already produces the C++ structs/enums and the Android props interface. It
 * does not produce Kotlin models for props payloads and events, Swift types, or the conversion
 * between the C++ structs and Swift. This script fills that gap from the same schema, read with
 * Codegen's own TypeScript parser:
 *
 * - android/src/main/java/com/remotecompose/contract/RemoteComposeContract.kt
 * - ios/Contract/RemoteComposeContract.swift        (Objective-C visible Swift types)
 * - ios/Contract/RemoteComposeContractCpp.h         (C++ struct ↔ Swift type conversions)
 *
 * Usage: yarn contract           regenerate
 *        yarn contract --check   fail when the committed files differ (CI, pre-commit)
 */
import type {
  ComponentShape,
  EventTypeAnnotation,
  NamedShape,
  PropTypeAnnotation,
} from '@react-native/codegen/lib/CodegenSchema';
import { TypeScriptParser } from '@react-native/codegen/lib/parsers/typescript/parser.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import nodePath, { dirname, join } from 'node:path';
import ts from 'typescript';
import { ROOT } from './lib.ts';

/** A repository path with `/` on every OS: it is printed into generated files. */
export function repoPath(
  path: string,
  root: string = ROOT,
  api: Pick<typeof nodePath, 'relative' | 'sep'> = nodePath
): string {
  return api.relative(root, path).split(api.sep).join('/');
}

const SPEC = join(ROOT, 'src/RemoteComposeViewNativeComponent.ts');
const KOTLIN = join(
  ROOT,
  'android/src/main/java/com/remotecompose/contract/RemoteComposeContract.kt'
);
const SWIFT = join(ROOT, 'ios/Contract/RemoteComposeContract.swift');
const CPP = join(ROOT, 'ios/Contract/RemoteComposeContractCpp.h');

/** Swift types are Objective-C visible, so they carry the module prefix; Kotlin types do not. */
const SWIFT_PREFIX = 'RemoteCompose';

/**
 * Native type names for every enum, payload and event in the spec. A spec entry without a name
 * here fails the generator, so a new prop or event is named deliberately.
 */
const NAMES: Record<string, string> = {
  'theme': 'Theme',
  'namedValues': 'NamedValue',
  'namedValues.valueType': 'NamedValueType',
  'onRemoteAction': 'ActionEvent',
  'onRemoteAction.kind': 'ActionKind',
  'onRemoteAction.valueType': 'ActionValueType',
  'onRemoteError': 'ErrorEvent',
  'onRemoteError.code': 'ErrorCode',
  'onRemoteLoad': 'LoadEvent',
};

/**
 * Fields that are a plain `string` in the Codegen spec because Codegen cannot express their union
 * (it declares no C++ enum for a union nested in an object prop). Their values come from a string
 * union type alias in the spec file instead; unknown wire values fall back to `default`.
 */
const STRING_UNION_FIELDS: Record<string, { alias: string; default: string }> =
  {
    'namedValues.valueType': {
      alias: 'NativeNamedValueType',
      default: 'float',
    },
  };

/** A prop or event field as Codegen's schema describes it (its published types). */
type Annotation = PropTypeAnnotation | EventTypeAnnotation;
type Property = NamedShape<Annotation>;

// region model

type Scalar = 'string' | 'boolean' | 'int' | 'double' | 'float';

type EnumModel = {
  key: string;
  name: string;
  values: string[];
  /** The C++ enum Codegen generates for it, or null when it travels as a `std::string`. */
  cpp: string | null;
} & (
  | {
      /** A prop: JS → native. A missing or unknown wire value becomes `default`. */
      direction: 'toNative';
      default: string;
    }
  | {
      /** An event field: native → JS. */
      direction: 'toJs';
    }
);

type FieldType =
  | { kind: 'scalar'; scalar: Scalar }
  | { kind: 'list'; scalar: Scalar }
  | { kind: 'enum'; model: EnumModel }
  /** An array prop of object payloads. Props only. */
  | { kind: 'structList'; model: StructModel };

type Field = { name: string; type: FieldType };

type StructModel = {
  key: string;
  name: string;
  fields: Field[];
  cpp: string;
};

type EventModel = StructModel & { registrationName: string; eventName: string };

type Contract = {
  /** Every prop of the component, as one value: what iOS hands from C++ to Swift. */
  props: StructModel;
  enums: EnumModel[];
  /** Object payloads that arrive as array props (JS → native). */
  propStructs: StructModel[];
  /** Events (native → JS). */
  events: EventModel[];
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const screaming = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

function nameFor(key: string): string {
  const name = NAMES[key];
  if (!name) {
    throw new Error(
      `No native name for "${key}" in ${repoPath(SPEC)}: add it to NAMES in scripts/generate-native-contract.ts`
    );
  }
  return name;
}

/** Words a wire value cannot be, because it becomes a Kotlin or Swift identifier. */
const RESERVED = new Set([
  'as',
  'break',
  'case',
  'class',
  'continue',
  'default',
  'do',
  'else',
  'enum',
  'extension',
  'false',
  'for',
  'fun',
  'func',
  'if',
  'import',
  'in',
  'init',
  'internal',
  'is',
  'let',
  'nil',
  'null',
  'object',
  'private',
  'protocol',
  'public',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'val',
  'var',
  'when',
  'where',
  'while',
]);

/** Fails, naming the spec field, for a value that cannot be a Kotlin/Swift/C++ enum case. */
export function checkIdentifier(key: string, value: string): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(value) || RESERVED.has(value)) {
    throw new Error(
      `${key}: "${value}" cannot be a native enum case; use a lowerCamelCase word that is not a Kotlin or Swift keyword`
    );
  }
}

function scalarOf(
  annotation: { readonly type: string },
  where: string
): Scalar {
  switch (annotation.type) {
    case 'StringTypeAnnotation':
      return 'string';
    case 'BooleanTypeAnnotation':
      return 'boolean';
    case 'Int32TypeAnnotation':
      return 'int';
    case 'DoubleTypeAnnotation':
      return 'double';
    case 'FloatTypeAnnotation':
      return 'float';
    default:
      throw new Error(`${where}: unsupported type ${annotation.type}`);
  }
}

function buildContract(
  component: string,
  schema: ComponentShape,
  specPath: string
): Contract {
  const enums: EnumModel[] = [];

  const enumFrom = (
    key: string,
    values: readonly string[],
    cpp: string | null,
    direction:
      { direction: 'toNative'; default: string } | { direction: 'toJs' }
  ): EnumModel => {
    values.forEach((value) => {
      checkIdentifier(key, value);
    });
    const model: EnumModel = {
      key,
      name: nameFor(key),
      values: [...values],
      cpp,
      ...direction,
    };
    enums.push(model);
    return model;
  };

  const fieldsOf = (
    owner: string,
    properties: readonly Property[],
    enumCpp: (field: string) => string,
    direction: 'toNative' | 'toJs'
  ): Field[] =>
    properties.map(({ name, typeAnnotation: t }) => {
      const key = `${owner}.${name}`;
      switch (t.type) {
        case 'StringEnumTypeAnnotation':
          return {
            name,
            type: {
              kind: 'enum',
              model: enumFrom(key, t.options, enumCpp(name), {
                direction: 'toNative',
                default: t.default,
              }),
            },
          };
        case 'UnionTypeAnnotation':
          return {
            name,
            type: {
              kind: 'enum',
              model: enumFrom(
                key,
                t.types.map((literal) => literal.value),
                enumCpp(name),
                { direction: 'toJs' }
              ),
            },
          };
        case 'ArrayTypeAnnotation':
          return {
            name,
            type: { kind: 'list', scalar: scalarOf(t.elementType, key) },
          };
        default: {
          const union = STRING_UNION_FIELDS[key];
          if (union && t.type === 'StringTypeAnnotation') {
            if (direction !== 'toNative') {
              throw new Error(
                `${key}: string-union fields are supported in props only`
              );
            }
            const values = stringUnion(specPath, union.alias);
            if (!values.includes(union.default)) {
              throw new Error(
                `${key}: default "${union.default}" is not in ${union.alias}`
              );
            }
            return {
              name,
              type: {
                kind: 'enum',
                model: enumFrom(key, values, null, {
                  direction: 'toNative',
                  default: union.default,
                }),
              },
            };
          }
          return { name, type: { kind: 'scalar', scalar: scalarOf(t, key) } };
        }
      }
    });

  const propStructs: StructModel[] = [];
  const propFields = schema.props.map((prop): Field => {
    const t = prop.typeAnnotation;
    if (t.type === 'StringEnumTypeAnnotation') {
      const model = enumFrom(
        prop.name,
        t.options,
        component + capitalize(prop.name),
        {
          direction: 'toNative',
          default: t.default,
        }
      );
      return { name: prop.name, type: { kind: 'enum', model } };
    }
    if (t.type === 'ArrayTypeAnnotation') {
      if (t.elementType.type !== 'ObjectTypeAnnotation') {
        return {
          name: prop.name,
          type: { kind: 'list', scalar: scalarOf(t.elementType, prop.name) },
        };
      }
      const model: StructModel = {
        key: prop.name,
        name: nameFor(prop.name),
        // Codegen names a nested enum after the component and the field alone.
        fields: fieldsOf(
          prop.name,
          t.elementType.properties,
          (field) => component + capitalize(field),
          'toNative'
        ),
        cpp: `${component}${capitalize(prop.name)}Struct`,
      };
      propStructs.push(model);
      return { name: prop.name, type: { kind: 'structList', model } };
    }
    return {
      name: prop.name,
      type: { kind: 'scalar', scalar: scalarOf(t, prop.name) },
    };
  });
  const props: StructModel = {
    key: 'props',
    name: 'Props',
    fields: propFields,
    cpp: `${component}Props`,
  };

  const emitter = `${component}EventEmitter`;
  const events = schema.events.map((event): EventModel => {
    if (event.bubblingType !== 'direct') {
      throw new Error(
        `${event.name}: only direct events are supported by this contract`
      );
    }
    const struct = capitalize(event.name);
    const argument = event.typeAnnotation.argument;
    if (!argument)
      throw new Error(`${event.name}: an event needs a payload type`);
    return {
      key: event.name,
      name: nameFor(event.name),
      fields: fieldsOf(
        event.name,
        argument.properties,
        (field) => `${emitter}::${struct}${capitalize(field)}`,
        'toJs'
      ),
      cpp: `${emitter}::${struct}`,
      registrationName: event.name,
      eventName: `top${event.name.replace(/^on/, '')}`,
    };
  });

  // An entry is stale once its field is no longer a plain string, even if it became a real union.
  const unusedUnions = Object.keys(STRING_UNION_FIELDS).filter(
    (key) => !enums.some((e) => e.key === key && e.cpp === null)
  );
  if (unusedUnions.length > 0) {
    throw new Error(
      `STRING_UNION_FIELDS has entries the spec no longer has as strings: ${unusedUnions}`
    );
  }
  const unused = Object.keys(NAMES).filter(
    (key) =>
      !enums.some((e) => e.key === key) &&
      !propStructs.some((s) => s.key === key) &&
      !events.some((e) => e.key === key)
  );
  if (unused.length > 0) {
    throw new Error(`NAMES has entries the spec no longer has: ${unused}`);
  }
  return { props, enums, propStructs, events };
}

/** The members of `export type <alias> = 'a' | 'b' | …` in the spec, read with TypeScript's parser. */
function stringUnion(specPath: string, alias: string): string[] {
  const source = ts.createSourceFile(
    specPath,
    readFileSync(specPath, 'utf8'),
    ts.ScriptTarget.Latest
  );
  const declaration = source.statements.find(
    (statement): statement is import('typescript').TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === alias
  );
  const members =
    declaration && ts.isUnionTypeNode(declaration.type)
      ? declaration.type.types
      : undefined;
  const values = members?.map((member) =>
    ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)
      ? member.literal.text
      : undefined
  );
  if (!values || values.some((value) => value === undefined)) {
    throw new Error(
      `${alias} in ${repoPath(specPath)} must be a union of string literals`
    );
  }
  return values as string[];
}

// endregion

const HEADER = [
  `Generated by scripts/generate-native-contract.ts from ${repoPath(SPEC)}.`,
  'Do not edit: change the spec and run `yarn contract`.',
];

// region Kotlin

const KOTLIN_TYPE: Record<Scalar, string> = {
  string: 'String',
  boolean: 'Boolean',
  int: 'Int',
  double: 'Double',
  float: 'Float',
};
const KOTLIN_ZERO: Record<Scalar, string> = {
  string: '""',
  boolean: 'false',
  int: '0',
  double: '0.0',
  float: '0f',
};
const KOTLIN_RN: Record<Scalar, string> = {
  string: 'String',
  boolean: 'Boolean',
  int: 'Int',
  double: 'Double',
  float: 'Double',
};

function kotlinType(type: FieldType): string {
  switch (type.kind) {
    case 'structList':
      return `List<${type.model.name}>`;
    case 'scalar':
      return KOTLIN_TYPE[type.scalar];
    case 'list':
      return `List<${KOTLIN_TYPE[type.scalar]}>`;
    case 'enum':
      return type.model.name;
  }
}

function kotlinEnum(model: EnumModel): string {
  const entries = model.values
    .map((value) => `    ${screaming(value)}("${value}")`)
    .join(',\n');
  const lines = [
    `/** \`${model.key}\` values. */`,
    `internal enum class ${model.name}(val wireValue: String) {`,
  ];
  if (model.direction === 'toJs') {
    lines.push(`${entries},`, '}');
  } else {
    lines.push(
      `${entries},`,
      '    ;',
      '',
      '    companion object {',
      `        /** The spec's default, used for a missing or unknown value. */`,
      `        val DEFAULT = ${screaming(model.default)}`,
      '',
      `        fun fromWire(value: String?): ${model.name} = entries.firstOrNull { it.wireValue == value } ?: DEFAULT`,
      '    }',
      '}'
    );
  }
  return lines.join('\n');
}

function kotlinRead(field: Field): string {
  const key = `"${field.name}"`;
  const t = field.type;
  switch (t.kind) {
    case 'enum':
      return `${t.model.name}.fromWire(map.getString(${key}))`;
    case 'structList':
    case 'list':
      throw new Error(
        `${field.name}: list fields in prop payloads are not supported`
      );
    case 'scalar':
      if (t.scalar === 'string') return `map.getString(${key}).orEmpty()`;
      if (t.scalar === 'float') {
        return `if (map.hasKey(${key})) map.getDouble(${key}).toFloat() else 0f`;
      }
      return `if (map.hasKey(${key})) map.get${KOTLIN_RN[t.scalar]}(${key}) else ${KOTLIN_ZERO[t.scalar]}`;
  }
}

function kotlinPropStruct(model: StructModel): string {
  const params = model.fields
    .map((f) => `    val ${f.name}: ${kotlinType(f.type)},`)
    .join('\n');
  const reads = model.fields
    .map((f) => `            ${f.name} = ${kotlinRead(f)},`)
    .join('\n');
  return [
    `/** One element of the \`${model.key}\` prop. */`,
    `internal data class ${model.name}(`,
    params,
    ') {',
    '    companion object {',
    `        fun fromReadableMap(map: ReadableMap): ${model.name} = ${model.name}(`,
    reads,
    '        )',
    '',
    `        fun listFrom(array: ReadableArray?): List<${model.name}> {`,
    '            if (array == null) return emptyList()',
    '            return (0 until array.size()).mapNotNull { index -> array.getMap(index)?.let(::fromReadableMap) }',
    '        }',
    '    }',
    '}',
  ].join('\n');
}

function kotlinWrite(field: Field): string {
  const key = `"${field.name}"`;
  const t = field.type;
  switch (t.kind) {
    case 'structList':
      throw new Error(`${field.name}: object lists are props, never events`);
    case 'enum':
      return `putString(${key}, ${field.name}.wireValue)`;
    case 'list': {
      const push = `push${KOTLIN_RN[t.scalar]}`;
      const item = t.scalar === 'float' ? 'it.toDouble()' : 'it';
      return `putArray(${key}, Arguments.createArray().apply { ${field.name}.forEach { ${push}(${item}) } })`;
    }
    case 'scalar':
      return t.scalar === 'float'
        ? `putDouble(${key}, ${field.name}.toDouble())`
        : `put${KOTLIN_RN[t.scalar]}(${key}, ${field.name})`;
  }
}

function kotlinDefault(type: FieldType): string {
  switch (type.kind) {
    case 'scalar':
      return ` = ${KOTLIN_ZERO[type.scalar]}`;
    case 'structList':
    case 'list':
      return ' = emptyList()';
    case 'enum':
      return '';
  }
}

function kotlinEvent(model: EventModel): string {
  const params = model.fields
    .map(
      (f) => `    val ${f.name}: ${kotlinType(f.type)}${kotlinDefault(f.type)},`
    )
    .join('\n');
  const writes = model.fields
    .map((f) => `            ${kotlinWrite(f)}`)
    .join('\n');
  return [
    `/** The \`${model.registrationName}\` event. */`,
    `internal data class ${model.name}(`,
    params,
    ') : ContractEvent {',
    `    override val eventName: String get() = EVENT_NAME`,
    '',
    '    override fun toWritableMap(): WritableMap =',
    '        Arguments.createMap().apply {',
    writes,
    '        }',
    '',
    '    companion object {',
    `        const val EVENT_NAME = "${model.eventName}"`,
    `        const val REGISTRATION_NAME = "${model.registrationName}"`,
    '    }',
    '}',
  ].join('\n');
}

function kotlin(contract: Contract): string {
  const registrations = contract.events
    .map(
      (e) =>
        `        ${e.name}.EVENT_NAME to mapOf("registrationName" to ${e.name}.REGISTRATION_NAME),`
    )
    .join('\n');
  return [
    ...HEADER.map((line) => `// ${line}`),
    'package com.remotecompose.contract',
    '',
    'import com.facebook.react.bridge.Arguments',
    'import com.facebook.react.bridge.ReadableArray',
    'import com.facebook.react.bridge.ReadableMap',
    'import com.facebook.react.bridge.WritableMap',
    '',
    ...contract.enums.flatMap((e) => [kotlinEnum(e), '']),
    ...contract.propStructs.flatMap((s) => [kotlinPropStruct(s), '']),
    '/** An event the view sends to JS. */',
    'internal sealed interface ContractEvent {',
    '    /** The `top*` name the view manager registers. */',
    '    val eventName: String',
    '',
    '    fun toWritableMap(): WritableMap',
    '}',
    '',
    ...contract.events.flatMap((e) => [kotlinEvent(e), '']),
    '/** For `ViewManager.getExportedCustomDirectEventTypeConstants`. */',
    'internal val DIRECT_EVENT_TYPES: Map<String, Any> =',
    '    mapOf(',
    registrations,
    '    )',
    '',
  ].join('\n');
}

// endregion

// region Swift

const SWIFT_TYPE: Record<Scalar, string> = {
  string: 'String',
  boolean: 'Bool',
  int: 'Int32',
  double: 'Double',
  float: 'Float',
};
const SWIFT_ZERO: Record<Scalar, string> = {
  string: '""',
  boolean: 'false',
  int: '0',
  double: '0',
  float: '0',
};

function swiftType(type: FieldType): string {
  switch (type.kind) {
    case 'scalar':
      return SWIFT_TYPE[type.scalar];
    case 'list':
      return `[${SWIFT_TYPE[type.scalar]}]`;
    case 'structList':
      return `[${SWIFT_PREFIX}${type.model.name}]`;
    case 'enum':
      return SWIFT_PREFIX + type.model.name;
  }
}

function swiftDefault(type: FieldType): string {
  switch (type.kind) {
    case 'scalar':
      return ` = ${SWIFT_ZERO[type.scalar]}`;
    case 'structList':
    case 'list':
      return ' = []';
    case 'enum':
      return '';
  }
}

function swiftEnum(model: EnumModel): string {
  const name = SWIFT_PREFIX + model.name;
  const lines = [
    `/// \`${model.key}\` values.`,
    `@objc(${name})`,
    `public enum ${name}: Int {`,
    ...model.values.map((value) => `  case ${value}`),
  ];
  if (model.direction === 'toNative') {
    lines.push(
      '',
      "  /// The spec's default.",
      `  public static let defaultValue = ${name}.${model.default}`
    );
  }
  lines.push(
    '',
    '  /// The value as the spec spells it.',
    '  public var wireValue: String {',
    '    switch self {',
    ...model.values.map((value) => `    case .${value}: "${value}"`),
    '    }',
    '  }',
    '}'
  );
  return lines.join('\n');
}

function swiftClass(
  model: StructModel,
  doc: string,
  withDefaults: boolean
): string {
  const name = SWIFT_PREFIX + model.name;
  const params = model.fields
    .map(
      (f) =>
        `${f.name}: ${swiftType(f.type)}${withDefaults ? swiftDefault(f.type) : ''}`
    )
    .join(', ');
  return [
    `/// ${doc}`,
    `@objc(${name})`,
    `public final class ${name}: NSObject {`,
    ...model.fields.map(
      (f) => `  @objc public let ${f.name}: ${swiftType(f.type)}`
    ),
    '',
    `  @objc public init(${params}) {`,
    ...model.fields.map((f) => `    self.${f.name} = ${f.name}`),
    '  }',
    '}',
  ].join('\n');
}

function swift(contract: Contract): string {
  return [
    ...HEADER.map((line) => `// ${line}`),
    'import Foundation',
    '',
    ...contract.enums.flatMap((e) => [swiftEnum(e), '']),
    ...contract.propStructs.flatMap((s) => [
      swiftClass(s, `One element of the \`${s.key}\` prop.`, false),
      '',
    ]),
    swiftClass(contract.props, "All of the view's props, as one value.", false),
    '',
    ...contract.events.flatMap((e) => [
      swiftClass(e, `The \`${e.registrationName}\` event.`, true),
      '',
    ]),
  ]
    .join('\n')
    .replace(/\n+$/, '\n');
}

// endregion

// region Objective-C++

const CPP_FROM_OBJC: Record<Scalar, (v: string) => string> = {
  string: (v) => `std::string(${v}.UTF8String ?: "")`,
  boolean: (v) => `static_cast<bool>(${v})`,
  int: (v) => v,
  double: (v) => v,
  float: (v) => v,
};
const OBJC_FROM_NSNUMBER: Record<Scalar, string> = {
  string: '',
  boolean: 'boolValue',
  int: 'intValue',
  double: 'doubleValue',
  float: 'floatValue',
};

function cppEnumConversions(model: EnumModel): string {
  const swiftName = SWIFT_PREFIX + model.name;
  const cases = (from: (v: string) => string, to: (v: string) => string) =>
    model.values
      .map((v) => `    case ${from(v)}:\n      return ${to(v)};`)
      .join('\n');
  const objcCase = (v: string) => `${swiftName}${capitalize(v)}`;
  if (model.cpp === null) {
    // Travels as a std::string: match the spelling, else the spec's default.
    return [
      `inline ${swiftName} to${swiftName}(const std::string &value) {`,
      ...model.values.map(
        (v) => `  if (value == "${v}") {\n    return ${objcCase(v)};\n  }`
      ),
      `  return ${objcCase(model.direction === 'toNative' ? model.default : model.values[0]!)};`,
      '}',
    ].join('\n');
  }
  const cppCase = (v: string) => `${model.cpp}::${capitalize(v)}`;
  // Prop enums travel C++ → Swift; event enums Swift → C++.
  return model.direction === 'toNative'
    ? [
        `inline ${swiftName} toObjC(${model.cpp} value) {`,
        '  switch (value) {',
        cases(cppCase, objcCase),
        '  }',
        '}',
      ].join('\n')
    : [
        `inline ${model.cpp} toCpp(${swiftName} value) {`,
        '  switch (value) {',
        cases(objcCase, cppCase),
        '  }',
        '}',
      ].join('\n');
}

/** `[[<Swift class> alloc] initWith…]` from the C++ struct named [source]. */
function objcInit(model: StructModel, source: string): string {
  const args = model.fields.map((f, i) => {
    const v = `${source}.${f.name}`;
    let value: string;
    switch (f.type.kind) {
      case 'enum':
        value =
          f.type.model.cpp === null
            ? `to${SWIFT_PREFIX}${f.type.model.name}(${v})`
            : `toObjC(${v})`;
        break;
      case 'structList':
        value = `toObjC(${v})`;
        break;
      case 'list':
        if (f.type.scalar !== 'string') {
          throw new Error(
            `${f.name}: only string lists are supported in props`
          );
        }
        value = `toNSStrings(${v})`;
        break;
      case 'scalar':
        value = f.type.scalar === 'string' ? `toNSString(${v})` : v;
        break;
    }
    return `${i === 0 ? '' : f.name}:${value}`;
  });
  const first = capitalize(model.fields[0]!.name);
  return `[[${SWIFT_PREFIX}${model.name} alloc] initWith${first}${args.join('\n      ')}]`;
}

function cppPropStruct(model: StructModel): string {
  const swiftName = SWIFT_PREFIX + model.name;
  return [
    `inline NSArray<${swiftName} *> *toObjC(const std::vector<${model.cpp}> &items) {`,
    `  NSMutableArray<${swiftName} *> *result = [NSMutableArray arrayWithCapacity:items.size()];`,
    '  for (const auto &item : items) {',
    `    [result addObject:${objcInit(model, 'item')}];`,
    '  }',
    '  return result;',
    '}',
  ].join('\n');
}

function cppProps(model: StructModel): string {
  return [
    `inline ${SWIFT_PREFIX}${model.name} *toObjC(const ${model.cpp} &props) {`,
    `  return ${objcInit(model, 'props')};`,
    '}',
  ].join('\n');
}

function cppEvent(model: EventModel): string {
  const swiftName = SWIFT_PREFIX + model.name;
  const prelude: string[] = [];
  const fields = model.fields.map((f) => {
    const v = `event.${f.name}`;
    switch (f.type.kind) {
      case 'structList':
        throw new Error(`${f.name}: object lists are props, never events`);
      case 'enum':
        return `      .${f.name} = toCpp(${v}),`;
      case 'scalar':
        return `      .${f.name} = ${CPP_FROM_OBJC[f.type.scalar](v)},`;
      case 'list': {
        const scalar = f.type.scalar;
        const cppItem =
          scalar === 'string'
            ? 'std::string'
            : scalar === 'boolean'
              ? 'bool'
              : scalar;
        const objcItem = scalar === 'string' ? 'NSString' : 'NSNumber';
        const item =
          scalar === 'string'
            ? CPP_FROM_OBJC.string('item')
            : `item.${OBJC_FROM_NSNUMBER[scalar]}`;
        prelude.push(
          `  std::vector<${cppItem}> ${f.name};`,
          `  ${f.name}.reserve(${v}.count);`,
          `  for (${objcItem} *item in ${v}) {`,
          `    ${f.name}.push_back(${item});`,
          '  }'
        );
        return `      .${f.name} = std::move(${f.name}),`;
      }
    }
  });
  return [
    `inline ${model.cpp} toCpp(${swiftName} *event) {`,
    ...prelude,
    '  return {',
    ...fields,
    '  };',
    '}',
  ].join('\n');
}

function objcpp(contract: Contract): string {
  return [
    ...HEADER.map((line) => `// ${line}`),
    '//',
    '// Conversions between the C++ types React Native Codegen generates and the Swift types in',
    '// RemoteComposeContract.swift. Enum switches list every case and the pod compiles with',
    '// -Werror=switch, so a value added to the spec fails the build until it is handled.',
    '#pragma once',
    '',
    '#import <react/renderer/components/RemoteComposeViewSpec/EventEmitters.h>',
    '#import <react/renderer/components/RemoteComposeViewSpec/Props.h>',
    '',
    '#if __has_include(<RemoteCompose/RemoteCompose-Swift.h>)',
    '#import <RemoteCompose/RemoteCompose-Swift.h>',
    '#else',
    '#import "RemoteCompose-Swift.h"',
    '#endif',
    '',
    'namespace remotecompose::contract {',
    '',
    'using namespace facebook::react;',
    '',
    'inline NSString *toNSString(const std::string &value) {',
    '  return [[NSString alloc] initWithBytes:value.data() length:value.size() encoding:NSUTF8StringEncoding] ?: @"";',
    '}',
    '',
    'inline NSArray<NSString *> *toNSStrings(const std::vector<std::string> &values) {',
    '  NSMutableArray<NSString *> *result = [NSMutableArray arrayWithCapacity:values.size()];',
    '  for (const auto &value : values) {',
    '    [result addObject:toNSString(value)];',
    '  }',
    '  return result;',
    '}',
    '',
    ...contract.enums.flatMap((e) => [cppEnumConversions(e), '']),
    ...contract.propStructs.flatMap((s) => [cppPropStruct(s), '']),
    cppProps(contract.props),
    '',
    ...contract.events.flatMap((e) => [cppEvent(e), '']),
    '} // namespace remotecompose::contract',
    '',
  ].join('\n');
}

// endregion

/** The generated files for a Codegen spec, as [path, contents] pairs. */
export function generate(specPath: string = SPEC): [string, string][] {
  const schema = new TypeScriptParser().parseFile(specPath);
  const components = Object.values(schema.modules).flatMap((module) =>
    module.type === 'Component' ? Object.entries(module.components) : []
  );
  const [only, ...others] = components;
  if (!only || others.length > 0) {
    throw new Error(
      `Expected one component in ${repoPath(specPath)}, found ${components.length}`
    );
  }
  const contract = buildContract(only[0], only[1], specPath);
  return [
    [KOTLIN, kotlin(contract)],
    [SWIFT, swift(contract)],
    [CPP, objcpp(contract)],
  ];
}

/**
 * Whether a committed file differs from what the generator writes. Line endings are ignored: a
 * Windows checkout may have converted them to CRLF.
 */
export function isStale(
  committed: string | undefined,
  generated: string
): boolean {
  return (
    committed === undefined || committed.replace(/\r\n/g, '\n') !== generated
  );
}

if (import.meta.main) {
  const outputs = generate();
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([path, text]) =>
      isStale(existsSync(path) ? readFileSync(path, 'utf8') : undefined, text)
    );
    if (stale.length > 0) {
      console.error(
        `The native contract is out of date with ${repoPath(SPEC)}:\n` +
          stale.map(([path]) => `  ${repoPath(path)}`).join('\n') +
          '\nRun `yarn contract` and commit the result.'
      );
      process.exit(1);
    }
    console.log('native contract: up to date');
  } else {
    for (const [path, text] of outputs) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      console.log(`wrote ${repoPath(path)}`);
    }
  }
}

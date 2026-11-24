import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// Every @typescript-eslint/* rule, @react-native's and strictTypeChecked's, runs from one plugin
// instance: typescript-eslint's, pinned in package.json. @react-native's config registers its own
// (wrapped) copy, and ESLint refuses two plugins under one name, so that copy is removed here.
// Tradeoff: @react-native/eslint-config's @typescript-eslint/* settings now run against our pinned
// plugin, not the one it was written for. A typescript-eslint bump that removes or renames a rule
// it enables still breaks lint ("Could not find rule"); turn that rule off here or bump both.
const withoutTsPlugin = ({ plugins, ...config }) => {
  if (!plugins?.['@typescript-eslint']) {
    return plugins ? { ...config, plugins } : config;
  }
  const { '@typescript-eslint': _, ...rest } = plugins;
  return { ...config, plugins: rest };
};

export default defineConfig([
  {
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')).map(
      withoutTsPlugin
    ),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // Type-aware rules for TypeScript. Findings that predate them are recorded in
    // eslint-suppressions.json (ESLint bulk suppressions), so only new code has to pass.
    files: ['**/*.{ts,tsx}'],
    extends: tseslint.configs.strictTypeChecked.map(withoutTsPlugin),
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          // node:test's test() returns a promise that only reports completion: it is fulfilled
          // when the test ends, failed or not, and the runner tracks the test itself.
          allowForKnownSafeCalls: [
            {
              from: 'package',
              name: ['test', 'it', 'describe', 'suite'],
              package: 'node:test',
            },
          ],
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          // strictTypeChecked's options with numbers allowed, as in recommendedTypeChecked: a
          // number has one string form, while booleans, null, arrays and objects stay errors.
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
    },
  },
  {
    ignores: [
      '**/node_modules/',
      'lib/',
      '**/build/',
      'tools/',
      'example/ios/',
      'example/android/',
      'example-expo/ios/',
      'example-expo/android/',
      'example-expo/.expo/',
    ],
  },
]);

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
// (wrapped) copy, and ESLint refuses two plugins under one name, so that copy is removed here. A
// typescript-eslint bump then never meets an older plugin ("Could not find rule").
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

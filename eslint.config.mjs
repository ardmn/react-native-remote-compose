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

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // Type-aware rules for TypeScript. Findings that predate them are recorded in
    // eslint-suppressions.json (ESLint bulk suppressions), so only new code has to pass.
    // The @typescript-eslint plugin is already registered (wrapped) by @react-native's config
    // above; registering typescript-eslint's own copy too is an ESLint error, so it is dropped.
    files: ['**/*.{ts,tsx}'],
    extends: tseslint.configs.strictTypeChecked.map(({ plugins: _, ...config }) => config),
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

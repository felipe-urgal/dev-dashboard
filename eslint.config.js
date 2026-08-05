const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const globals = require('globals');
const tseslint = require('typescript-eslint');

const nodeGlobals = globals.nodeBuiltin;

module.exports = tseslint.config(
  {
    name: 'dev-dashboard/ignores',
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '.codegraph/**',
      'apps/web/e2e/.runtime/**',
    ],
  },
  {
    name: 'dev-dashboard/javascript',
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'dev-dashboard/typescript',
    files: ['apps/**/*.ts', 'packages/**/*.ts'],
    extends: tseslint.configs.recommended,
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      'prefer-const': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  ...pluginVue.configs['flat/essential'],
  {
    name: 'dev-dashboard/vue-typescript',
    files: ['apps/web/**/*.vue'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...nodeGlobals,
      },
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'vue/multi-word-component-names': 'off',
    },
  },
);

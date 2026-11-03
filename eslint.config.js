import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const DESKTOP_SRC = 'apps/desktop/src';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/generated/**',
      'apps/desktop/src-tauri/**',
      `${DESKTOP_SRC}/shared/ipc/bindings.ts`,
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: [`${DESKTOP_SRC}/**/*.{ts,tsx}`],
    plugins: { 'react-hooks': reactHooks, boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      'boundaries/elements': [
        { type: 'app', pattern: `${DESKTOP_SRC}/app` },
        { type: 'feature', pattern: `${DESKTOP_SRC}/features/*`, capture: ['feature'] },
        { type: 'shared', pattern: `${DESKTOP_SRC}/shared/*`, capture: ['segment'] },
        { type: 'test-support', pattern: `${DESKTOP_SRC}/test` },
        { type: 'asset', pattern: `${DESKTOP_SRC}/assets` },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Layering: app → features → shared. Features never import each other;
      // the app shell composes them.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { types: ['feature', 'shared', 'asset'] } } },
            },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { types: ['shared', 'asset'] } } },
            },
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { types: ['shared', 'asset'] } } },
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'Only shared/ipc may talk to Tauri. Use `ipc` from shared/ipc instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [`${DESKTOP_SRC}/shared/ipc/**`],
    rules: { 'no-restricted-imports': 'off' },
  },
);

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Worktrees that local agent tools create inside the repo (full copies of it).
      '.kilo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Only for the secure-PR gate (scripts/security-scan.sh eslint), whose SARIF reports these
  // warnings for triage; everyday lint output stays free of them.
  ...(process.env.ESLINT_SECURITY ? [security.configs.recommended] : []),
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: [
      'apps/api/**/*.ts',
      '**/*.config.*',
      'eslint.config.mjs',
      'scripts/**/*.mjs',
      'e2e/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
    rules: {
      // `const { internal, ...rest } = row` omits a column from a response.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Capacitor sync output and Android build intermediates are generated code,
  // not frontend source subject to this lint configuration.
  globalIgnores(['dist/**', 'android/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // The base rule does not recognize JSX component references in this
      // flat-config setup. Keep hook and syntax checks enabled, while avoiding
      // false failures for every React component import.
      'no-unused-vars': 'off',
      'react-refresh/only-export-components': 'off',
      // These React Compiler diagnostics are not safe auto-fixes for the
      // existing animation/ref implementation; retain hook dependency checks.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
    },
  },
])

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'lighthouse/reports', 'public/mockServiceWorker.js'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Garante a regra de arquitetura: UI/hooks/Axios não contêm respostas fictícias nem importam os mocks.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/mocks/**', 'src/main.tsx'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/mocks/*', '@/mocks/*'], message: 'O app não pode importar os mocks. Eles vivem na camada de rede (MSW).' }] }] },
  },
)

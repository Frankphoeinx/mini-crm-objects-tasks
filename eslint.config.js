import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Границы слоёв: общий слой не знает о фичах, фича не лезет внутрь другой и в каркас.
const restrict = (group, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

export default defineConfig([
  globalIgnores(['dist', 'prototypes', 'supabase', 'scripts', '.claude', '.impeccable', '.vercel']),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['src/shared/**'],
    rules: restrict(['@/features/*', '@/app/*'], 'shared не зависит от фич и каркаса.'),
  },
  {
    files: ['src/features/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(
      ['@/features/*', '@/app/*', '@/shared/*/*', '../*'],
      'Фича берёт общее из @/shared/ui, @/shared/api, @/shared/lib и не импортирует другие фичи: их собирает src/app.',
    ),
  },
]);

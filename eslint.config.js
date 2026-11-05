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
  // Порядок снизу вверх: lib, ui, undo, api, entities, features, app. Слой знает только о тех, что ниже.
  {
    files: ['src/shared/lib/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(['@/features/*', '@/app/*', '@/entities/*', '@/shared/ui*', '@/shared/undo*', '@/shared/api*', '../ui*', '../undo*', '../api*'], 'lib ни от кого не зависит.'),
  },
  {
    files: ['src/shared/ui/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(['@/features/*', '@/app/*', '@/entities/*', '@/shared/undo*', '@/shared/api*', '../../undo*', '../../api*', '../undo*', '../api*'], 'ui не ходит в базу: компоненты с данными лежат в entities.'),
  },
  {
    files: ['src/shared/undo/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(['@/features/*', '@/app/*', '@/entities/*', '@/shared/api*', '../api*'], 'undo не знает о запросах: действие приходит снаружи.'),
  },
  {
    files: ['src/shared/api/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(['@/features/*', '@/app/*', '@/entities/*', '@/shared/ui*', '../ui*'], 'api не знает об интерфейсе.'),
  },
  {
    files: ['src/entities/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(['@/features/*', '@/app/*', '@/shared/*/*'], 'entities берёт общее через входы слоёв.'),
  },
  {
    files: ['src/features/**'],
    ignores: ['**/*.test.*'],
    rules: restrict(
      ['@/features/*', '@/app/*', '@/shared/*/*', '@/entities/*/*', '../*'],
      'Фича берёт общее через входы @/entities/task и @/shared/*, а другие фичи не импортирует: их собирает src/app.',
    ),
  },
]);

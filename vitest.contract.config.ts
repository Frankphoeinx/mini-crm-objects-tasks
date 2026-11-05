import { defineConfig } from 'vitest/config';

// Отдельный набор: ходит в настоящий Supabase, поэтому в обычный прогон не входит.
export default defineConfig({
  test: { include: ['tests/contract/**/*.test.ts'], environment: 'node', testTimeout: 15_000 },
});

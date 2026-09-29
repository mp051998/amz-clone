import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '.next/**', '.worktrees/**', 'test/integration/**'],
        },
      },
      {
        // Runs against a real Supabase (local stack: `npx supabase start`).
        resolve: { alias: { ...alias, 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) } },
        test: {
          name: 'db',
          environment: 'node',
          setupFiles: ['./test/integration/env.ts'],
          include: ['test/integration/**/*.test.ts'],
          // tests share one database; run files one after another
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

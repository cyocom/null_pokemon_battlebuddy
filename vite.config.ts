import { defineConfig } from 'vitest/config';

function siteBase(): string {
  const fromEnv = process.env.VITE_BASE?.trim();
  if (!fromEnv || fromEnv === '/') return '/';
  return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
}

export default defineConfig({
  base: siteBase(),
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

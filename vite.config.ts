import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path (user.github.io/<repo>/).
  base: './',
  build: { outDir: 'dist' },
  test: { include: ['src/**/*.test.ts'] },
});

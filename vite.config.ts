import { defineConfig } from 'vitest/config';

// `base` is relative so the build works both locally and on GitHub Pages
// (served from https://<user>.github.io/ultimate-atc/).
export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

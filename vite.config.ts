import { defineConfig } from 'vitest/config';

// `base` is relative so the build works both locally and on GitHub Pages
// (served from https://<user>.github.io/ultimate-atc/).
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        // The generated airport data (OSM layouts and buildings) goes into its own chunk:
        // it keeps the code chunk below the size warning and changes less often.
        codeSplitting: {
          groups: [{ name: 'airport-data', test: /src[\\/]data[\\/]airports[\\/][a-z]{4}\.(layout|buildings)\.ts$/ }],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});

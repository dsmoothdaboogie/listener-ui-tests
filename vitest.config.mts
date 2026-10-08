import { defineConfig } from 'vitest/config';

/**
 * Node-side specs: the generator and the repo check scripts. Angular specs under src/
 * run through `ng test`, which builds its own Vitest config.
 */
export default defineConfig({
  test: {
    include: ['tools/**/*.spec.ts', 'scripts/**/*.spec.mjs'],
    environment: 'node',
  },
});

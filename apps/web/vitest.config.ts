import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    globals: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      // These route shells are covered through the Playwright navigation suite.
      // Keep the unit coverage gate focused on components and composables that
      // are exercised by Vitest without duplicating the full router contract.
      exclude: ['src/views/ProjectDetailsView.vue', 'src/views/NotFoundView.vue'],
      thresholds: {
        statements: 58,
        branches: 50,
        functions: 64,
        lines: 60,
      },
    },
  },
});

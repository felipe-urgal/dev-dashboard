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
      // Cobertura é um diagnóstico explícito, não um gate percentual.
      // Superfícies validadas principalmente por integração/browser permanecem
      // fora do relatório unitário para evitar números artificiais.
      exclude: [
        'src/App.vue',
        'src/api.ts',
        'src/main.ts',
        'src/router/**',
        'src/**/*-enhancer.ts',
        'src/**/*-fix.ts',
        'src/git-*/**',
        'src/log-detail/**',
        'src/log-visual/**',
        'src/test-log-inspector/**',
        'src/views/ProjectDetailsView.vue',
        'src/views/NotFoundView.vue',
      ],
    },
  },
});

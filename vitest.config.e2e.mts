import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Pruebas de punta a punta: levantan la API completa contra una base de datos
// de pruebas (triage_e2e) que se crea vacía en cada ejecución.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globalSetup: ['test/e2e/crear-bd.ts'],
    env: { POSTGRES_DB: 'triage_e2e', UPLOADS_DIR: 'resultados/uploads-e2e' },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

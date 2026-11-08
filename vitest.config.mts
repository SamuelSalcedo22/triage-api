import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compila los decoradores de Nest/TypeORM (emitDecoratorMetadata) para Vitest
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

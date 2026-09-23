import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite()],
  test: { environment: 'node', globals: true, setupFiles: ['./test/setup.ts'], testTimeout: 15_000 },
});

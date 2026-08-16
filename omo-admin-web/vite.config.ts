import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    Components({
      dts: 'src/types/components.d.ts',
      resolvers: [ElementPlusResolver({ importStyle: 'css' })],
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
});

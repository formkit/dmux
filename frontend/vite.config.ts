import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  root: 'src',
  build: {
    outDir: '../../dist',  // Build to root dist/
    emptyOutDir: false,     // Don't empty - TypeScript also uses this dir
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard.html'),
        terminal: resolve(__dirname, 'src/terminal.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});

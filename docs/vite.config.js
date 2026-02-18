import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [tailwindcss(), cloudflare({ configPath: '../wrangler.json' })],
  server: {
    port: 3001,
    open: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev serves the site on localhost:5173
// and sends api, websocket and face library requests to the server on port 3000
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/vendor': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true }
    }
  }
});
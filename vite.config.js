import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works on GitHub Pages
  // (https://<user>.github.io/<repo>/) and any other sub-path host.
  base: './',
  server: { host: true, port: 5173, allowedHosts: true },
  preview: { host: true, port: 4173 },
});

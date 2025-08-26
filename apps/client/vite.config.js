// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',   // <-- clave
    }),
  ],
  esbuild: {
    jsx: 'automatic',           // cinturón y tirantes
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['demo.contactcenterdev.com'],
  },
  preview: {
    allowedHosts: ['demo.contactcenterdev.com'],
  },
});

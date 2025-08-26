// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // escucha en 0.0.0.0 (útil en Docker/LAN)
    port: 5173,
    allowedHosts: ['demo.contactcenterdev.com'], // habilita este Host
    // Si usas proxy HTTPS y necesitas HMR sobre WSS, descomenta:
    // hmr: { host: 'demo.contactcenterdev.com', protocol: 'wss', clientPort: 443 },
  },
  preview: {
    allowedHosts: ['demo.contactcenterdev.com'],
  },
});

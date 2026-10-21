import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 96,
    // Domain names the dev server may be reached by (Vite blocks unknown hosts).
    allowedHosts: ['smartleasing.com', 'www.smartleasing.com', '.smartleasing.com'],
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5096',
        changeOrigin: true
      }
    }
  }
});

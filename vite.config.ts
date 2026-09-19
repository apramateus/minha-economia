/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { apiDados } from './server/api.ts';

// só as pastas da raiz: "**/importar/**" também pegaria src/lib/importar e o código dele não recarregaria
const raiz = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDados()],
  server: {
    port: 5180,
    strictPort: true,
    // o iPhone entra por <nome-do-mac>.local, que não muda quando o IP muda
    allowedHosts: ['.local'],
    watch: { ignored: [`${raiz}data/**`, `${raiz}importar/**`] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

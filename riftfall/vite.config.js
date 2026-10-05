import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Versión para portales (CrazyGames): sin la configuración del token ni el service worker.
const portalCleanup = () => ({
  name: 'riftfall-portal-cleanup',
  apply: 'build',
  closeBundle() {
    for (const f of ['deployment.json', 'sw.js', 'manifest.webmanifest']) for (const dir of ['dist-portal', 'dist-portal-e2e']) fs.rmSync(path.join(dir, f), { force: true });
  }
});

// El Lanzador (lanzar.html) es una herramienta solo para el creador: despliega contratos desde su
// wallet. No se publica junto al juego, porque una página que crea contratos y mueve tokens en el
// mismo dominio hace que los escáneres de las wallets marquen el sitio como sospechoso.
// Se incluye en el build de tests (modo e2e) o pidiéndolo explícitamente con `npm run build:launcher`.
export default defineConfig(({ mode }) => {
  const withLauncher = mode === 'e2e' || process.env.RIFTFALL_LAUNCHER === '1';
  return {
    plugins: mode === 'portal' ? [portalCleanup()] : [],
    // En el portal el juego vive en una subcarpeta: rutas relativas.
    base: mode === 'portal' ? './' : '/',
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:8787' }
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        input: withLauncher ? { main: 'index.html', lanzar: 'lanzar.html' } : { main: 'index.html' }
      },
      sourcemap: true,
      chunkSizeWarningLimit: 900
    }
  };
});

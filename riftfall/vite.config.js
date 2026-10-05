import { defineConfig } from 'vite';

// El Lanzador (lanzar.html) es una herramienta solo para el creador: despliega contratos desde su
// wallet. No se publica junto al juego, porque una página que crea contratos y mueve tokens en el
// mismo dominio hace que los escáneres de las wallets marquen el sitio como sospechoso.
// Se incluye en el build de tests (modo e2e) o pidiéndolo explícitamente con `npm run build:launcher`.
export default defineConfig(({ mode }) => {
  const withLauncher = mode === 'e2e' || process.env.RIFTFALL_LAUNCHER === '1';
  return {
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

// Junta la versión para portales (dist-portal/) en un solo index.html: CrazyGames no acepta ZIP y
// subir carpetas desde el navegador falla seguido. Las fuentes van dentro como datos (solo woff2 y los
// alfabetos que usa el juego); el ícono y el manifiesto de la app no hacen falta dentro del portal.
// Uso: npm run build:crazygames → dist-crazygames/index.html
//      node scripts/inline-portal.mjs <carpeta del build> <carpeta de salida>

import fs from 'node:fs';
import path from 'node:path';

const [SRC = 'dist-portal', OUT = 'dist-crazygames'] = process.argv.slice(2);
const assets = path.join(SRC, 'assets');

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '');

const font = (file) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(assets, file)).toString('base64')})`;

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/, (_, file) => {
  let css = fs.readFileSync(path.join(assets, file), 'utf8');
  // Sin devanagari ni latin-ext: el juego solo usa español, inglés y portugués.
  css = css.replace(/@font-face\{[^}]*(devanagari|latin-ext)[^}]*\}/g, '');
  css = css.replace(/,url\(\.\/[^)]+\.woff\)format\("woff"\)/g, '');
  css = css.replace(/url\(\.\/([^)]+\.woff2)\)/g, (_m, f) => font(f));
  if (/url\(\.\//.test(css)) throw new Error('quedó una referencia a un archivo en el CSS');
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_, file) => {
  // Con una función, los $ del código no se toman como patrones de reemplazo.
  const js = fs.readFileSync(path.join(assets, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
if (/(src|href)="\.?\/?(assets|icons)\//.test(html)) throw new Error('quedó una referencia a otro archivo');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`${OUT}/index.html · ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);

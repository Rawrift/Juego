// Vercel ya no publica el juego: solo atiende riftfall.duckdns.org (el link de siempre, que apunta a
// Vercel) y reenvía todo a Cloudflare (riftgames.pages.dev), donde corre el juego con la Cuenta Rift.
// La carpeta publicada queda vacía para que todas las direcciones pasen por la regla de vercel.json.
import fs from 'node:fs';

fs.rmSync('.vercel-proxy', { recursive: true, force: true });
fs.mkdirSync('.vercel-proxy');
fs.writeFileSync('.vercel-proxy/.keep', '');
console.log('Vercel: todo se reenvía a https://riftgames.pages.dev');

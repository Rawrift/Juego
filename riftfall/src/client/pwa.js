// Instalar como app (PWA): ícono en el inicio del celular, pantalla completa y arranque sin red.

import { $, toast } from './dom.js';
import { t } from './i18n.js';

export function setupPwa() {
  // En los builds de prueba no se registra: el service worker interceptaría las respuestas simuladas.
  if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'e2e') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const btn = $('#installBtn');
  const installed = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
  if (installed) return;
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    btn.classList.remove('hidden');
  });
  // iPhone no avisa que se puede instalar: se muestra el botón con las instrucciones.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios) btn.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    if (!prompt) {
      toast(t('pwa.ios'));
      return;
    }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = null;
    if (outcome === 'accepted') btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
}

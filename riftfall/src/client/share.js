// Compartir el resultado: genera una tarjeta (imagen) con los números de la partida y la manda por
// el menú de compartir del celular (WhatsApp, Instagram…). Si el navegador no puede compartir
// archivos, comparte el texto con el link o abre WhatsApp directamente.

import { SHIPS } from '../sim/index.js';
import { drawShipPreview } from './sprites.js';
import { t } from './i18n.js';
import { fmtTime, fmtNum, toast } from './dom.js';
import { PORTAL } from './portal.js';

const W = 1080;
const H = 1350;

export function shareUrl() {
  // En los portales no se enlaza a otra versión jugable del juego (regla del portal).
  return PORTAL ? '' : `${location.origin}/`;
}

export function shareText({ summary, daily, duelUrl }) {
  const vars = { time: fmtTime(summary.timeSec), kills: fmtNum(summary.kills), score: fmtNum(summary.score), n: daily };
  if (duelUrl) return t('sh.duel', vars);
  if (daily) return t('sh.daily', vars);
  return t(summary.victory ? 'sh.textWin' : 'sh.text', vars);
}

/** Dibuja la tarjeta del resultado. */
export async function buildCard({ summary, shipKey, title }) {
  try {
    await document.fonts?.ready;
  } catch {
    /* sin API de fuentes */
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const ship = SHIPS[shipKey] ?? SHIPS.spark;
  const accent = summary.victory ? '#ffd23d' : ship.color;

  // Fondo: degradé profundo con grilla de neón.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0c22');
  bg.addColorStop(1, '#030409');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(77,232,255,0.07)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 60) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  const glow = g.createRadialGradient(W / 2, 520, 0, W / 2, 520, 520);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  // Logo.
  g.font = '900 120px Orbitron, sans-serif';
  g.shadowColor = '#4de8ff';
  g.shadowBlur = 30;
  g.fillStyle = '#ffffff';
  const logoL = g.measureText('RIFT').width;
  const logoR = g.measureText('FALL').width;
  const x0 = W / 2 - (logoL + logoR) / 2;
  g.textAlign = 'left';
  g.fillText('RIFT', x0, 190);
  g.fillStyle = '#4de8ff';
  g.fillText('FALL', x0 + logoL, 190);
  g.textAlign = 'center';
  g.shadowBlur = 0;

  // Título del resultado.
  g.font = '800 64px Orbitron, sans-serif';
  g.fillStyle = accent;
  g.shadowColor = accent;
  g.shadowBlur = 24;
  g.fillText(title, W / 2, 300);
  g.shadowBlur = 0;

  // Nave.
  const sc = document.createElement('canvas');
  sc.width = 420;
  sc.height = 420;
  drawShipPreview(sc, shipKey in SHIPS ? shipKey : 'spark', ship.color, 0.4);
  g.drawImage(sc, W / 2 - 210, 330);
  g.font = '700 34px Rajdhani, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`${t('sh.ship')} · ${ship.name}`, W / 2, 790);

  // Estadísticas.
  const stats = [
    [t('go.time'), fmtTime(summary.timeSec)],
    [t('go.kills'), fmtNum(summary.kills)],
    [t('go.combo'), `x${fmtNum(summary.bestCombo ?? 0)}`],
    [t('go.score'), fmtNum(summary.score)]
  ];
  const cw = 460;
  const ch = 150;
  stats.forEach(([label, value], i) => {
    const cx = W / 2 + (i % 2 === 0 ? -cw / 2 - 12 : cw / 2 + 12);
    const cy = 840 + Math.floor(i / 2) * (ch + 24);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.strokeStyle = i === 3 ? accent : 'rgba(77,232,255,0.35)';
    g.lineWidth = 3;
    roundRect(g, cx - cw / 2, cy, cw, ch, 22);
    g.fill();
    g.stroke();
    g.font = '700 30px Rajdhani, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText(label, cx, cy + 50);
    g.font = '800 62px Orbitron, sans-serif';
    g.fillStyle = i === 3 ? accent : '#ffffff';
    g.fillText(value, cx, cy + 122);
  });

  // Llamado a jugar.
  g.font = '700 36px Rajdhani, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(t('sh.cta'), W / 2, 1250);
  g.font = '800 40px Orbitron, sans-serif';
  g.fillStyle = '#4de8ff';
  if (!PORTAL) g.fillText(location.host, W / 2, 1305);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Comparte el resultado con la mejor opción disponible en este navegador (un duelo lleva su propio link). */
export async function shareResult(result) {
  const text = shareText(result);
  const url = result.duelUrl ?? shareUrl();
  const full = url ? `${text}\n${url}` : text;
  try {
    const card = await buildCard(result);
    const blob = await new Promise((r) => card.toBlob(r, 'image/png'));
    const file = blob && new File([blob], 'riftfall.png', { type: 'image/png' });
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: full });
      return 'files';
    }
    if (navigator.share) {
      await navigator.share(url ? { text, url } : { text });
      return 'text';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancel';
  }
  try {
    await navigator.clipboard?.writeText(full);
    toast(t('sh.copied'), 'ok');
  } catch {
    /* sin portapapeles */
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, '_blank', 'noopener');
  return 'whatsapp';
}

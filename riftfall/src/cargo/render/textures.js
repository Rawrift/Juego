// Texturas dibujadas con canvas al arrancar: no se descarga ninguna imagen. Cada una se dibuja una vez
// y se reutiliza.

import * as THREE from 'three';
import { C, CARGO_COLORS, hex } from './palette.js';
import { drawCargoIcon, drawIcon } from './icons2d.js';

const cache = new Map();
let maxAniso = 4;
export const setMaxAnisotropy = (n) => { maxAniso = n; };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Lateral de un contenedor: chapa acanalada del color de la carga, marco y el ícono en blanco. */
export function containerTexture(cargo) {
  return once(`container:${cargo}`, () => {
    const [c, g] = canvas(256, 256);
    const base = hex(CARGO_COLORS[cargo]);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // Acanalado vertical: franjas de luz y sombra suaves.
    for (let x = 10; x < 246; x += 14) {
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x, 14, 5, 228);
      g.fillStyle = 'rgba(5,6,30,0.22)';
      g.fillRect(x + 6, 14, 4, 228);
    }
    // Marco (las esquinas reforzadas del contenedor).
    g.strokeStyle = 'rgba(5,6,30,0.5)';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 244, 244);
    // Placa blanca con el ícono, dibujada angosta: la cara larga la estira 1,5 veces.
    g.save();
    g.translate(128, 128);
    g.scale(1 / 1.5, 1);
    g.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(g, -52, -52, 104, 104, 22);
    g.fill();
    g.fillStyle = base;
    g.strokeStyle = base;
    drawCargoIcon(g, cargo, 0, 0, 70);
    g.restore();
    return toTexture(c);
  });
}

/** Chapa acanalada blanca de las paredes del depósito. */
export function wallTexture() {
  return once('wall', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = hex(C.wall);
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(10,12,40,0.0)');
      grd.addColorStop(0.45, 'rgba(10,12,40,0.35)');
      grd.addColorStop(0.55, 'rgba(140,170,255,0.22)');
      grd.addColorStop(1, 'rgba(10,12,40,0.0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 16, 256);
    }
    const t = toTexture(c, { repeat: true });
    return t;
  });
}

/** Celdas de un panel solar. */
export function solarTexture() {
  return once('solar', () => {
    const [c, g] = canvas(256, 512);
    const grd = g.createLinearGradient(0, 0, 256, 512);
    grd.addColorStop(0, '#2a2f86');
    grd.addColorStop(1, '#161a55');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 512);
    g.strokeStyle = 'rgba(77,232,255,0.55)';
    g.lineWidth = 3;
    for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    for (let y = 0; y <= 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.strokeStyle = 'rgba(157,107,255,0.22)';
    g.lineWidth = 1;
    for (let x = 16; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    g.strokeStyle = '#8f9ac8';
    g.lineWidth = 10;
    g.strokeRect(0, 0, 256, 512);
    return toTexture(c);
  });
}

/** Textura de un cartel: texto en una placa redondeada. */
export function signTexture(text, { bg = '#4de8ff', fg = '#06081a', w = 256, h = 128, font = 800, size = 64, radius = 28 } = {}) {
  return once(`sign:${text}:${bg}:${fg}:${w}x${h}`, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg;
    roundRect(g, 0, 0, w, h, radius);
    g.fill();
    g.fillStyle = fg;
    g.font = `${font} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + size * 0.04);
    return toTexture(c);
  });
}

/** Logo de la empresa: cubo isométrico azul y "RIFT CARGO". */
export function logoTexture({ dark = false } = {}) {
  return once(`logo:${dark}`, () => {
    const [c, g] = canvas(1024, 256);
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(8,10,30,0.92)';
    roundRect(g, 4, 20, 1016, 216, 60);
    g.fill();
    g.strokeStyle = 'rgba(77,232,255,0.85)';
    g.lineWidth = 6;
    roundRect(g, 7, 23, 1010, 210, 57);
    g.stroke();
    drawLogoCube(g, 132, 128, 76);
    g.fillStyle = '#e9f3ff';
    g.font = '800 104px "Plus Jakarta Sans", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('RIFT CARGO', 236, 134, 760);
    return toTexture(c);
  });
}

export function drawLogoCube(g, cx, cy, s) {
  const h = s * 0.5;
  const top = [[cx, cy - s], [cx + s * 0.87, cy - h], [cx, cy], [cx - s * 0.87, cy - h]];
  const left = [[cx - s * 0.87, cy - h], [cx, cy], [cx, cy + s], [cx - s * 0.87, cy + h]];
  const right = [[cx + s * 0.87, cy - h], [cx, cy], [cx, cy + s], [cx + s * 0.87, cy + h]];
  const poly = (pts, fill) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  poly(top, '#4de8ff');
  poly(left, '#9d6bff');
  poly(right, '#ff4dd2');
  // La "grieta" del logo: una franja clara en diagonal.
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = s * 0.09;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.3, cy + s * 0.55);
  g.lineTo(cx - s * 0.05, cy + s * 0.15);
  g.lineTo(cx + s * 0.3, cy + s * 0.42);
  g.stroke();
}

/**
 * Piso de la estación: baldosas suaves, sendas con líneas amarillas y los boxes de estacionamiento.
 * `paint(g, toPx)` dibuja encima lo que depende del plano (lo pasa station.js).
 */
export function deckTexture(width, depth, paint) {
  const ppu = 40;
  const [c, g] = canvas(Math.round(width * ppu), Math.round(depth * ppu));
  g.fillStyle = hex(C.deck);
  g.fillRect(0, 0, c.width, c.height);
  // Baldosas de 2 m con una junta finita y un leve cambio de tono.
  for (let x = 0; x < width; x += 2) {
    for (let z = 0; z < depth; z += 2) {
      const n = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      g.fillStyle = `rgba(120,150,255,${0.012 + Math.abs(n) * 0.03})`;
      g.fillRect(x * ppu, z * ppu, 2 * ppu, 2 * ppu);
    }
  }
  g.strokeStyle = 'rgba(110,140,255,0.16)';
  g.lineWidth = 1.5;
  for (let x = 0; x <= width; x += 2) { g.beginPath(); g.moveTo(x * ppu, 0); g.lineTo(x * ppu, c.height); g.stroke(); }
  for (let z = 0; z <= depth; z += 2) { g.beginPath(); g.moveTo(0, z * ppu); g.lineTo(c.width, z * ppu); g.stroke(); }
  // Coordenadas del mundo (x, z) con el centro del piso en 0,0 → píxeles.
  const toPx = (x, z) => [(x + width / 2) * ppu, (z + depth / 2) * ppu];
  paint(g, toPx, ppu);
  return toTexture(c);
}

/** Plataforma de aterrizaje (muelle): borde con franjas de peligro, número y guías. */
export function padTexture(label, { locked = false } = {}) {
  return once(`pad:${label}:${locked}`, () => {
    const w = 256;
    const h = 512;
    const [c, g] = canvas(w, h);
    if (locked) {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(77,232,255,0.45)';
      g.setLineDash([22, 16]);
      g.lineWidth = 8;
      roundRect(g, 8, 8, w - 16, h - 16, 26);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(77,232,255,0.05)';
      roundRect(g, 8, 8, w - 16, h - 16, 26);
      g.fill();
      return toTexture(c);
    }
    g.fillStyle = '#222a5c';
    roundRect(g, 0, 0, w, h, 30);
    g.fill();
    g.fillStyle = '#181e46';
    roundRect(g, 14, 14, w - 28, h - 28, 22);
    g.fill();
    // Franjas amarillas y azul oscuro en la cabecera (el lado del portón).
    g.save();
    roundRect(g, 14, 14, w - 28, 44, 12);
    g.clip();
    for (let x = -60; x < w + 60; x += 32) {
      g.fillStyle = '#ffc94d';
      g.beginPath();
      g.moveTo(x, 14); g.lineTo(x + 16, 14); g.lineTo(x + 16 - 44, 58); g.lineTo(x - 44, 58);
      g.closePath();
      g.fill();
    }
    g.restore();
    // Guía central punteada.
    g.strokeStyle = '#ff4dd2';
    g.lineWidth = 6;
    g.setLineDash([26, 20]);
    g.beginPath(); g.moveTo(w / 2, 80); g.lineTo(w / 2, h - 30); g.stroke();
    g.setLineDash([]);
    // Esquineros blancos.
    g.strokeStyle = '#4de8ff';
    g.lineWidth = 7;
    const corner = (x, y, dx, dy) => { g.beginPath(); g.moveTo(x + dx * 34, y); g.lineTo(x, y); g.lineTo(x, y + dy * 34); g.stroke(); };
    corner(34, 86, 1, 1); corner(w - 34, 86, -1, 1); corner(34, h - 34, 1, -1); corner(w - 34, h - 34, -1, -1);
    // Número del muelle.
    g.fillStyle = 'rgba(77,232,255,0.9)';
    g.font = '800 74px "Plus Jakarta Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h - 110);
    return toTexture(c);
  });
}

/** Lugar del hangar: contorno amarillo con su número, o punteado si todavía no se compró. */
export function parkTexture(label, locked) {
  return once(`park:${label}:${locked}`, () => {
    const w = 256;
    const h = 490;
    const [c, g] = canvas(w, h);
    g.clearRect(0, 0, w, h);
    if (locked) {
      g.strokeStyle = 'rgba(120,150,255,0.35)';
      g.setLineDash([20, 16]);
      g.lineWidth = 6;
      roundRect(g, 8, 8, w - 16, h - 16, 22);
      g.stroke();
      g.setLineDash([]);
      return toTexture(c);
    }
    g.fillStyle = 'rgba(77,232,255,0.05)';
    roundRect(g, 8, 8, w - 16, h - 16, 22);
    g.fill();
    g.strokeStyle = '#4de8ff';
    g.lineWidth = 9;
    roundRect(g, 8, 8, w - 16, h - 16, 22);
    g.stroke();
    g.fillStyle = 'rgba(77,232,255,0.95)';
    g.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h - 60);
    return toTexture(c);
  });
}

/** Contorno punteado de algo que se puede construir. */
export function ghostTexture() {
  return once('ghost', () => {
    const [c, g] = canvas(384, 205);
    g.strokeStyle = 'rgba(157,107,255,0.55)';
    g.setLineDash([18, 12]);
    g.lineWidth = 6;
    roundRect(g, 6, 6, 372, 193, 18);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(157,107,255,0.06)';
    roundRect(g, 6, 6, 372, 193, 18);
    g.fill();
    g.strokeStyle = 'rgba(157,107,255,0.7)';
    drawIcon(g, 'plus', 192, 102, 56, 2.2);
    return toTexture(c);
  });
}

/** Franjas de obra (blanco y naranja). */
export function stripeTexture() {
  return once('stripe', () => {
    const [c, g] = canvas(256, 32);
    g.fillStyle = '#141836';
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#ffc94d';
    for (let x = -32; x < 288; x += 40) {
      g.beginPath();
      g.moveTo(x, 32); g.lineTo(x + 20, 32); g.lineTo(x + 40, 0); g.lineTo(x + 20, 0);
      g.closePath();
      g.fill();
    }
    return toTexture(c);
  });
}

/** Piso de carga de una nave: un lugar marcado por contenedor, con trabas amarillas en las esquinas. */
export function bedTexture(cols, rows) {
  return once(`bed:${cols}x${rows}`, () => {
    const cw = 92;
    const rh = 134;
    const W = cols * cw + 30;
    const H = rows * rh + 24;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#2a3164';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = 15 + k * cw + 6;
        const y = 12 + r * rh + 6;
        g.fillStyle = '#1b2148';
        roundRect(g, x, y, cw - 12, rh - 12, 10);
        g.fill();
        g.strokeStyle = 'rgba(77,232,255,0.45)';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#ffc94d';
        for (const [dx, dy] of [[8, 8], [cw - 20, 8], [8, rh - 20], [cw - 20, rh - 20]]) g.fillRect(x + dx - 4, y + dy - 4, 12, 12);
      }
    }
    return toTexture(c);
  });
}

/** Ruido de valor 2D con repetición, para nubes y planetas. */
export function valueNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256).map(() => rnd());
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y, period = 256) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const h = (a, b) => grad[perm[(((a % period) + period) % period & 255) + perm[(((b % period) + period) % period) & 255]]];
    const u = fade(xf);
    const v = fade(yf);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

// Renderizador Canvas2D: fondo en parallax, entidades interpoladas entre ticks y efectos.
// Todo lo visual es cosmético (puede usar Math.random): no afecta a la simulación.

import { SHIPS, weaponStats } from '../sim/index.js';
import {
  glow,
  rgba,
  enemySprite,
  pickupSprite,
  gemTier,
  bladeSprite,
  missileSprite,
  enemyBulletSprite,
  textSprite,
  drawShipFast
} from './sprites.js';
import { t } from './i18n.js';

const MAX_PARTICLES = 1400;

/**
 * Niveles de calidad (0 = máxima). Bajar de nivel reduce la resolución interna del canvas (lo que
 * más pesa en celulares: cada capa de fondo y cada brillo se pinta píxel por píxel) y la cantidad
 * de partículas y textos. main.js elige el nivel solo según cómo rinde el equipo.
 */
export const QUALITY_LEVELS = [
  { dpr: 2, parts: 1, texts: 48, stars: 2 },
  { dpr: 1.6, parts: 0.7, texts: 36, stars: 2 },
  { dpr: 1.3, parts: 0.45, texts: 26, stars: 1 },
  { dpr: 1, parts: 0.3, texts: 18, stars: 1 }
];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const R = {
    w: 0, h: 0, dpr: 1, scale: 1,
    camX: 0, camY: 0, shake: 0, shakeX: 0, shakeY: 0, time: 0, flash: 0,
    particles: [], texts: [], fx: [], level: 0, Q: QUALITY_LEVELS[0],
    // transformación del mundo (para dibujar sin save/restore) y nave en pantalla (para el mouse)
    k: 1, ox: 0, oy: 0, shipSX: 0, shipSY: 0,
    textsThisFrame: 0,
    groups: new Map()
  };
  let bg = null;
  let nebula = null;
  let stars = [];
  let hexPattern = null;

  // ---------------------------------------------------------------- capas de fondo

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = Math.max(1, Math.floor(R.w * R.dpr / 2));
    bg.height = Math.max(1, Math.floor(R.h * R.dpr / 2));
    const g = bg.getContext('2d');
    const grad = g.createRadialGradient(bg.width * 0.5, bg.height * 0.45, 0, bg.width * 0.5, bg.height * 0.5, Math.max(bg.width, bg.height) * 0.75);
    grad.addColorStop(0, '#111735');
    grad.addColorStop(0.5, '#0a0b22');
    grad.addColorStop(1, '#04040c');
    g.fillStyle = grad;
    g.fillRect(0, 0, bg.width, bg.height);
  }

  function buildNebula() {
    const size = 1024;
    nebula = document.createElement('canvas');
    nebula.width = nebula.height = size;
    const g = nebula.getContext('2d');
    const blobs = [
      ['#3b1d7a', 0.32], ['#7a1d6b', 0.22], ['#123a7a', 0.3], ['#0f5a6e', 0.2], ['#5a1d7a', 0.25], ['#1d2f7a', 0.28]
    ];
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const [c, a] = blobs[i % blobs.length];
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 120 + Math.random() * 260;
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          grad.addColorStop(0, rgba(c, a * 0.55));
          grad.addColorStop(1, rgba(c, 0));
          g.fillStyle = grad;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
  }

  // Tres capas de estrellas; la más lejana se pinta dentro de la nebulosa (que se mueve casi
  // igual), así el fondo cuesta una pasada de pantalla completa menos por cuadro.
  function buildStars() {
    stars = [0.04, 0.12, 0.28].map((par, layer) => {
      const size = 512;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const n = [140, 70, 30][layer];
      for (let i = 0; i < n; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = [0.6, 1, 1.5][layer] * (0.6 + Math.random() * 0.8);
        const tint = ['#ffffff', '#bfe9ff', '#ffd6f5', '#d6dcff'][Math.floor(Math.random() * 4)];
        g.fillStyle = tint;
        g.globalAlpha = 0.4 + Math.random() * 0.6;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        if (layer === 2 && Math.random() < 0.4) {
          g.globalAlpha = 0.25;
          g.fillRect(x - r * 4, y - 0.5, r * 8, 1);
          g.fillRect(x - 0.5, y - r * 4, 1, r * 8);
        }
      }
      return { img: c, par };
    });
    const far = stars.shift();
    const g = nebula.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    for (let x = 0; x < nebula.width; x += far.img.width) for (let y = 0; y < nebula.height; y += far.img.height) g.drawImage(far.img, x, y);
  }

  function buildHex() {
    const s = 46;
    const w = Math.sqrt(3) * s;
    const h = 3 * s;
    const c = document.createElement('canvas');
    c.width = Math.round(w * 2);
    c.height = Math.round(h * 2);
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.strokeStyle = 'rgba(90, 150, 255, 0.11)';
    g.lineWidth = 1.2;
    const hex = (cx, cy) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * s;
        const y = cy + Math.sin(a) * s;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.stroke();
    };
    for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, h / 2], [0, h], [w, h]]) hex(cx, cy);
    g.fillStyle = 'rgba(120, 200, 255, 0.18)';
    for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, h / 2], [0, h], [w, h]]) g.fillRect(cx - 1, cy - 1, 2, 2);
    hexPattern = { canvas: c, pattern: ctx.createPattern(c, 'repeat'), scale: 0.5 };
  }

  function resize() {
    R.dpr = Math.min(window.devicePixelRatio || 1, R.Q.dpr);
    R.w = window.innerWidth;
    R.h = window.innerHeight;
    canvas.width = Math.floor(R.w * R.dpr);
    canvas.height = Math.floor(R.h * R.dpr);
    R.scale = Math.max(Math.sqrt((R.w * R.h) / (1180 * 690)), R.h / 1450, R.w / 1450);
    buildBackground();
    if (!nebula) buildNebula();
    if (!stars.length) buildStars();
    buildHex();
  }

  // ---------------------------------------------------------------- partículas y efectos

  function particle(x, y, vx, vy, life, size, color, drag = 0.9) {
    if (R.particles.length >= MAX_PARTICLES * R.Q.parts) return;
    R.particles.push({ x, y, vx, vy, life, max: life, size, color, drag });
  }

  function burst(x, y, color, n, speed, size = 3, life = 0.5) {
    // Con la pantalla llena se emiten menos chispas por explosión (se nota poco y alivia mucho).
    const load = R.particles.length / (MAX_PARTICLES * R.Q.parts);
    n = Math.ceil(n * R.Q.parts * (load > 0.5 ? 1.5 - load : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      particle(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  /** `minor` = número de daño común: se descarta si ya hay muchos en pantalla. */
  function text(x, y, str, color, size, life = 0.8, minor = false) {
    const cap = R.Q.texts;
    if (minor && (R.texts.length >= cap * 0.6 || R.textsThisFrame >= 4)) return;
    if (R.texts.length >= cap) R.texts.shift();
    R.textsThisFrame++;
    R.texts.push({ x, y, str, color, size, life, max: life, vy: -60 });
  }

  function ring(x, y, r0, r1, color, life, width = 4) {
    if (R.fx.length > 90) return;
    R.fx.push({ type: 'ring', x, y, r0, r1, color, life, max: life, width });
  }

  function addShake(v) {
    R.shake = Math.min(26, Math.max(R.shake, v));
  }

  const KIND_COLORS = { mite: '#ff4d8d', drone: '#ff7a3d', splitter: '#ffd23d', dasher: '#ff3d3d', spitter: '#c84dff', brute: '#ff5a1f', warden: '#ff2a6d' };

  function handleEvent(ev, sim) {
    switch (ev.t) {
      case 'hit':
        if (Math.random() < 0.6) burst(ev.x, ev.y, ev.c ? '#ffe66b' : '#bff6ff', 2, 220, 2.2, 0.25);
        if (ev.c || Math.random() < 0.45) {
          text(ev.x + (Math.random() - 0.5) * 16, ev.y - 10, String(ev.v), ev.c ? '#ffe66b' : '#ffffff', ev.c ? 22 : 15, ev.c ? 0.9 : 0.6, !ev.c);
        }
        break;
      case 'kill': {
        const col = KIND_COLORS[ev.kind] ?? '#ff4d8d';
        burst(ev.x, ev.y, col, ev.boss ? 90 : ev.elite ? 36 : 10, ev.boss ? 520 : ev.elite ? 360 : 240, ev.boss ? 6 : 3.4, ev.boss ? 1.4 : 0.55);
        burst(ev.x, ev.y, '#ffffff', ev.boss ? 30 : ev.elite ? 10 : 3, 180, 2, 0.3);
        ring(ev.x, ev.y, ev.r * 0.5, ev.r * (ev.boss ? 6 : 2.6), col, ev.boss ? 0.8 : 0.32, ev.boss ? 10 : 3);
        if (ev.elite) addShake(7);
        if (ev.boss) {
          addShake(26);
          R.flash = 0.9;
        }
        break;
      }
      case 'arc': {
        const pts = [];
        for (let i = 0; i + 3 < ev.pts.length; i += 2) {
          const [x0, y0, x1, y1] = [ev.pts[i], ev.pts[i + 1], ev.pts[i + 2], ev.pts[i + 3]];
          const seg = 6;
          for (let k = 0; k < seg; k++) {
            const t = k / seg;
            const j = k === 0 ? 0 : 14;
            pts.push(x0 + (x1 - x0) * t + (Math.random() - 0.5) * j, y0 + (y1 - y0) * t + (Math.random() - 0.5) * j);
          }
          pts.push(x1, y1);
          burst(x1, y1, '#bff6ff', 4, 200, 2.4, 0.3);
        }
        R.fx.push({ type: 'arc', pts, life: 0.2, max: 0.2 });
        break;
      }
      case 'nova':
        ring(ev.x, ev.y, 10, ev.r, '#4dff9a', 0.42, 10);
        ring(ev.x, ev.y, 5, ev.r * 0.75, '#c9ffe3', 0.3, 3);
        break;
      case 'lance':
        R.fx.push({ type: 'beam', x: ev.x, y: ev.y, fx: ev.fx, fy: ev.fy, len: ev.len, w: ev.w, life: 0.26, max: 0.26 });
        for (let i = 0; i < 14; i++) {
          const d = Math.random() * ev.len;
          particle(ev.x + ev.fx * d, ev.y + ev.fy * d, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.4, 3, '#ff4dd2');
        }
        break;
      case 'explode':
        ring(ev.x, ev.y, 6, ev.r, '#ffb02e', 0.3, 6);
        burst(ev.x, ev.y, '#ffb02e', 14, 300, 3.2, 0.45);
        burst(ev.x, ev.y, '#fff1d1', 5, 160, 2, 0.25);
        addShake(3);
        break;
      case 'pickup': {
        const p = sim.player;
        if (ev.kind === 'shard') {
          burst(p.x, p.y, '#ffc94d', 10, 200, 3, 0.5);
          text(p.x, p.y - 30, `+${ev.v} ◆`, '#ffc94d', 20, 1.1);
        } else if (ev.kind === 'heal') {
          ring(p.x, p.y, 10, 80, '#4dff9a', 0.5, 5);
          text(p.x, p.y - 30, t('fx.heal'), '#4dff9a', 18, 1);
        } else if (ev.kind === 'bomb') {
          ring(p.x, p.y, 20, 900, '#ffffff', 0.7, 16);
          R.flash = 1;
          addShake(20);
        } else if (ev.kind === 'magnet') {
          ring(p.x, p.y, 900, 20, '#8fb0ff', 0.6, 6);
        } else if (Math.random() < 0.3) {
          particle(p.x, p.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.25, 2.5, '#4de8ff');
        }
        break;
      }
      case 'hurt':
        addShake(9);
        burst(sim.player.x, sim.player.y, '#ff4d6a', 12, 260, 3, 0.4);
        break;
      case 'chest': {
        const p = sim.player;
        ring(p.x, p.y, 10, 300, '#ffd23d', 0.8, 10);
        burst(p.x, p.y, '#ffd23d', 60, 460, 3.6, 1);
        R.flash = 0.5;
        break;
      }
      case 'evolve': {
        const p = sim.player;
        ring(p.x, p.y, 10, 420, '#ffd23d', 0.9, 14);
        ring(p.x, p.y, 10, 260, '#ffffff', 0.6, 6);
        burst(p.x, p.y, '#ffd23d', 90, 600, 4, 1.2);
        addShake(16);
        R.flash = 0.8;
        break;
      }
      case 'combo': {
        const p = sim.player;
        text(p.x, p.y - 60, t('fx.combo', { n: ev.n }), '#ffd23d', 26, 1.3);
        ring(p.x, p.y, 20, 160, '#ff9d2e', 0.4, 5);
        break;
      }
      case 'levelup': {
        const p = sim.player;
        ring(p.x, p.y, 10, 220, '#4dff9a', 0.6, 8);
        burst(p.x, p.y, '#4dff9a', 40, 380, 3.2, 0.8);
        break;
      }
      case 'boss':
        addShake(14);
        break;
      case 'dead':
        burst(ev.x, ev.y, SHIPS[sim.shipKey].color, 120, 600, 5, 1.6);
        burst(ev.x, ev.y, '#ffffff', 40, 300, 3, 1);
        ring(ev.x, ev.y, 10, 500, '#ffffff', 1, 12);
        addShake(26);
        R.flash = 1;
        break;
      default:
    }
  }

  // ---------------------------------------------------------------- dibujo

  const lerp = (a, b, t) => a + (b - a) * t;

  // Dibuja un sprite en coordenadas de mundo. Con ángulo arma la matriz directamente (sin
  // save/translate/rotate/restore, que copian todo el estado del canvas: con cientos de
  // enemigos por cuadro es una diferencia grande).
  function drawSprite(spr, x, y, angle, alpha = 1, scale = 1) {
    const s = spr.size * scale;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (angle) {
      const k = R.k;
      const c = Math.cos(angle) * k;
      const sn = Math.sin(angle) * k;
      ctx.setTransform(c, sn, -sn, c, k * x + R.ox, k * y + R.oy);
      ctx.drawImage(spr.img, -s / 2, -s / 2, s, s);
      ctx.setTransform(k, 0, 0, k, R.ox, R.oy);
    } else {
      ctx.drawImage(spr.img, x - s / 2, y - s / 2, s, s);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  function render(sim, alpha, dt, opts = {}) {
    R.time += dt;
    R.textsThisFrame = 0;
    const p = sim.player;
    const px = lerp(p.px, p.x, alpha);
    const py = lerp(p.py, p.y, alpha);
    const follow = 1 - Math.exp(-dt * 9);
    R.camX += (px + p.fx * 40 - R.camX) * follow;
    R.camY += (py + p.fy * 40 - R.camY) * follow;
    if (opts.snap) {
      R.camX = px;
      R.camY = py;
    }
    R.shake *= Math.exp(-dt * 7);
    R.shakeX = (Math.random() - 0.5) * R.shake;
    R.shakeY = (Math.random() - 0.5) * R.shake;

    const { w, h, dpr, scale } = R;
    const camX = R.camX;
    const camY = R.camY;

    // fondo (pantalla)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    {
      const size = 1024;
      const ox = -((camX * 0.08 * scale) % size) - size;
      const oy = -((camY * 0.08 * scale) % size) - size;
      for (let x = ox; x < w; x += size) for (let y = oy; y < h; y += size) ctx.drawImage(nebula, x, y);
    }
    for (let li = stars.length - R.Q.stars; li < stars.length; li++) {
      const layer = stars[li];
      const size = 512;
      const ox = -((camX * layer.par * scale) % size) - size;
      const oy = -((camY * layer.par * scale) % size) - size;
      for (let x = ox; x < w; x += size) for (let y = oy; y < h; y += size) ctx.drawImage(layer.img, x, y);
    }
    ctx.globalCompositeOperation = 'source-over';

    // mundo
    const tx = w / 2 - camX * scale + R.shakeX;
    const ty = h / 2 - camY * scale + R.shakeY;
    R.k = dpr * scale;
    R.ox = dpr * tx;
    R.oy = dpr * ty;
    R.shipSX = px * scale + tx;
    R.shipSY = py * scale + ty;
    ctx.setTransform(R.k, 0, 0, R.k, R.ox, R.oy);
    const viewL = camX - w / 2 / scale - 80;
    const viewR = camX + w / 2 / scale + 80;
    const viewT = camY - h / 2 / scale - 80;
    const viewB = camY + h / 2 / scale + 80;
    const visible = (x, y) => x > viewL && x < viewR && y > viewT && y < viewB;

    // suelo hexagonal + luz alrededor de la nave
    ctx.save();
    ctx.scale(hexPattern.scale, hexPattern.scale);
    ctx.fillStyle = hexPattern.pattern;
    ctx.fillRect(viewL / hexPattern.scale, viewT / hexPattern.scale, (viewR - viewL) / hexPattern.scale, (viewB - viewT) / hexPattern.scale);
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    const shipColor = SHIPS[sim.shipKey]?.color ?? '#4de8ff';
    drawSprite(glow(shipColor, 260, 0.22), px, py);
    ctx.globalCompositeOperation = 'source-over';

    // Los dibujos se agrupan en pasadas por modo de mezcla: cambiar entre 'lighter' y
    // 'source-over' por cada objeto corta las tandas de la placa de video y, con la pantalla
    // llena, eso es lo que más cuesta. La mezcla aditiva no depende del orden, así que los
    // brillos se pueden dibujar todos juntos antes de los cuerpos.

    // pickups: primero los halos, después los objetos
    const pk = sim.pickups;
    ctx.globalCompositeOperation = 'lighter';
    const glowPulse = 0.71 + 0.29 * Math.sin(R.time * 6);
    for (const o of pk) {
      if (o.kind === 'gem') continue;
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha) + Math.sin(R.time * 4 + o.id) * 2.5;
      if (!visible(x, y)) continue;
      const gc = o.kind === 'shard' || o.kind === 'chest' ? '#ffc94d' : o.kind === 'heal' ? '#4dff9a' : o.kind === 'bomb' ? '#ff4d6a' : '#6c8cff';
      drawSprite(glow(gc, o.kind === 'chest' ? 48 : 26, 0.7), x, y, 0, glowPulse);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const o of pk) {
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha) + Math.sin(R.time * 4 + o.id) * 2.5;
      if (!visible(x, y)) continue;
      if (o.kind === 'gem') drawSprite(pickupSprite('gem', gemTier(o.value)), x, y, 0);
      else drawSprite(pickupSprite(o.kind), x, y, o.kind === 'shard' ? Math.sin(R.time * 3 + o.id) * 0.4 : 0);
    }

    // enemigos: halos de élites y jefes, avisos, cuerpos y barras de vida
    const en = sim.enemies;
    let special = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of en) {
      if (!e.boss && !e.elite) continue;
      special++;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!visible(x, y)) continue;
      if (e.boss) {
        const pulse = e.mode === 1 ? 1 + Math.sin(R.time * 30) * 0.3 : 0.7;
        drawSprite(glow(e.def.color, e.r * 2.6, 1.3), x, y, 0, pulse / 1.3);
      } else {
        drawSprite(glow('#ffe7a3', e.r * 2.2, 0.6), x, y, 0, 0.75 + 0.25 * Math.sin(R.time * 5 + e.id));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const e of en) {
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!visible(x, y)) continue;
      const def = e.def;
      if (def.ai === 'dash' && e.mode === 1) {
        ctx.strokeStyle = 'rgba(255, 61, 61, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + e.ax * 300, y + e.ay * 300);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.boss && e.mode === 1 && e.pattern === 3) {
        ctx.strokeStyle = 'rgba(255, 42, 109, 0.6)';
        ctx.lineWidth = e.r * 0.8;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        ctx.lineTo(x + (dx / d) * 600, y + (dy / d) * 600);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (const e of en) {
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!visible(x, y)) continue;
      const def = e.def;
      // Todos miran al jugador (tienen ojos); los redondos se bambolean un poco.
      let ang = Math.atan2(p.y - e.y, p.x - e.x);
      if (def.ai === 'dash' && e.mode === 1) ang = Math.atan2(e.ay, e.ax);
      else if (def.shape === 'boss' || def.shape === 'hex' || def.shape === 'circle') ang += Math.sin(R.time * 2.2 + e.id) * 0.18;
      const spr = enemySprite(def.shape, def.color, Math.round(def.r * (e.elite ? 1.6 : 1)), e.flash > 0, e.elite);
      drawSprite(spr, x, y, ang);
    }
    if (special) {
      for (const e of en) {
        if ((!e.elite && !e.boss) || e.hp >= e.maxHp) continue;
        const x = lerp(e.px, e.x, alpha);
        const y = lerp(e.py, e.y, alpha);
        if (!visible(x, y)) continue;
        const bw = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - bw / 2, y - e.r - 14, bw, 4);
        ctx.fillStyle = e.boss ? '#ff2a6d' : '#ffe7a3';
        ctx.fillRect(x - bw / 2, y - e.r - 14, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
    }

    // armas del jugador: cuchillas orbitales (halos y después las cuchillas)
    for (const pass of [0, 1]) {
      ctx.globalCompositeOperation = pass === 0 ? 'lighter' : 'source-over';
      for (const wpn of p.weapons) {
        if (wpn.id !== 'orbit' || !wpn.count) continue;
        const L = weaponStats(wpn);
        const angle = wpn.angle + (L.speed / 60) * alpha;
        const bladeColor = wpn.evolved ? '#ffd23d' : '#b36bff';
        for (let b = 0; b < wpn.count; b++) {
          const a = angle + (b * Math.PI * 2) / wpn.count;
          const bx = px + Math.cos(a) * wpn.radius;
          const by = py + Math.sin(a) * wpn.radius;
          if (pass === 0) drawSprite(glow(bladeColor, wpn.evolved ? 34 : 26, 0.6), bx, by);
          else drawSprite(bladeSprite(bladeColor), bx, by, a + R.time * 14, 1, wpn.evolved ? 1.35 : 1);
        }
      }
    }

    // nave
    if (sim.phase !== 'dead') {
      const blink = p.invuln > 0 && Math.floor(R.time * 20) % 2 === 0;
      if (!blink) {
        const k = R.k * 1.15;
        const c = p.fx * k;
        const sn = p.fy * k;
        ctx.setTransform(c, sn, -sn, c, R.k * px + R.ox, R.k * py + R.oy);
        drawShipFast(ctx, sim.shipKey, shipColor, R.time, p.moving ? 1 : 0.35);
        ctx.setTransform(R.k, 0, 0, R.k, R.ox, R.oy);
      }
      if (p.moving && Math.random() < 0.7) {
        particle(px - p.fx * 14, py - p.fy * 14, -p.fx * 90 + (Math.random() - 0.5) * 40, -p.fy * 90 + (Math.random() - 0.5) * 40, 0.35, 3, shipColor, 0.92);
      }
    }

    // proyectiles: todos los rayos en un solo trazo (borde y centro), misiles en dos pasadas
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const goldBolts = p.weapons.some((w) => w.id === 'blaster' && w.evolved);
    let bolts = 0;
    let missiles = 0;
    ctx.beginPath();
    for (const b of sim.projectiles) {
      if (b.kind !== 'bolt') {
        missiles++;
        continue;
      }
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!visible(x, y)) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      ctx.moveTo(x - (b.vx / sp) * 26, y - (b.vy / sp) * 26);
      ctx.lineTo(x, y);
      bolts++;
    }
    if (bolts) {
      ctx.strokeStyle = goldBolts ? 'rgba(255, 210, 61, 0.4)' : 'rgba(77, 232, 255, 0.35)';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = goldBolts ? '#fff6cf' : '#e6fdff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (missiles) {
      for (const pass of [0, 1]) {
        ctx.globalCompositeOperation = pass === 0 ? 'lighter' : 'source-over';
        for (const b of sim.projectiles) {
          if (b.kind === 'bolt') continue;
          const x = lerp(b.px, b.x, alpha);
          const y = lerp(b.py, b.y, alpha);
          if (!visible(x, y)) continue;
          if (pass === 1) {
            drawSprite(missileSprite(), x, y, Math.atan2(b.vy, b.vx));
            continue;
          }
          drawSprite(glow('#ffb02e', 22, 0.7), x, y);
          if (Math.random() < 0.8) particle(x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.4, 3.5, '#ff8a3d', 0.9);
        }
      }
      ctx.globalCompositeOperation = 'lighter';
    }
    for (const b of sim.ebullets) {
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!visible(x, y)) continue;
      drawSprite(enemyBulletSprite(b.r), x, y);
    }

    // efectos
    for (let i = R.fx.length - 1; i >= 0; i--) {
      const f = R.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        R.fx.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.max;
      if (f.type === 'ring') {
        const r = f.r0 + (f.r1 - f.r0) * (1 - (1 - t) * (1 - t));
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.lineWidth = f.width * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'arc') {
        ctx.lineJoin = 'round';
        for (const [col, wdt] of [['rgba(77,232,255,0.35)', 10], ['#e9fdff', 2.5]]) {
          ctx.strokeStyle = col;
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = wdt;
          ctx.beginPath();
          for (let k = 0; k < f.pts.length; k += 2) {
            if (k) ctx.lineTo(f.pts[k], f.pts[k + 1]);
            else ctx.moveTo(f.pts[k], f.pts[k + 1]);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'beam') {
        const fade = 1 - t;
        const ex = f.x + f.fx * f.len;
        const ey = f.y + f.fy * f.len;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = 'rgba(255, 77, 210, 0.45)';
        ctx.lineWidth = f.w * (1.4 - t * 0.6);
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = '#ffe6fa';
        ctx.lineWidth = f.w * 0.3 * fade;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // partículas: se mueven y después se dibujan agrupadas por color (misma imagen seguida =
    // una sola tanda en la placa de video; con mezcla aditiva el orden no cambia el resultado)
    const parts = R.particles;
    const damp90 = Math.pow(0.9, dt * 60);
    let wIdx = 0;
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      const damp = q.drag === 0.9 ? damp90 : Math.pow(q.drag, dt * 60);
      q.vx *= damp;
      q.vy *= damp;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      parts[wIdx++] = q;
    }
    parts.length = wIdx;
    const groups = R.groups;
    for (const list of groups.values()) list.length = 0;
    for (const q of parts) {
      if (!visible(q.x, q.y)) continue;
      let list = groups.get(q.color);
      if (!list) groups.set(q.color, (list = []));
      list.push(q);
    }
    for (const [color, list] of groups) {
      if (!list.length) continue;
      const spr = glow(color, 12, 1);
      for (const q of list) {
        const k = q.life / q.max;
        drawSprite(spr, q.x, q.y, 0, k, (q.size / 6) * (0.4 + k * 0.8));
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // textos flotantes (pantalla), pre-dibujados como imágenes
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fontK = Math.max(0.8, scale * 0.8) * dpr;
    for (let i = R.texts.length - 1; i >= 0; i--) {
      const t = R.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        R.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.94;
      const sx = (t.x - camX) * scale + w / 2 + R.shakeX;
      const sy = (t.y - camY) * scale + h / 2 + R.shakeY;
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      const spr = textSprite(t.str, t.color, Math.round(t.size * fontK));
      const tw = spr.w * pop;
      const th = spr.h * pop;
      ctx.globalAlpha = Math.min(1, k * 2);
      // la imagen se centra un poco arriba del punto (como el texto con baseline alfabética)
      ctx.drawImage(spr.img, sx * dpr - tw / 2, sy * dpr - th * 0.75, tw, th);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (R.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${R.flash * 0.6})`;
      ctx.fillRect(0, 0, w, h);
      R.flash = Math.max(0, R.flash - dt * 2.5);
    }
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    R,
    render,
    resize,
    handleEvent,
    reset() {
      R.particles.length = 0;
      R.texts.length = 0;
      R.fx.length = 0;
      R.shake = 0;
      R.flash = 0;
    },
    /** Cambia el nivel de calidad (0 = máxima, ver QUALITY_LEVELS). */
    setLevel(n) {
      n = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, n | 0));
      if (n === R.level && R.Q === QUALITY_LEVELS[n]) return;
      R.level = n;
      R.Q = QUALITY_LEVELS[n];
      const cap = MAX_PARTICLES * R.Q.parts;
      if (R.particles.length > cap) R.particles.length = cap;
      resize();
    }
  };
}

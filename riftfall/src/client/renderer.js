// Renderizador Canvas2D: fondo en parallax, entidades interpoladas entre ticks y efectos.
// Todo lo visual es cosmético (puede usar Math.random): no afecta a la simulación.

import { WEAPONS, SHIPS } from '../sim/index.js';
import {
  glow,
  rgba,
  enemySprite,
  pickupSprite,
  gemTier,
  bladeSprite,
  missileSprite,
  drawShipShape
} from './sprites.js';

const MAX_PARTICLES = 1600;
const MAX_TEXTS = 70;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const R = {
    w: 0, h: 0, dpr: 1, scale: 1,
    camX: 0, camY: 0, shake: 0, shakeX: 0, shakeY: 0, time: 0, flash: 0,
    particles: [], texts: [], fx: [], quality: 1
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
    R.dpr = Math.min(window.devicePixelRatio || 1, R.quality > 0.7 ? 2 : 1.25);
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
    if (R.particles.length >= MAX_PARTICLES * R.quality) return;
    R.particles.push({ x, y, vx, vy, life, max: life, size, color, drag });
  }

  function burst(x, y, color, n, speed, size = 3, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      particle(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  function text(x, y, str, color, size, life = 0.8) {
    if (R.texts.length >= MAX_TEXTS) R.texts.shift();
    R.texts.push({ x, y, str, color, size, life, max: life, vy: -60 });
  }

  function ring(x, y, r0, r1, color, life, width = 4) {
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
          text(ev.x + (Math.random() - 0.5) * 16, ev.y - 10, String(ev.v), ev.c ? '#ffe66b' : '#ffffff', ev.c ? 22 : 15, ev.c ? 0.9 : 0.6);
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
          text(p.x, p.y - 30, '+VIDA', '#4dff9a', 18, 1);
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

  function drawSprite(spr, x, y, angle, alpha = 1, scale = 1) {
    const s = spr.size * scale;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(spr.img, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else {
      ctx.drawImage(spr.img, x - s / 2, y - s / 2, s, s);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  function render(sim, alpha, dt, opts = {}) {
    R.time += dt;
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
    for (const layer of stars) {
      const size = 512;
      const ox = -((camX * layer.par * scale) % size) - size;
      const oy = -((camY * layer.par * scale) % size) - size;
      for (let x = ox; x < w; x += size) for (let y = oy; y < h; y += size) ctx.drawImage(layer.img, x, y);
    }
    ctx.globalCompositeOperation = 'source-over';

    // mundo
    const tx = w / 2 - camX * scale + R.shakeX;
    const ty = h / 2 - camY * scale + R.shakeY;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
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

    // pickups
    for (const o of sim.pickups) {
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha);
      if (!visible(x, y)) continue;
      const bob = Math.sin(R.time * 4 + o.id) * 2.5;
      if (o.kind === 'gem') {
        drawSprite(pickupSprite('gem', gemTier(o.value)), x, y + bob, 0);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(glow(o.kind === 'shard' ? '#ffc94d' : o.kind === 'heal' ? '#4dff9a' : o.kind === 'bomb' ? '#ff4d6a' : '#6c8cff', 26, 0.5 + 0.2 * Math.sin(R.time * 6)), x, y + bob);
        ctx.globalCompositeOperation = 'source-over';
        drawSprite(pickupSprite(o.kind), x, y + bob, o.kind === 'shard' ? Math.sin(R.time * 3 + o.id) * 0.4 : 0);
      }
    }

    // enemigos
    for (const e of sim.enemies) {
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!visible(x, y)) continue;
      const def = e.def;
      let ang;
      if (def.shape === 'boss' || def.shape === 'hex' || def.shape === 'circle') ang = R.time * (def.shape === 'boss' ? 0.6 : 1.4) + e.id;
      else ang = Math.atan2(p.y - e.y, p.x - e.x);
      if (def.ai === 'dash' && e.mode === 1) {
        ctx.strokeStyle = 'rgba(255, 61, 61, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + e.ax * 300, y + e.ay * 300);
        ctx.stroke();
        ctx.setLineDash([]);
        ang = Math.atan2(e.ay, e.ax);
      }
      if (e.boss) {
        ctx.globalCompositeOperation = 'lighter';
        const pulse = e.mode === 1 ? 1 + Math.sin(R.time * 30) * 0.3 : 0.7;
        drawSprite(glow(def.color, e.r * 2.6, pulse), x, y);
        ctx.globalCompositeOperation = 'source-over';
        if (e.mode === 1 && e.pattern === 3) {
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
      } else if (e.elite) {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(glow('#ffe7a3', e.r * 2.2, 0.45 + 0.15 * Math.sin(R.time * 5 + e.id)), x, y);
        ctx.globalCompositeOperation = 'source-over';
      }
      const spr = enemySprite(def.shape, def.color, Math.round(def.r * (e.elite ? 1.6 : 1)), e.flash > 0, e.elite);
      drawSprite(spr, x, y, ang);
      if ((e.elite || e.boss) && e.hp < e.maxHp) {
        const bw = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - bw / 2, y - e.r - 14, bw, 4);
        ctx.fillStyle = e.boss ? '#ff2a6d' : '#ffe7a3';
        ctx.fillRect(x - bw / 2, y - e.r - 14, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
    }

    // armas del jugador: cuchillas orbitales
    for (const wpn of p.weapons) {
      if (wpn.id !== 'orbit' || !wpn.count) continue;
      const L = WEAPONS.orbit.levels[wpn.level - 1];
      const angle = wpn.angle + (L.speed / 60) * alpha;
      for (let b = 0; b < wpn.count; b++) {
        const a = angle + (b * Math.PI * 2) / wpn.count;
        const bx = px + Math.cos(a) * wpn.radius;
        const by = py + Math.sin(a) * wpn.radius;
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(glow('#b36bff', 26, 0.6), bx, by);
        ctx.globalCompositeOperation = 'source-over';
        drawSprite(bladeSprite('#b36bff'), bx, by, a + R.time * 14);
      }
    }

    // nave
    if (sim.phase !== 'dead') {
      const blink = p.invuln > 0 && Math.floor(R.time * 20) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(p.fy, p.fx));
        ctx.scale(0.95, 0.95);
        drawShipShape(ctx, sim.shipKey, shipColor, R.time, p.moving ? 1 : 0.35);
        ctx.restore();
      }
      if (p.moving && Math.random() < 0.7) {
        particle(px - p.fx * 14, py - p.fy * 14, -p.fx * 90 + (Math.random() - 0.5) * 40, -p.fy * 90 + (Math.random() - 0.5) * 40, 0.35, 3, shipColor, 0.92);
      }
    }

    // proyectiles
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of sim.projectiles) {
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!visible(x, y)) continue;
      if (b.kind === 'bolt') {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const tx2 = x - (b.vx / sp) * 26;
        const ty2 = y - (b.vy / sp) * 26;
        ctx.strokeStyle = 'rgba(77, 232, 255, 0.35)';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(tx2, ty2);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = '#e6fdff';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        drawSprite(glow('#ffb02e', 22, 0.7), x, y);
        ctx.globalCompositeOperation = 'source-over';
        drawSprite(missileSprite(), x, y, Math.atan2(b.vy, b.vx));
        ctx.globalCompositeOperation = 'lighter';
        if (Math.random() < 0.8) particle(x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.4, 3.5, '#ff8a3d', 0.9);
      }
    }
    for (const b of sim.ebullets) {
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!visible(x, y)) continue;
      drawSprite(glow('#ff3da8', b.r * 2.6, 0.9), x, y);
      ctx.fillStyle = '#ffe1f3';
      ctx.beginPath();
      ctx.arc(x, y, b.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
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
        ctx.strokeStyle = rgba(f.color, (1 - t) * 0.9);
        ctx.lineWidth = f.width * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
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

    // partículas
    const parts = R.particles;
    let wIdx = 0;
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vx *= Math.pow(q.drag, dt * 60);
      q.vy *= Math.pow(q.drag, dt * 60);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      parts[wIdx++] = q;
      if (!visible(q.x, q.y)) continue;
      const k = q.life / q.max;
      drawSprite(glow(q.color, 12, 1), q.x, q.y, 0, k, (q.size / 6) * (0.4 + k * 0.8));
    }
    parts.length = wIdx;
    ctx.globalCompositeOperation = 'source-over';

    // textos flotantes (pantalla)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
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
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `800 ${Math.round(t.size * pop * Math.max(0.8, scale * 0.8))}px Orbitron, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(5, 6, 15, 0.85)';
      ctx.strokeText(t.str, sx, sy);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, sx, sy);
    }
    ctx.globalAlpha = 1;

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
    setQuality(q) {
      R.quality = q;
      resize();
    }
  };
}

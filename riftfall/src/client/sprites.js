// Sprites pre-renderizados (con brillo) para dibujar cientos de entidades a 60 fps,
// iconos vectoriales de armas/mejoras y las siluetas de las naves.

const RES = 2; // resolución interna de los sprites (px por unidad de mundo)
const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

function cached(key, build) {
  let s = cache.get(key);
  if (!s) {
    s = build();
    cache.set(key, s);
  }
  return s;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Halo radial suave, para dibujar con 'lighter'. Devuelve { img, size } (size en unidades de mundo).
 * Radio e intensidad se redondean: así la caché queda acotada aunque se pidan valores animados
 * (un halo que late debe variar `globalAlpha`, no crear una imagen nueva por cuadro).
 */
export function glow(color, radius, strength = 1) {
  radius = Math.max(2, Math.round(radius));
  strength = Math.min(1.5, Math.max(0.1, Math.round(strength * 10) / 10));
  return cached(`glow|${color}|${radius}|${strength}`, () => {
    const px = radius * RES;
    const c = makeCanvas(px * 2, px * 2);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(px, px, 0, px, px, px);
    grad.addColorStop(0, rgba(color, 0.9 * strength));
    grad.addColorStop(0.25, rgba(color, 0.45 * strength));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, px * 2, px * 2);
    return { img: c, size: radius * 2 };
  });
}

function polygon(g, n, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function enemyPath(g, shape, r) {
  switch (shape) {
    case 'tri':
      g.beginPath();
      g.moveTo(r * 1.15, 0);
      g.lineTo(-r * 0.8, r * 0.85);
      g.lineTo(-r * 0.45, 0);
      g.lineTo(-r * 0.8, -r * 0.85);
      g.closePath();
      break;
    case 'diamond':
      g.beginPath();
      g.moveTo(r * 1.1, 0);
      g.lineTo(0, r * 0.8);
      g.lineTo(-r * 1.0, 0);
      g.lineTo(0, -r * 0.8);
      g.closePath();
      break;
    case 'hex':
      polygon(g, 6, r, Math.PI / 6);
      break;
    case 'arrow':
      g.beginPath();
      g.moveTo(r * 1.3, 0);
      g.lineTo(-r * 0.6, r * 0.95);
      g.lineTo(-r * 0.2, r * 0.25);
      g.lineTo(-r * 1.0, r * 0.3);
      g.lineTo(-r * 1.0, -r * 0.3);
      g.lineTo(-r * 0.2, -r * 0.25);
      g.lineTo(-r * 0.6, -r * 0.95);
      g.closePath();
      break;
    case 'circle':
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.12 : r * 0.82;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      break;
    case 'square': {
      const k = r * 0.92;
      const c = r * 0.35;
      g.beginPath();
      g.moveTo(-k + c, -k);
      g.lineTo(k - c, -k);
      g.lineTo(k, -k + c);
      g.lineTo(k, k - c);
      g.lineTo(k - c, k);
      g.lineTo(-k + c, k);
      g.lineTo(-k, k - c);
      g.lineTo(-k, -k + c);
      g.closePath();
      break;
    }
    case 'star': {
      // mina: estrella de púas
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.25 : r * 0.62;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      break;
    }
    case 'crescent': {
      // espectro: cabeza redonda adelante y tres colas onduladas atrás
      g.beginPath();
      g.moveTo(-r * 0.2, -r * 0.95);
      g.bezierCurveTo(r * 0.75, -r * 1.05, r * 1.2, -r * 0.35, r * 1.15, 0);
      g.bezierCurveTo(r * 1.2, r * 0.35, r * 0.75, r * 1.05, -r * 0.2, r * 0.95);
      g.quadraticCurveTo(-r * 0.75, r * 0.95, -r * 1.25, r * 0.7);
      g.quadraticCurveTo(-r * 0.75, r * 0.45, -r * 1.05, r * 0.2);
      g.quadraticCurveTo(-r * 0.6, 0, -r * 1.05, -r * 0.2);
      g.quadraticCurveTo(-r * 0.75, -r * 0.45, -r * 1.25, -r * 0.7);
      g.quadraticCurveTo(-r * 0.75, -r * 0.95, -r * 0.2, -r * 0.95);
      g.closePath();
      break;
    }
    case 'shield':
      // égida: escudo con la punta hacia adelante
      g.beginPath();
      g.moveTo(r * 1.15, 0);
      g.quadraticCurveTo(r * 0.75, -r * 0.95, -r * 0.55, -r * 1.0);
      g.quadraticCurveTo(-r * 1.0, -r * 0.55, -r * 0.92, 0);
      g.quadraticCurveTo(-r * 1.0, r * 0.55, -r * 0.55, r * 1.0);
      g.quadraticCurveTo(r * 0.75, r * 0.95, r * 1.15, 0);
      g.closePath();
      break;
    case 'cross': {
      // francotirador: cruz con un cañón largo hacia adelante
      const w = r * 0.38;
      g.beginPath();
      g.moveTo(r * 1.45, -w * 0.55);
      g.lineTo(r * 1.45, w * 0.55);
      g.lineTo(w, w * 0.8);
      g.lineTo(w * 0.8, r * 1.0);
      g.lineTo(-w * 0.8, r * 1.0);
      g.lineTo(-w, w);
      g.lineTo(-r * 1.0, w * 0.8);
      g.lineTo(-r * 1.0, -w * 0.8);
      g.lineTo(-w, -w);
      g.lineTo(-w * 0.8, -r * 1.0);
      g.lineTo(w * 0.8, -r * 1.0);
      g.lineTo(w, -w * 0.8);
      g.closePath();
      break;
    }
    case 'core':
      // Corazón del Rift: corona de púas grandes
      g.beginPath();
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const rr = i % 4 === 0 ? r * 1.22 : i % 2 === 0 ? r * 1.0 : r * 0.88;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'boss':
      g.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.08 : r * 0.86;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      break;
    default:
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
  }
}

/** Mezcla un color hex con otro (t = 0 → a, t = 1 → b). */
function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
}

/** Ojo de dibujo animado mirando hacia adelante (+X). */
function drawEye(g, x, y, s, color) {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(x, y, s, s * 0.9, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(1, s * 0.22);
  g.strokeStyle = '#130a2b';
  g.stroke();
  g.fillStyle = mix(color, '#000000', 0.55);
  g.beginPath();
  g.arc(x + s * 0.32, y, s * 0.52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x + s * 0.48, y - s * 0.25, s * 0.18, 0, Math.PI * 2);
  g.fill();
}

/**
 * Sprite de enemigo con el mismo estilo "cartoon" de las naves: cuerpo con volumen,
 * contorno oscuro, brillo superior, ojo expresivo y halo de neón para leerse sobre el fondo.
 */
export function enemySprite(shape, color, r, flash = false, elite = false) {
  if (flash) {
    // Golpe: el mismo dibujo con un velo blanco encima (se sigue viendo el ojo y el contorno).
    // En los jefes el velo es más suave, porque reciben golpes todo el tiempo.
    return cached(`en3f|${shape}|${color}|${r}|${elite}`, () => {
      const base = enemySprite(shape, color, r, false, elite);
      const c = makeCanvas(base.img.width, base.img.height);
      const g = c.getContext('2d');
      g.drawImage(base.img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = shape === 'boss' || shape === 'core' ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.62)';
      g.fillRect(0, 0, c.width, c.height);
      return { img: c, size: base.size };
    });
  }
  return cached(`en3|${shape}|${color}|${r}|${elite}`, () => {
    const pad = r * 0.9 + 10;
    const half = r * 1.35 + pad;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.lineJoin = 'round';

    // halo + silueta
    g.shadowColor = elite ? '#ffd23d' : color;
    g.shadowBlur = elite ? 24 : 14;
    enemyPath(g, shape, r);
    const body = g.createLinearGradient(-r * 0.6, -r, r * 0.4, r);
    body.addColorStop(0, mix(color, '#ffffff', 0.45));
    body.addColorStop(0.45, color);
    body.addColorStop(1, mix(color, '#000000', 0.55));
    g.fillStyle = body;
    g.fill();
    g.shadowBlur = 0;

    // brillo superior recortado a la silueta
    g.save();
    enemyPath(g, shape, r);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.ellipse(-r * 0.15, -r * 0.55, r * 0.75, r * 0.32, -0.25, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // contorno de dibujo animado
    enemyPath(g, shape, r);
    g.lineWidth = Math.max(2, r * 0.14);
    g.strokeStyle = '#130a2b';
    g.stroke();

    if (shape === 'core') {
      // anillo interior de energía, pupila grande y dos ojos laterales
      g.strokeStyle = rgba('#ffffff', 0.75);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = rgba(mix(color, '#ffffff', 0.6), 0.9);
      g.lineWidth = 2;
      polygon(g, 8, r * 0.82, Math.PI / 8);
      g.stroke();
      drawEye(g, r * 0.08, 0, r * 0.36, color);
      drawEye(g, -r * 0.36, -r * 0.42, r * 0.14, color);
      drawEye(g, -r * 0.36, r * 0.42, r * 0.14, color);
    } else if (shape === 'star') {
      // núcleo inestable que brilla
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(1.5, r * 0.1);
      g.strokeStyle = '#130a2b';
      g.stroke();
      drawEye(g, r * 0.05, 0, Math.max(2.2, r * 0.24), color);
    } else if (shape === 'shield') {
      // placa central con remaches
      g.fillStyle = mix(color, '#ffffff', 0.25);
      g.strokeStyle = '#130a2b';
      g.lineWidth = Math.max(1.5, r * 0.08);
      g.beginPath();
      g.moveTo(r * 0.55, 0);
      g.quadraticCurveTo(r * 0.3, -r * 0.5, -r * 0.45, -r * 0.55);
      g.lineTo(-r * 0.45, r * 0.55);
      g.quadraticCurveTo(r * 0.3, r * 0.5, r * 0.55, 0);
      g.closePath();
      g.fill();
      g.stroke();
      drawEye(g, r * 0.1, 0, r * 0.26, color);
    } else if (shape === 'cross') {
      // mira telescópica como ojo
      g.fillStyle = '#1b2240';
      g.beginPath();
      g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      g.fill();
      drawEye(g, r * 0.04, 0, r * 0.3, color);
    } else if (shape === 'boss') {
      // anillos de energía y tres ojos
      g.strokeStyle = rgba(mix(color, '#ffffff', 0.5), 0.85);
      g.lineWidth = 3;
      polygon(g, 6, r * 0.66, 0);
      g.stroke();
      drawEye(g, r * 0.1, 0, r * 0.3, color);
      drawEye(g, -r * 0.32, -r * 0.4, r * 0.16, color);
      drawEye(g, -r * 0.32, r * 0.4, r * 0.16, color);
    } else if (shape === 'square') {
      // bruto acorazado: placa central y ojo
      g.fillStyle = mix(color, '#000000', 0.35);
      g.strokeStyle = '#130a2b';
      g.lineWidth = Math.max(1.5, r * 0.08);
      g.beginPath();
      g.rect(-r * 0.62, -r * 0.62, r * 0.7, r * 1.24);
      g.fill();
      g.stroke();
      drawEye(g, r * 0.28, 0, r * 0.3, color);
    } else {
      drawEye(g, shape === 'tri' || shape === 'arrow' ? r * 0.15 : r * 0.12, 0, Math.max(2.4, r * 0.32), color);
    }

    if (elite) {
      g.strokeStyle = '#fff3c4';
      g.lineWidth = 1.6;
      enemyPath(g, shape, r * 1.2);
      g.setLineDash([4, 5]);
      g.stroke();
      g.setLineDash([]);
    }
    return { img: c, size: half * 2 };
  });
}

export const GEM_COLORS = ['#4de8ff', '#4dff9a', '#c86bff', '#ff4dd2'];

export function gemTier(value) {
  return value < 3 ? 0 : value < 10 ? 1 : value < 40 ? 2 : 3;
}

export function pickupSprite(kind, tier = 0) {
  return cached(`pk|${kind}|${tier}`, () => {
    const half = 22;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.lineJoin = 'round';
    if (kind === 'gem') {
      const color = GEM_COLORS[tier];
      const s = 5 + tier * 1.6;
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(0, -s * 1.4);
      g.lineTo(s, 0);
      g.lineTo(0, s * 1.4);
      g.lineTo(-s, 0);
      g.closePath();
      const grad = g.createLinearGradient(-s, -s, s, s);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, rgba(color, 0.6));
      g.fillStyle = grad;
      g.fill();
    } else if (kind === 'shard') {
      g.shadowColor = '#ffc94d';
      g.shadowBlur = 16;
      polygon(g, 6, 9, 0);
      const grad = g.createLinearGradient(-9, -9, 9, 9);
      grad.addColorStop(0, '#fff6cf');
      grad.addColorStop(0.5, '#ffc94d');
      grad.addColorStop(1, '#ff8a1f');
      g.fillStyle = grad;
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#fff6cf';
      g.lineWidth = 1.5;
      polygon(g, 6, 5, 0);
      g.stroke();
    } else if (kind === 'heal') {
      g.shadowColor = '#4dff9a';
      g.shadowBlur = 14;
      g.fillStyle = '#4dff9a';
      g.fillRect(-3.5, -10, 7, 20);
      g.fillRect(-10, -3.5, 20, 7);
    } else if (kind === 'magnet') {
      g.shadowColor = '#6c8cff';
      g.shadowBlur = 14;
      g.strokeStyle = '#8fb0ff';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, 8, Math.PI, 0, true);
      g.lineTo(8, -8);
      g.moveTo(-8, 0);
      g.lineTo(-8, -8);
      g.stroke();
      g.fillStyle = '#ff4d6a';
      g.fillRect(-10.5, -12, 5, 4);
      g.fillRect(5.5, -12, 5, 4);
    } else if (kind === 'chest') {
      g.shadowColor = '#ffd23d';
      g.shadowBlur = 18;
      const grad = g.createLinearGradient(0, -10, 0, 12);
      grad.addColorStop(0, '#fff2b3');
      grad.addColorStop(0.5, '#ffc94d');
      grad.addColorStop(1, '#c46a12');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(-15, -6, 30, 18, 3);
      g.fill();
      g.beginPath();
      g.roundRect(-16, -14, 32, 10, 4);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#5a2c00';
      g.lineWidth = 1.6;
      g.strokeRect(-15, -6, 30, 18);
      g.fillStyle = '#ffffff';
      g.fillRect(-3, -8, 6, 8);
    } else if (kind === 'bomb') {
      g.shadowColor = '#ff4d6a';
      g.shadowBlur = 16;
      g.fillStyle = '#1a0610';
      g.beginPath();
      g.arc(0, 2, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ff4d6a';
      g.lineWidth = 2.5;
      g.stroke();
      g.fillStyle = '#ffd23d';
      g.beginPath();
      g.arc(4, -9, 3, 0, Math.PI * 2);
      g.fill();
    }
    return { img: c, size: half * 2 };
  });
}

export function bladeSprite(color) {
  return cached(`blade|${color}`, () => {
    const half = 24;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.shadowColor = color;
    g.shadowBlur = 14;
    g.fillStyle = '#f4e9ff';
    g.beginPath();
    g.moveTo(0, -15);
    g.quadraticCurveTo(11, -4, 3, 15);
    g.quadraticCurveTo(4, 0, -6, -10);
    g.closePath();
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    return { img: c, size: half * 2 };
  });
}

export function missileSprite() {
  return cached('missile', () => {
    const half = 14;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.shadowColor = '#ffb02e';
    g.shadowBlur = 10;
    g.fillStyle = '#fff1d1';
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-6, 5);
    g.lineTo(-3, 0);
    g.lineTo(-6, -5);
    g.closePath();
    g.fill();
    return { img: c, size: half * 2 };
  });
}

/** Rayo del bláster: cápsula de luz alargada (mira hacia +X), para dibujar con 'lighter'. */
export function boltSprite(gold) {
  return cached(`bolt|${gold}`, () => {
    const len = 30;
    const half = 18;
    const c = makeCanvas(len * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(len, half);
    const col = gold ? '#ffd23d' : '#4de8ff';
    g.shadowColor = col;
    g.shadowBlur = 12;
    const body = g.createLinearGradient(-len, 0, len * 0.6, 0);
    body.addColorStop(0, rgba(col, 0));
    body.addColorStop(0.6, rgba(col, 0.55));
    body.addColorStop(1, rgba(col, 0.95));
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(-2, 0, len - 4, 4.6, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = gold ? '#fff6cf' : '#ecfeff';
    g.beginPath();
    g.ellipse(8, 0, 12, 2, 0, 0, Math.PI * 2);
    g.fill();
    // el cuadro del sprite tiene alto `half * 2`; size se usa como ancho al dibujar
    return { img: c, size: len * 2, h: half * 2 };
  });
}

/** Bala del francotirador: aguja de luz ácida (mira hacia +X). */
export function snipeSprite() {
  return cached('snipe', () => {
    const len = 22;
    const half = 10;
    const c = makeCanvas(len * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(len, half);
    g.shadowColor = '#d4ff3d';
    g.shadowBlur = 10;
    const body = g.createLinearGradient(-len, 0, len, 0);
    body.addColorStop(0, rgba('#d4ff3d', 0));
    body.addColorStop(1, rgba('#f3ffc4', 1));
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(len - 2, 0);
    g.lineTo(-len + 2, -3);
    g.lineTo(-len + 2, 3);
    g.closePath();
    g.fill();
    return { img: c, size: len * 2, h: half * 2 };
  });
}

/** Esquirla de una explosión (triángulo con borde), del color del enemigo. */
export function debrisSprite(color) {
  return cached(`debris|${color}`, () => {
    const half = 8;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-4, 4.5);
    g.lineTo(-3, -4);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = '#130a2b';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.moveTo(4, -0.5);
    g.lineTo(-2.5, -3);
    g.lineTo(-1, 0.5);
    g.closePath();
    g.fill();
    return { img: c, size: half * 2 };
  });
}

/** Bocanada de humo oscuro y suave (da volumen a las explosiones). */
export function smokeSprite() {
  return cached('smoke', () => {
    const half = 32;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, half);
    grad.addColorStop(0, 'rgba(40, 30, 70, 0.55)');
    grad.addColorStop(0.55, 'rgba(26, 20, 52, 0.3)');
    grad.addColorStop(1, 'rgba(10, 8, 24, 0)');
    g.fillStyle = grad;
    g.fillRect(-half, -half, half * 2, half * 2);
    return { img: c, size: half * 2 };
  });
}

/** Meteorito: roca con borde encendido. */
export function meteorSprite() {
  return cached('meteor', () => {
    const half = 30;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    g.shadowColor = '#ff7a1f';
    g.shadowBlur = 16;
    g.beginPath();
    const pts = 11;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = 14 + ((i * 37) % 7) - 3;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    const body = g.createRadialGradient(-5, -5, 2, 0, 0, 18);
    body.addColorStop(0, '#ffcf6b');
    body.addColorStop(0.35, '#b4532a');
    body.addColorStop(1, '#3a1a14');
    g.fillStyle = body;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = '#130a2b';
    g.stroke();
    for (const [x, y, rr] of [[-3, 4, 3], [5, -2, 2.2], [-6, -5, 1.8]]) {
      g.fillStyle = 'rgba(19,10,43,0.45)';
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    return { img: c, size: half * 2 };
  });
}

/**
 * Planeta lejano para el fondo: esfera sombreada con atmósfera y anillo.
 * `hue` cambia la paleta; se dibuja una sola vez y se reutiliza.
 */
export function planetSprite(kind = 0) {
  return cached(`planet|${kind}`, () => {
    const R = kind === 0 ? 150 : 70;
    const half = R * 2.1;
    const c = makeCanvas(half * 2, half * 2);
    const g = c.getContext('2d');
    g.translate(half, half);
    const pal = kind === 0 ? ['#ffb36b', '#c2456e', '#3a1650', '#ff7ad9'] : ['#9ff6ff', '#3c7bd6', '#141c4a', '#7fd0ff'];
    // anillo (parte de atrás)
    const ring = (front) => {
      if (kind !== 0) return;
      g.save();
      g.rotate(-0.38);
      g.scale(1, 0.26);
      g.beginPath();
      if (front) g.arc(0, 0, R * 1.75, 0, Math.PI);
      else g.arc(0, 0, R * 1.75, Math.PI, Math.PI * 2);
      g.lineWidth = R * 0.32;
      const rg = g.createLinearGradient(-R * 1.75, 0, R * 1.75, 0);
      rg.addColorStop(0, 'rgba(255, 210, 160, 0.05)');
      rg.addColorStop(0.5, 'rgba(255, 210, 170, 0.42)');
      rg.addColorStop(1, 'rgba(255, 160, 200, 0.08)');
      g.strokeStyle = rg;
      g.stroke();
      g.restore();
    };
    ring(false);
    // atmósfera
    const atm = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.35);
    atm.addColorStop(0, rgba(pal[3], 0.4));
    atm.addColorStop(1, rgba(pal[3], 0));
    g.fillStyle = atm;
    g.beginPath();
    g.arc(0, 0, R * 1.35, 0, Math.PI * 2);
    g.fill();
    // esfera
    const body = g.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.1, 0, 0, R);
    body.addColorStop(0, pal[0]);
    body.addColorStop(0.5, pal[1]);
    body.addColorStop(1, pal[2]);
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    // bandas suaves recortadas a la esfera
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.clip();
    g.globalAlpha = 0.16;
    for (let i = -4; i <= 4; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : pal[2];
      g.beginPath();
      g.ellipse(0, i * R * 0.22, R * 1.3, R * 0.07, -0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // sombra del lado nocturno
    const night = g.createLinearGradient(-R, -R, R, R);
    night.addColorStop(0.45, 'rgba(4, 4, 16, 0)');
    night.addColorStop(1, 'rgba(4, 4, 16, 0.75)');
    g.fillStyle = night;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    ring(true);
    return { img: c, size: half * 2 };
  });
}

/** Bala enemiga (halo + núcleo) en una sola imagen, para dibujar con 'lighter'. */
export function enemyBulletSprite(r) {
  r = Math.round(r);
  return cached(`eb|${r}`, () => {
    const half = r * 2.6;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, half);
    grad.addColorStop(0, rgba('#ff3da8', 0.81));
    grad.addColorStop(0.25, rgba('#ff3da8', 0.4));
    grad.addColorStop(1, rgba('#ff3da8', 0));
    g.fillStyle = grad;
    g.fillRect(-half, -half, half * 2, half * 2);
    g.fillStyle = '#ffe1f3';
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    g.fill();
    return { img: c, size: half * 2 };
  });
}

// Textos flotantes (daño, combos) pre-dibujados: dibujar texto con contorno en cada cuadro es de
// lo más caro del canvas. Caché chica que descarta los más viejos.
const textCache = new Map();
const TEXT_CACHE_MAX = 180;
let probe = null;

/** Texto con contorno oscuro. `px` = tamaño de letra en píxeles de pantalla (ya con dpr). */
export function textSprite(str, color, px) {
  const key = `${str}|${color}|${px}`;
  let s = textCache.get(key);
  if (s) {
    textCache.delete(key);
    textCache.set(key, s);
    return s;
  }
  const font = `800 ${px}px Orbitron, sans-serif`;
  probe ??= makeCanvas(1, 1).getContext('2d');
  probe.font = font;
  const pad = Math.ceil(px * 0.3);
  const w = Math.ceil(probe.measureText(str).width) + pad * 2;
  const h = Math.ceil(px * 1.35) + pad;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, px * 0.24);
  g.strokeStyle = 'rgba(5, 6, 15, 0.85)';
  g.strokeText(str, w / 2, h / 2);
  g.fillStyle = color;
  g.fillText(str, w / 2, h / 2);
  s = { img: c, w, h };
  textCache.set(key, s);
  if (textCache.size > TEXT_CACHE_MAX) textCache.delete(textCache.keys().next().value);
  return s;
}

// ------------------------------------------------------------------ naves del jugador
// Estilo "cartoon" vectorial: cuerpo con degradado, contorno oscuro, alas y aletas de colores,
// cabina de cristal con brillo y varios motores con fuego animado. Todo se dibuja con trazos
// (sin imágenes), simétrico respecto del eje X: la nariz apunta hacia +X.

const OUTLINE = '#130a2b';

/**
 * Diseño de cada nave. Las figuras se definen solo con su mitad superior (y <= 0): se dibujan
 * reflejadas. `r` = radio de redondeo de las esquinas.
 */
const SHIP_ART = {
  spark: {
    pal: { main: '#47d6ff', dark: '#1866b4', light: '#c9f6ff', accent: '#ffd23d', glass: '#a5f7ff' },
    wings: [{ pts: [[6, -6], [-5, -21], [-13, -21], [-11, -7]], r: 3 }],
    fins: [{ pts: [[-8, -6], [-17, -12], [-19, -9], [-14, -4]], r: 2, accent: true }],
    hull: { pts: [[28, 0], [15, -5], [2, -8], [-10, -7], [-16, -4], [-16, 0]], r: 4 },
    stripe: [[18, -2], [-8, -4]],
    panel: -4,
    engines: [[-16, 0, 5]],
    cockpit: { x: 9, rx: 7, ry: 3.6 },
    lights: [[-9, -20]]
  },
  vanguard: {
    pal: { main: '#62e48c', dark: '#1f7a50', light: '#d6ffe4', accent: '#ffcf4d', glass: '#9ff6ff' },
    wings: [
      { pts: [[6, -9], [0, -23], [-12, -25], [-15, -10]], r: 4 },
      { pts: [[1, -21], [-13, -22], [-14, -28], [-1, -26]], r: 2, accent: true }
    ],
    fins: [{ pts: [[-12, -9], [-20, -14], [-21, -10], [-16, -6]], r: 2, accent: true }],
    cannons: [[12, -17, 12, 2.4]],
    hull: { pts: [[26, 0], [18, -7], [6, -11], [-8, -12], [-17, -8], [-19, 0]], r: 5 },
    nose: 19,
    stripe: [[16, -3], [-10, -6]],
    panel: -6,
    engines: [[-19, -5, 4.5], [-19, 5, 4.5]],
    cockpit: { x: 9, rx: 6.5, ry: 4.4 },
    lights: [[-7, -27]]
  },
  phantom: {
    pal: { main: '#b977ff', dark: '#4f22a0', light: '#efdcff', accent: '#ff4dd2', glass: '#86f0ff' },
    wings: [
      { pts: [[6, -5], [-14, -25], [-21, -25], [-14, -6]], r: 2.5 },
      { pts: [[16, -4], [10, -12], [6, -11], [8, -5]], r: 1.5, accent: true }
    ],
    fins: [{ pts: [[-14, -5], [-21, -9], [-22, -6], [-18, -3]], r: 1.5, accent: true }],
    hull: { pts: [[31, 0], [17, -4], [1, -6], [-12, -5], [-19, -2], [-19, 0]], r: 3 },
    nose: 24,
    stripe: [[22, -1.5], [-12, -3]],
    panel: -6,
    engines: [[-19, 0, 4.5], [-15, -15, 3], [-15, 15, 3]],
    cockpit: { x: 12, rx: 9, ry: 3 },
    lights: [[-19, -24], [9, -11]]
  },
  tempest: {
    pal: { main: '#4fb0ff', dark: '#1a45a6', light: '#d9f1ff', accent: '#9cf6ff', glass: '#ecfdff' },
    wings: [
      { pts: [[8, -8], [20, -17], [14, -20], [-2, -13]], r: 2.5 },
      { pts: [[-3, -9], [-15, -23], [-21, -19], [-14, -7]], r: 3 }
    ],
    fins: [{ pts: [[-11, -6], [-19, -10], [-20, -7], [-15, -3]], r: 1.5, accent: true }],
    hull: { pts: [[27, 0], [15, -6], [1, -9], [-11, -7], [-17, -3], [-17, 0]], r: 4 },
    stripe: [[18, -2.5], [-9, -5]],
    panel: -5,
    engines: [[-17, -4, 4], [-17, 4, 4]],
    cockpit: { x: 9, rx: 7, ry: 4.2 },
    coils: [[19, -18], [-20, -21]],
    lights: []
  },
  leviathan: {
    pal: { main: '#ffb43a', dark: '#a24c0c', light: '#fff0c9', accent: '#ff4d5e', glass: '#8ff3ff' },
    wings: [
      { pts: [[7, -10], [-3, -25], [-18, -27], [-21, -12]], r: 4 },
      { pts: [[-4, -23], [-16, -24], [-17, -30], [-6, -29]], r: 2, accent: true },
      { pts: [[15, -8], [9, -15], [3, -15], [4, -10]], r: 2, accent: true }
    ],
    fins: [{ pts: [[-15, -10], [-24, -15], [-25, -11], [-20, -7]], r: 2, accent: true }],
    hull: { pts: [[29, 0], [20, -7], [8, -11], [-10, -13], [-21, -9], [-23, 0]], r: 5 },
    nose: 22,
    stripe: [[19, -3.5], [-14, -7]],
    panel: -12,
    plates: [[[2, -10], [-8, -11.5], [-8, -7], [2, -6]]],
    engines: [[-23, 0, 5], [-21, -8, 4], [-21, 8, 4]],
    cockpit: { x: 11, rx: 7.5, ry: 4.6, diamond: true },
    lights: [[-11, -29], [-11, 29]]
  }
};

/** Polígono de esquinas redondeadas (para el look "dibujo animado"). */
function roundPoly(g, pts, r) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  g.beginPath();
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    g.arcTo(p[0], p[1], ...mid(p, q), r);
  }
  g.closePath();
}

/** Contorno completo a partir de la mitad superior de una figura que toca el eje (hull). */
function mirrored(pts) {
  const top = pts.map(([x, y]) => [x, y]);
  const bottom = pts
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [x, -y]);
  return [...top, ...bottom];
}

const flip = (pts) => pts.map(([x, y]) => [x, -y]);

function fillPart(g, pts, r, fill, line = 1.6) {
  roundPoly(g, pts, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = OUTLINE;
  g.stroke();
}

function shipFlames(g, art, color, t, thrust) {
  g.globalCompositeOperation = 'lighter';
  for (const [i, [x, y, s]] of art.engines.entries()) {
    const flick = 0.72 + 0.28 * Math.sin(t * 38 + i * 1.7) * thrust;
    const len = s * (2.6 + 3.2 * thrust) * flick;
    const outer = g.createLinearGradient(x, 0, x - len, 0);
    outer.addColorStop(0, rgba(color, 0.95));
    outer.addColorStop(1, rgba(color, 0));
    g.fillStyle = outer;
    g.beginPath();
    g.moveTo(x + 1, y - s * 0.9);
    g.quadraticCurveTo(x - len * 0.5, y - s * 0.8, x - len, y);
    g.quadraticCurveTo(x - len * 0.5, y + s * 0.8, x + 1, y + s * 0.9);
    g.closePath();
    g.fill();
    const core = g.createLinearGradient(x, 0, x - len * 0.55, 0);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.beginPath();
    g.ellipse(x - len * 0.2, y, len * 0.3, s * 0.42, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

/** Cuerpo fijo de la nave (todo menos el fuego y las luces que titilan). */
function shipBody(g, art, color) {
  const { pal } = art;
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // halo de neón para que la nave se lea sobre cualquier fondo
  g.shadowColor = color;
  g.shadowBlur = 16;
  roundPoly(g, mirrored(art.hull.pts), art.hull.r);
  g.fillStyle = pal.dark;
  g.fill();
  g.shadowBlur = 0;

  // alas y aletas (arriba y reflejadas abajo)
  for (const part of [...art.wings, ...art.fins]) {
    for (const pts of [part.pts, flip(part.pts)]) {
      const ys = pts.map((p) => p[1]);
      const grad = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      const base = part.accent ? pal.accent : pal.main;
      grad.addColorStop(0, part.accent ? base : pal.dark);
      grad.addColorStop(1, base);
      fillPart(g, pts, part.r, grad);
      if (!part.accent) {
        // borde de ataque con brillo
        g.strokeStyle = rgba(pal.light, 0.8);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(pts[0][0] - 1, pts[0][1]);
        g.lineTo(pts[1][0] + 0.5, pts[1][1] + Math.sign(pts[1][1]) * -1);
        g.stroke();
      }
    }
  }

  // cañones en las alas
  for (const [x, y, len, w] of art.cannons ?? []) {
    for (const yy of [y, -y]) {
      roundPoly(g, [[x, yy - w], [x - len, yy - w], [x - len, yy + w], [x, yy + w]], 1.2);
      g.fillStyle = '#3a4060';
      g.fill();
      g.lineWidth = 1.3;
      g.strokeStyle = OUTLINE;
      g.stroke();
      g.fillStyle = pal.accent;
      g.fillRect(x - 2.5, yy - w + 0.6, 2, w * 2 - 1.2);
    }
  }

  // motores (toberas)
  for (const [x, y, s] of art.engines) {
    roundPoly(g, [[x + 6, y - s], [x - 1, y - s * 0.85], [x - 1, y + s * 0.85], [x + 6, y + s]], 1.5);
    g.fillStyle = '#2a2f45';
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = OUTLINE;
    g.stroke();
  }

  // casco principal con volumen: luz arriba, sombra abajo
  const hull = mirrored(art.hull.pts);
  const ys = hull.map((p) => p[1]);
  const hg = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  hg.addColorStop(0, pal.light);
  hg.addColorStop(0.35, pal.main);
  hg.addColorStop(1, pal.dark);
  fillPart(g, hull, art.hull.r, hg, 1.8);

  // punta de color y línea de paneles (recortadas al casco)
  g.save();
  roundPoly(g, hull, art.hull.r);
  g.clip();
  if (art.nose) {
    const ng = g.createLinearGradient(art.nose, -8, art.nose + 10, 8);
    ng.addColorStop(0, pal.accent);
    ng.addColorStop(1, rgba(pal.accent, 0.75));
    g.fillStyle = ng;
    g.fillRect(art.nose, -20, 20, 40);
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(art.nose, -20);
    g.lineTo(art.nose, 20);
    g.stroke();
  }
  if (art.panel !== undefined) {
    g.strokeStyle = rgba(OUTLINE, 0.55);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(art.panel, -20);
    g.lineTo(art.panel, 20);
    g.stroke();
  }
  g.restore();

  // placas de blindaje
  for (const plate of art.plates ?? []) {
    for (const pts of [plate, flip(plate)]) fillPart(g, pts, 1.5, pal.accent, 1.2);
  }

  // franja central de brillo
  if (art.stripe) {
    const [[x1, y1], [x2, y2]] = art.stripe;
    g.strokeStyle = rgba(pal.light, 0.75);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // cabina de cristal con reflejo
  const c = art.cockpit;
  g.beginPath();
  if (c.diamond) {
    g.moveTo(c.x + c.rx, 0);
    g.quadraticCurveTo(c.x, -c.ry * 1.1, c.x - c.rx, 0);
    g.quadraticCurveTo(c.x, c.ry * 1.1, c.x + c.rx, 0);
  } else {
    // gota: punta hacia la nariz, cola redondeada
    g.moveTo(c.x + c.rx, 0);
    g.bezierCurveTo(c.x + c.rx * 0.35, -c.ry * 1.05, c.x - c.rx, -c.ry * 1.1, c.x - c.rx, 0);
    g.bezierCurveTo(c.x - c.rx, c.ry * 1.1, c.x + c.rx * 0.35, c.ry * 1.05, c.x + c.rx, 0);
  }
  const glass = g.createLinearGradient(c.x - c.rx, -c.ry, c.x + c.rx, c.ry);
  glass.addColorStop(0, '#0b2a5c');
  glass.addColorStop(0.55, pal.glass);
  glass.addColorStop(1, '#ffffff');
  g.fillStyle = glass;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = OUTLINE;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(c.x + c.rx * 0.9, 0);
  g.lineTo(c.x - c.rx * 0.7, 0);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(c.x + c.rx * 0.1, -c.ry * 0.42, c.rx * 0.4, c.ry * 0.2, -0.1, 0, Math.PI * 2);
  g.fill();
}

/** Partes animadas encima del cuerpo: bobinas y luces de posición. */
function shipLights(g, art, t) {
  const { pal } = art;
  // bobinas eléctricas (Tempest)
  for (const [x, y] of art.coils ?? []) {
    for (const yy of [y, -y]) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 9 + yy);
      g.fillStyle = rgba(pal.accent, 0.35 * pulse);
      g.beginPath();
      g.arc(x, yy, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, yy, 2.2, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = OUTLINE;
      g.stroke();
    }
  }

  // luces de posición que titilan
  for (const [i, [x, y]] of (art.lights ?? []).entries()) {
    const on = 0.55 + 0.45 * Math.sin(t * 5 + i * 2);
    for (const yy of y === 0 ? [0] : [y, -y]) {
      g.fillStyle = rgba(pal.accent, 0.3 * on);
      g.beginPath();
      g.arc(x, yy, 3.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.accent;
      g.beginPath();
      g.arc(x, yy, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }

}

/** Dibuja la nave en el contexto ya trasladado y rotado (todo con trazos; para el menú). */
export function drawShipShape(g, key, color, t = 0, thrust = 1) {
  const art = SHIP_ART[key] ?? SHIP_ART.spark;
  g.save();
  shipFlames(g, art, color, t, thrust); // el fuego va detrás de todo
  shipBody(g, art, color);
  shipLights(g, art, t);
  g.restore();
}

const SHIP_RES = 3; // la nave del jugador se ve más grande que el resto: más resolución
const SHIP_HALF = 48;

/**
 * Igual que drawShipShape pero con el cuerpo pre-dibujado en una imagen (una sola llamada en vez
 * de decenas de trazos, degradados y un desenfoque por cuadro). Es la que usa el juego.
 */
export function drawShipFast(g, key, color, t = 0, thrust = 1) {
  const art = SHIP_ART[key] ?? SHIP_ART.spark;
  const body = cached(`ship|${key}|${color}`, () => {
    const c = makeCanvas(SHIP_HALF * 2 * SHIP_RES, SHIP_HALF * 2 * SHIP_RES);
    const cg = c.getContext('2d');
    cg.scale(SHIP_RES, SHIP_RES);
    cg.translate(SHIP_HALF, SHIP_HALF);
    shipBody(cg, art, color);
    return c;
  });
  g.save();
  shipFlames(g, art, color, t, thrust);
  g.drawImage(body, -SHIP_HALF, -SHIP_HALF, SHIP_HALF * 2, SHIP_HALF * 2);
  g.lineJoin = 'round';
  shipLights(g, art, t);
  g.restore();
}

export function drawShipPreview(canvas, key, color, t = 0) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  const halo = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  halo.addColorStop(0, rgba(color, 0.35));
  halo.addColorStop(1, rgba(color, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(-Math.PI / 2 + Math.sin(t * 1.3) * 0.08);
  const k = (w / 80) * 1.1;
  g.scale(k, k);
  drawShipShape(g, key, color, t, 0.8);
  g.restore();
}

// ------------------------------------------------------------------ iconos

const ICONS = {
  blaster(g, c) {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(-8 + i * 9, 6 - i * 6, 5, 2.4, -0.6, 0, Math.PI * 2);
      g.fill();
    }
  },
  orbit(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 11, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c;
    for (const a of [0, 2.1, 4.2]) {
      g.beginPath();
      g.arc(Math.cos(a) * 11, Math.sin(a) * 11, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  arc(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-4, -14);
    g.lineTo(5, -3);
    g.lineTo(-3, 1);
    g.lineTo(6, 14);
    g.stroke();
  },
  nova(g, c) {
    g.strokeStyle = c;
    for (const [r, w] of [[13, 1.5], [8.5, 2.5], [4, 3]]) {
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
  },
  missile(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(12, -12);
    g.lineTo(4, 4);
    g.lineTo(-4, -4);
    g.closePath();
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-1, 1);
    g.lineTo(-12, 12);
    g.stroke();
  },
  lance(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-14, 14);
    g.lineTo(14, -14);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(14, -14);
    g.lineTo(6, -12);
    g.lineTo(12, -6);
    g.closePath();
    g.fill();
  },
  might(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(11, 0);
    g.lineTo(4, 0);
    g.lineTo(4, 13);
    g.lineTo(-4, 13);
    g.lineTo(-4, 0);
    g.lineTo(-11, 0);
    g.closePath();
    g.fill();
  },
  haste(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, 12, 0, Math.PI * 2);
    g.moveTo(0, 0);
    g.lineTo(0, -8);
    g.moveTo(0, 0);
    g.lineTo(6, 4);
    g.stroke();
  },
  thrust(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 3;
    for (const y of [-6, 3, 12]) {
      g.beginPath();
      g.moveTo(-10, y + 6);
      g.lineTo(0, y - 4);
      g.lineTo(10, y + 6);
      g.stroke();
    }
  },
  magnet(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 2, 9, Math.PI, 0, true);
    g.lineTo(9, -10);
    g.moveTo(-9, 2);
    g.lineTo(-9, -10);
    g.stroke();
  },
  hull(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(12, -8);
    g.lineTo(10, 6);
    g.lineTo(0, 14);
    g.lineTo(-10, 6);
    g.lineTo(-12, -8);
    g.closePath();
    g.fill();
  },
  repair(g, c) {
    g.fillStyle = c;
    g.fillRect(-4, -13, 8, 26);
    g.fillRect(-13, -4, 26, 8);
  },
  crit(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.moveTo(0, -15);
    g.lineTo(0, -5);
    g.moveTo(0, 15);
    g.lineTo(0, 5);
    g.moveTo(-15, 0);
    g.lineTo(-5, 0);
    g.moveTo(15, 0);
    g.lineTo(5, 0);
    g.stroke();
  },
  area(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.strokeRect(-5, -5, 10, 10);
    g.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      g.moveTo(sx * 8, sy * 8);
      g.lineTo(sx * 14, sy * 14);
      g.lineTo(sx * 14, sy * 8);
      g.moveTo(sx * 14, sy * 14);
      g.lineTo(sx * 8, sy * 14);
    }
    g.stroke();
  },
  multi(g, c) {
    g.fillStyle = c;
    for (const a of [-0.5, 0, 0.5]) {
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -15);
      g.lineTo(4, -6);
      g.lineTo(-4, -6);
      g.closePath();
      g.fill();
      g.fillRect(-1.5, -6, 3, 16);
      g.restore();
    }
  },
  growth(g, c) {
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const y = -14 + i * 1.4;
      const x = Math.sin(i * 0.6) * 8;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const y = -14 + i * 1.4;
      const x = -Math.sin(i * 0.6) * 8;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  },
  fortune(g, c) {
    g.fillStyle = c;
    polygon(g, 6, 13, 0);
    g.fill();
    g.fillStyle = '#1a1200';
    polygon(g, 6, 6, 0);
    g.fill();
  },
  repairKit(g, c) {
    ICONS.repair(g, c);
  },
  cache(g, c) {
    ICONS.fortune(g, c);
  }
};

export function iconCanvas(id, color, px = 64) {
  return cached(`icon|${id}|${color}|${px}`, () => {
    const c = makeCanvas(px, px);
    const g = c.getContext('2d');
    g.translate(px / 2, px / 2);
    g.scale(px / 40, px / 40);
    g.shadowColor = color;
    g.shadowBlur = 8;
    (ICONS[id] ?? ICONS.might)(g, color);
    return c;
  });
}

/** Copia independiente de un ícono para insertarla en el DOM (el caché comparte un solo canvas por ícono). */
export function iconCopy(id, color, px = 64) {
  const src = iconCanvas(id, color, px);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

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

/** Halo radial suave, para dibujar con 'lighter'. Devuelve { img, size } (size en unidades de mundo). */
export function glow(color, radius, strength = 1) {
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

/** Sprite de enemigo: silueta oscura con borde de neón, núcleo brillante y halo. */
export function enemySprite(shape, color, r, flash = false, elite = false) {
  return cached(`en|${shape}|${color}|${r}|${flash}|${elite}`, () => {
    const pad = r * 0.9 + 10;
    const half = r * 1.35 + pad;
    const c = makeCanvas(half * 2 * RES, half * 2 * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(half, half);
    const fill = flash ? '#ffffff' : '#0b0716';
    g.shadowColor = color;
    g.shadowBlur = elite ? 26 : 16;
    enemyPath(g, shape, r);
    g.fillStyle = fill;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = Math.max(2, r * 0.16);
    g.strokeStyle = flash ? '#ffffff' : color;
    g.lineJoin = 'round';
    g.stroke();
    if (!flash) {
      // núcleo
      const core = g.createRadialGradient(r * 0.1, 0, 0, r * 0.1, 0, r * 0.55);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.3, color);
      core.addColorStop(1, rgba(color, 0));
      g.fillStyle = core;
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.arc(r * 0.1, 0, r * 0.55, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      if (shape === 'boss') {
        g.strokeStyle = rgba(color, 0.8);
        g.lineWidth = 3;
        polygon(g, 6, r * 0.62, 0);
        g.stroke();
        polygon(g, 3, r * 0.42, Math.PI / 2);
        g.stroke();
      }
      if (shape === 'square') {
        g.strokeStyle = rgba(color, 0.55);
        g.lineWidth = 2;
        g.strokeRect(-r * 0.5, -r * 0.5, r, r);
      }
      if (elite) {
        g.strokeStyle = '#fff3c4';
        g.lineWidth = 1.5;
        enemyPath(g, shape, r * 1.18);
        g.setLineDash([4, 5]);
        g.stroke();
      }
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

// ------------------------------------------------------------------ naves del jugador

const SHIP_PATHS = {
  spark: [[24, 0], [-14, 15], [-6, 5], [-12, 0], [-6, -5], [-14, -15]],
  vanguard: [[22, 0], [6, 9], [-4, 18], [-16, 14], [-10, 5], [-14, 0], [-10, -5], [-16, -14], [-4, -18], [6, -9]],
  phantom: [[28, 0], [-4, 6], [-18, 20], [-10, 4], [-16, 0], [-10, -4], [-18, -20], [-4, -6]],
  tempest: [[24, 0], [10, 5], [16, 14], [-2, 10], [-14, 16], [-8, 0], [-14, -16], [-2, -10], [16, -14], [10, -5]],
  leviathan: [[26, 0], [14, 8], [10, 18], [-14, 20], [-10, 8], [-18, 0], [-10, -8], [-14, -20], [10, -18], [14, -8]]
};

/** Dibuja la nave en el contexto ya trasladado y rotado. */
export function drawShipShape(g, key, color, t = 0, thrust = 1) {
  const pts = SHIP_PATHS[key] ?? SHIP_PATHS.spark;
  // llama del motor
  const flick = 0.75 + 0.25 * Math.sin(t * 40) * thrust;
  const flame = g.createLinearGradient(-12, 0, -12 - 26 * flick, 0);
  flame.addColorStop(0, rgba(color, 0.95));
  flame.addColorStop(1, rgba(color, 0));
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = flame;
  g.beginPath();
  g.moveTo(-10, -5);
  g.lineTo(-12 - 26 * flick * (0.6 + thrust * 0.4), 0);
  g.lineTo(-10, 5);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'source-over';

  g.shadowColor = color;
  g.shadowBlur = 18;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const body = g.createLinearGradient(-16, -16, 20, 16);
  body.addColorStop(0, '#0d1428');
  body.addColorStop(1, '#1d2950');
  g.fillStyle = body;
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.stroke();
  // cabina
  g.fillStyle = '#ffffff';
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.beginPath();
  g.ellipse(6, 0, 5, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
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

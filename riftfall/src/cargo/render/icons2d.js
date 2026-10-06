// Dibuja un ícono de ICONS en un canvas 2D (para las texturas).
import { ICONS } from '../icons.js';

const paths = new Map();

export function drawIcon(g, name, x, y, size, lineWidth = 2.2) {
  if (!paths.has(name)) paths.set(name, new Path2D(ICONS[name]));
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.lineWidth = lineWidth;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(paths.get(name));
  g.restore();
}

export const drawCargoIcon = (g, cargo, x, y, size) => drawIcon(g, cargo, x, y, size, 2.6);

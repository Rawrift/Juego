// Entrada: teclado, joystick táctil flotante y mando. Se cuantiza a 32 direcciones
// (lo mismo que graba la partida y re-simula el servidor).

import { DIR_COUNT } from '../sim/index.js';

export function createInput({ surface, joystick }) {
  const keys = new Set();
  const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let enabled = false;
  const knob = joystick.querySelector('i');

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyZ: 'up', KeyQ: 'left'
  };

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      keys.add(k);
      if (enabled) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  surface.addEventListener(
    'touchstart',
    (e) => {
      if (!enabled || touch.id !== null) return;
      const t = e.changedTouches[0];
      touch.id = t.identifier;
      touch.ox = touch.x = t.clientX;
      touch.oy = touch.y = t.clientY;
      joystick.style.left = `${t.clientX}px`;
      joystick.style.top = `${t.clientY}px`;
      joystick.classList.remove('hidden');
      knob.style.transform = 'translate(0px, 0px)';
      e.preventDefault();
    },
    { passive: false }
  );
  surface.addEventListener(
    'touchmove',
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touch.id) continue;
        touch.x = t.clientX;
        touch.y = t.clientY;
        let dx = touch.x - touch.ox;
        let dy = touch.y - touch.oy;
        const d = Math.hypot(dx, dy);
        if (d > 46) {
          dx = (dx / d) * 46;
          dy = (dy / d) * 46;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      e.preventDefault();
    },
    { passive: false }
  );
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.id) continue;
      touch.id = null;
      joystick.classList.add('hidden');
    }
  };
  surface.addEventListener('touchend', endTouch);
  surface.addEventListener('touchcancel', endTouch);

  function vector() {
    let dx = 0;
    let dy = 0;
    if (keys.has('up')) dy -= 1;
    if (keys.has('down')) dy += 1;
    if (keys.has('left')) dx -= 1;
    if (keys.has('right')) dx += 1;
    if (touch.id !== null) {
      const tx = touch.x - touch.ox;
      const ty = touch.y - touch.oy;
      if (Math.hypot(tx, ty) > 12) {
        dx = tx;
        dy = ty;
      }
    }
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.3) {
        dx = ax;
        dy = ay;
      }
    }
    return [dx, dy];
  }

  return {
    /** Dirección actual: 0 = quieto, 1..32 = dirección cuantizada. */
    dir() {
      const [dx, dy] = vector();
      if (dx === 0 && dy === 0) return 0;
      const step = (Math.PI * 2) / DIR_COUNT;
      let k = Math.round(Math.atan2(dy, dx) / step);
      k = ((k % DIR_COUNT) + DIR_COUNT) % DIR_COUNT;
      return k + 1;
    },
    setEnabled(v) {
      enabled = v;
      if (!v) {
        touch.id = null;
        joystick.classList.add('hidden');
      }
    },
    clear() {
      keys.clear();
    }
  };
}

// Sonidos cortos hechos con Web Audio (sin archivos): clic, envío, cobro y subida de nivel.

const KEY = 'riftcargo.mute';

export function createAudio() {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch {}

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, len, { type = 'sine', vol = 0.08, slide = 0 } = {}) {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + start;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + len);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  }

  const SOUNDS = {
    click: () => tone(880, 0, 0.05, { type: 'triangle', vol: 0.03 }),
    send: () => { tone(300, 0, 0.35, { type: 'sine', vol: 0.06, slide: 2.6 }); tone(620, 0.08, 0.25, { type: 'triangle', vol: 0.03, slide: 1.8 }); },
    coin: () => { tone(988, 0, 0.12, { type: 'triangle', vol: 0.06 }); tone(1319, 0.08, 0.25, { type: 'triangle', vol: 0.06 }); },
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'triangle', vol: 0.06 }))
  };

  return {
    get muted() { return muted; },
    play(k) {
      if (muted) return;
      try { SOUNDS[k]?.(); } catch {}
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
    }
  };
}

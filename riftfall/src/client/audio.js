// Audio 100% sintetizado con WebAudio: efectos con límite de frecuencia y una pista synthwave
// generativa que se intensifica durante la partida y en los jefes.

export function createAudio() {
  let ac = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let muted = false;
  try {
    muted = localStorage.getItem('riftfall.muted') === '1';
  } catch {
    muted = false;
  }
  const last = {};
  let pickupCombo = 0;
  let pickupAt = 0;
  const music = { on: false, step: 0, next: 0, intensity: 0, timer: null };

  function ensure() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function throttle(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now;
    return true;
  }

  function tone({ type = 'sine', f0, f1 = f0, dur = 0.12, vol = 0.3, at = 0, bus = sfxBus, attack = 0.005 }) {
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.15, vol = 0.3, f0 = 2000, f1 = f0, q = 1, type = 'bandpass', at = 0, bus = sfxBus }) {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ac.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    shot() {
      if (!throttle('shot', 70)) return;
      tone({ type: 'square', f0: 1200, f1: 500, dur: 0.06, vol: 0.05 });
    },
    missile() {
      if (!throttle('missile', 120)) return;
      noise({ dur: 0.25, vol: 0.12, f0: 600, f1: 2400, q: 2 });
    },
    hit() {
      if (!throttle('hit', 45)) return;
      noise({ dur: 0.05, vol: 0.09, f0: 3500, q: 3 });
    },
    kill(big) {
      if (!throttle(big ? 'killbig' : 'kill', big ? 0 : 55)) return;
      tone({ type: 'triangle', f0: big ? 160 : 260, f1: 50, dur: big ? 0.5 : 0.14, vol: big ? 0.5 : 0.16 });
      noise({ dur: big ? 0.6 : 0.12, vol: big ? 0.35 : 0.1, f0: big ? 900 : 1600, f1: 200, q: 0.8, type: 'lowpass' });
    },
    pickup() {
      const now = performance.now();
      pickupCombo = now - pickupAt < 400 ? Math.min(pickupCombo + 1, 24) : 0;
      pickupAt = now;
      if (!throttle('pickup', 35)) return;
      const f = 660 * Math.pow(2, (pickupCombo % 25) / 24);
      tone({ type: 'sine', f0: f, f1: f * 1.5, dur: 0.08, vol: 0.07 });
    },
    shard() {
      tone({ type: 'sine', f0: 1318, dur: 0.35, vol: 0.12 });
      tone({ type: 'sine', f0: 1975, dur: 0.45, vol: 0.09, at: 0.06 });
      tone({ type: 'triangle', f0: 2637, dur: 0.5, vol: 0.05, at: 0.12 });
    },
    heal() {
      tone({ type: 'sine', f0: 440, f1: 880, dur: 0.3, vol: 0.12 });
    },
    levelup() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.16, vol: 0.06, at: i * 0.07 }));
      tone({ type: 'sine', f0: 1568, dur: 0.6, vol: 0.08, at: 0.28 });
    },
    choose() {
      tone({ type: 'triangle', f0: 880, f1: 1760, dur: 0.12, vol: 0.1 });
    },
    hurt() {
      if (!throttle('hurt', 120)) return;
      tone({ type: 'sawtooth', f0: 180, f1: 60, dur: 0.25, vol: 0.18 });
      noise({ dur: 0.2, vol: 0.15, f0: 500, q: 1, type: 'lowpass' });
    },
    nova() {
      noise({ dur: 0.45, vol: 0.14, f0: 300, f1: 3000, q: 1.5 });
    },
    arc() {
      if (!throttle('arc', 80)) return;
      noise({ dur: 0.12, vol: 0.12, f0: 5000, q: 6 });
      tone({ type: 'sawtooth', f0: 90, f1: 60, dur: 0.1, vol: 0.06 });
    },
    lance() {
      tone({ type: 'sawtooth', f0: 220, f1: 880, dur: 0.25, vol: 0.08 });
      noise({ dur: 0.3, vol: 0.08, f0: 2000, f1: 6000, q: 4 });
    },
    explode() {
      if (!throttle('explode', 60)) return;
      noise({ dur: 0.35, vol: 0.18, f0: 1200, f1: 120, q: 0.7, type: 'lowpass' });
    },
    warning() {
      for (let i = 0; i < 3; i++) {
        tone({ type: 'sawtooth', f0: 440, f1: 660, dur: 0.3, vol: 0.12, at: i * 0.45 });
        tone({ type: 'sawtooth', f0: 660, f1: 440, dur: 0.15, vol: 0.1, at: i * 0.45 + 0.3 });
      }
    },
    bomb() {
      tone({ type: 'sine', f0: 120, f1: 30, dur: 1, vol: 0.5 });
      noise({ dur: 1, vol: 0.4, f0: 3000, f1: 100, q: 0.5, type: 'lowpass' });
    },
    victory() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.4, vol: 0.07, at: i * 0.12 }));
    },
    defeat() {
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.45, vol: 0.12, at: i * 0.18 }));
    },
    click() {
      tone({ type: 'triangle', f0: 1400, dur: 0.04, vol: 0.06 });
    }
  };

  // ------------------------------------------------------------- música generativa

  const BPM = 112;
  const STEP = 60 / BPM / 4;
  const PROG = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]]; // Am F G Em
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = PROG[bar];
    const it = music.intensity;
    // bajo
    if (s % 2 === 0) {
      const o = ac.createOscillator();
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midi(chord[0] - 12 + (s % 8 === 6 ? 12 : 0));
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400 + it * 900, t);
      f.frequency.exponentialRampToValueAtTime(140, t + STEP * 1.8);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.9);
      o.connect(f).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + STEP * 2);
    }
    // arpegio
    if (it > 0.2) {
      const n = chord[[0, 1, 2, 3, 2, 1, 3, 2][s % 8]] + 12;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = midi(n);
      g.gain.setValueAtTime(0.035 * Math.min(1, it), t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + STEP * 0.9);
      o.connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + STEP);
    }
    // pad al inicio de cada compás
    if (s === 0) {
      for (const n of chord.slice(1)) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = (Math.random() - 0.5) * 12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + STEP * 16);
        o.connect(g).connect(musicBus);
        o.start(t);
        o.stop(t + STEP * 16 + 0.05);
      }
    }
    // batería
    if (it > 0.45) {
      if (s % 4 === 0) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(musicBus);
        o.start(t);
        o.stop(t + 0.2);
      }
      if (s % 2 === 1) noise({ dur: 0.04, vol: 0.05, f0: 9000, q: 1, type: 'highpass', at: t - ac.currentTime, bus: musicBus });
      if (s % 8 === 4) noise({ dur: 0.16, vol: 0.14, f0: 1800, q: 0.8, at: t - ac.currentTime, bus: musicBus });
    }
  }

  function musicLoop() {
    if (!music.on) return;
    while (music.next < ac.currentTime + 0.15) {
      scheduleStep(music.step++, music.next);
      music.next += STEP;
    }
  }

  return {
    unlock() {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
    },
    play(name, arg) {
      if (!ac || muted) return;
      SFX[name]?.(arg);
    },
    event(ev) {
      if (!ac || muted) return;
      switch (ev.t) {
        case 'shot': return ev.w === 'missile' ? SFX.missile() : SFX.shot();
        case 'hit': return SFX.hit();
        case 'kill': return SFX.kill(ev.boss || ev.elite);
        case 'pickup':
          if (ev.kind === 'gem') return SFX.pickup();
          if (ev.kind === 'shard') return SFX.shard();
          if (ev.kind === 'heal') return SFX.heal();
          if (ev.kind === 'bomb') return SFX.bomb();
          return SFX.heal();
        case 'levelup': return SFX.levelup();
        case 'chest':
          SFX.shard();
          return SFX.levelup();
        case 'evolve': return SFX.victory();
        case 'combo': return SFX.shard();
        case 'hurt': return SFX.hurt();
        case 'nova': return SFX.nova();
        case 'arc': return SFX.arc();
        case 'lance': return SFX.lance();
        case 'explode': return SFX.explode();
        case 'warning': return SFX.warning();
        case 'victory': return SFX.victory();
        case 'dead': return SFX.defeat();
        default:
      }
    },
    startMusic() {
      if (!ensure() || music.on) return;
      music.on = true;
      music.next = ac.currentTime + 0.1;
      music.timer = setInterval(musicLoop, 50);
    },
    setIntensity(v) {
      music.intensity = v;
    },
    /** Pausa todo el sonido (por ejemplo, mientras se ve un anuncio). */
    suspend(v) {
      if (!ac) return;
      if (v) ac.suspend();
      else ac.resume();
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem('riftfall.muted', muted ? '1' : '0');
      } catch {
        /* sin almacenamiento */
      }
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    get muted() {
      return muted;
    }
  };
}

// Planetas con texturas procedurales (ruido 3D sobre la esfera, sin costuras), en tonos claros para
// que combinen con el estilo de la interfaz. Se generan una vez la primera vez que se abre el mapa.

import * as THREE from 'three';

function noise3(seed) {
  const p = new Uint8Array(512);
  let s = seed >>> 0 || 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const v = new Float32Array(256).map(() => rnd());
  const f = (t) => t * t * (3 - 2 * t);
  const H = (x, y, z) => v[p[p[p[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = f(xf), w = f(yf), q = f(zf);
    const l = (a, b, k) => a + (b - a) * k;
    return l(
      l(l(H(xi, yi, zi), H(xi + 1, yi, zi), u), l(H(xi, yi + 1, zi), H(xi + 1, yi + 1, zi), u), w),
      l(l(H(xi, yi, zi + 1), H(xi + 1, yi, zi + 1), u), l(H(xi, yi + 1, zi + 1), H(xi + 1, yi + 1, zi + 1), u), w),
      q
    );
  };
}

function fbm(n, x, y, z, oct = 5) {
  let a = 0.5, s = 0, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f, y * f, z * f);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

const hexRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
function ramp(stops, k) {
  k = Math.max(0, Math.min(1, k));
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) {
      const [k0, c0] = stops[i - 1];
      const [k1, c1] = stops[i];
      const t = (k - k0) / (k1 - k0 || 1);
      const a = hexRgb(c0), b = hexRgb(c1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return hexRgb(stops[stops.length - 1][1]);
}

/** Recorre la textura equirectangular y llama a `fn(x, y, z, lat)` por píxel; devuelve [r,g,b,a]. */
function paint(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      const col = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat);
      const o = (j * w + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = col[3] ?? 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const W = 512, H = 256;

const STYLES = {
  kepa(n) {
    return {
      map: paint(W, H, (x, y, z, lat) => {
        const a = fbm(n, x * 2.2 + 3, y * 2.2, z * 2.2);
        const crack = Math.abs(fbm(n, x * 4 + 9, y * 4, z * 4, 4) - 0.5);
        let c = ramp([[0, 0x9cc6f2], [0.45, 0xd8eaff], [0.7, 0xf6fbff], [1, 0xffffff]], a + Math.abs(lat) * 0.25);
        if (crack < 0.018) c = ramp([[0, 0x6c9fe0], [1, 0x9cc6f2]], crack / 0.018);
        return c;
      }),
      rough: 0.6
    };
  },
  ferra(n) {
    return {
      map: paint(W, H, (x, y, z) => {
        const a = fbm(n, x * 2.5, y * 2.5, z * 2.5);
        const b = fbm(n, x * 7 + 4, y * 7, z * 7, 3);
        // Cráteres: pozos donde el ruido de alta frecuencia baja mucho.
        const crater = Math.max(0, 0.36 - b) * 3;
        return ramp([[0, 0xb4532a], [0.4, 0xe07a43], [0.65, 0xf3a874], [1, 0xffd9b5]], a * 1.1 - crater * 0.5 + 0.05);
      }),
      rough: 0.85
    };
  },
  vesta(n) {
    return {
      map: paint(W, H, (x, y, z, lat) => {
        const a = fbm(n, x * 1.8 + 1, y * 1.8, z * 1.8);
        const pole = Math.abs(lat) > 1.15 ? 1 : 0;
        if (pole) return [244, 249, 255];
        if (a < 0.5) return ramp([[0, 0x2f79c8], [0.42, 0x4f9fe6], [0.5, 0x86cdf2]], a);
        if (a < 0.53) return ramp([[0, 0xf1e4b0], [1, 0xd9cf95]], (a - 0.5) / 0.03);
        return ramp([[0, 0x6ccf93], [0.6, 0x45ad74], [1, 0x2f8a5c]], (a - 0.53) / 0.25);
      }),
      clouds: paint(W, H, (x, y, z) => {
        const c = fbm(n, x * 3 + 7, y * 5, z * 3);
        const k = Math.max(0, Math.min(1, (c - 0.52) / 0.16));
        return [255, 255, 255, k * 235];
      }),
      rough: 0.7,
      atmo: 0x9fd1ff
    };
  },
  nimbus(n) {
    return {
      map: paint(W, H, (x, y, z, lat) => {
        const turb = fbm(n, x * 3, y * 3, z * 3) - 0.5;
        const band = Math.sin((lat + turb * 0.18) * 9) * 0.5 + 0.5;
        const fine = fbm(n, x * 1 + 2, y * 14, z * 1, 3);
        let c = ramp([[0, 0xb08ae0], [0.3, 0xd7a6e0], [0.55, 0xf6d9c4], [0.8, 0xf9ecdc], [1, 0xe9b98f]], band * 0.75 + fine * 0.35);
        // Gran tormenta ovalada.
        const lon = Math.atan2(z, x);
        const d = Math.hypot((lon - 1.0) * 1.0, (lat + 0.32) * 2.6);
        if (d < 0.32) c = ramp([[0, 0xe58aa8], [0.6, 0xf0b4c4], [1, ((c[0] | 0) << 16) | ((c[1] | 0) << 8) | (c[2] | 0)]], d / 0.32);
        return c;
      }),
      rough: 0.75,
      rings: true
    };
  },
  forja(n) {
    let lava;
    const map = paint(W, H, (x, y, z) => {
      const a = fbm(n, x * 3, y * 3, z * 3);
      return ramp([[0, 0x2f2a40], [0.5, 0x4d4360], [1, 0x7a6578]], a);
    });
    lava = paint(W, H, (x, y, z) => {
      const r = Math.abs(fbm(n, x * 3.4 + 5, y * 3.4, z * 3.4, 4) - 0.5);
      const k = Math.max(0, 1 - r / 0.04);
      return [255 * k, 120 * k, 40 * k];
    });
    return { map, emissive: lava, rough: 0.8 };
  }
};

const SEEDS = { kepa: 11, ferra: 23, vesta: 37, nimbus: 41, forja: 53 };
const built = new Map();

/** Planeta listo para usar: grupo con la esfera (userData.body) y sus capas. */
export function makePlanet(id, radius) {
  if (!built.has(id)) built.set(id, STYLES[id](noise3(SEEDS[id])));
  const st = built.get(id);
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 72, 48);
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: st.map, roughness: st.rough, metalness: 0,
    emissive: st.emissive ? 0xffffff : 0x000000, emissiveMap: st.emissive ?? null, emissiveIntensity: st.emissive ? 1.6 : 0
  }));
  body.castShadow = true;
  body.receiveShadow = false;
  g.add(body);
  g.userData.body = body;
  if (st.clouds) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.025, 64, 40), new THREE.MeshStandardMaterial({ map: st.clouds, transparent: true, depthWrite: false, roughness: 1 }));
    cl.userData.treatAsOpaque = false;
    g.add(cl);
    g.userData.clouds = cl;
  }
  if (st.atmo) g.add(atmosphere(radius * 1.08, st.atmo));
  if (st.rings) g.add(rings(radius));
  return g;
}

function atmosphere(r, color) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vec3(0.0,0.0,1.0))), 2.6); gl_FragColor = vec4(uColor, f * 0.75); }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), m);
  mesh.userData.cannotReceiveAO = true;
  return mesh;
}

function rings(r) {
  const inner = r * 1.35;
  const outer = r * 2.15;
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const k = x / 512;
    const a = (0.35 + 0.65 * Math.abs(Math.sin(k * 23) * Math.sin(k * 7.3 + 1))) * Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
    const gap = Math.abs(k - 0.62) < 0.035 ? 0.1 : 1;
    g.fillStyle = `rgba(${235 - k * 40},${215 - k * 30},${240 - k * 10},${a * gap})`;
    g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false }));
  m.rotation.x = -Math.PI / 2 + 0.38;
  m.rotation.y = 0.2;
  m.receiveShadow = true;
  return m;
}

/** El sol: esfera animada cálida con un halo suave. */
export function makeSun(radius) {
  const g = new THREE.Group();
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 p = normalize(vP) * 3.0;
        float g = n(p + uTime * 0.15) * 0.6 + n(p * 2.3 - uTime * 0.1) * 0.4;
        float rim = pow(1.0 - abs(vN.z), 1.5);
        vec3 col = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.66, 0.25), g * 0.7 + rim * 0.6);
        gl_FragColor = vec4(col * 1.25, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), m);
  body.userData.cannotReceiveAO = true;
  g.add(body);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,214,120,0.75)');
  grd.addColorStop(0.35, 'rgba(255,190,110,0.32)');
  grd.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  halo.scale.setScalar(radius * 6.5);
  g.add(halo);
  g.userData.material = m;
  return g;
}

// Colores de Rift Cargo, con la identidad de RIFTFALL: espacio oscuro, estructuras de acero pálido y
// acentos de neón cian, magenta, violeta y dorado. Los colores de carga se usan igual en 3D y en la UI.

export const C = {
  // Piso y estructura de la estación.
  deck: 0x1b2046,
  deckLine: 0x2c3570,
  deckSide: 0x262d5c,
  deckDark: 0x131735,
  // "Blanco" = acero pálido (cascos, barandas, torre); "wall" = paredes oscuras del depósito.
  white: 0xb0bbe4,
  offWhite: 0xa9b4de,
  wall: 0x2b3266,
  roof: 0x323b78,
  roofDark: 0x232a5a,
  // Acentos de marca.
  blue: 0x4de8ff, // cian Rift
  blueDark: 0x22a9d6,
  blueSoft: 0x7fa0ff,
  magenta: 0xff4dd2,
  violet: 0x9d6bff,
  navy: 0x10142f,
  steel: 0x5c6699,
  steelLight: 0x8f9ac8,
  yellow: 0xffc94d, // dorado (drones)
  yellowDark: 0xd99a1f,
  orange: 0xff9a3d,
  glass: 0x0a0d26,
  glow: 0x4de8ff,
  red: 0xff4d6a,
  green: 0x4dff9a,
  // Fondo: nubes nocturnas del planeta, con auroras de la grieta.
  cloud: 0x2b3170,
  cloudShade: 0x141936,
  sky: 0x0a0d24
};

/** Colores por tipo de carga (también en styles.css como --c-<id>). */
export const CARGO_COLORS = {
  agua: 0x35b8ff,
  mineral: 0xff9440,
  alimentos: 0x3ddc8a,
  combustible: 0x9d6bff,
  piezas: 0xff4dd2
};

/** Librea de cada modelo de nave (color de acento). */
export const LIVERY = {
  colibri: 0x4de8ff,
  mula: 0xff4dd2,
  titan: 0xffc94d
};

export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Pinturas compradas (estéticos). `rift` usa los colores de cada modelo (LIVERY). Las demás pintan el
 * casco (`hull`), los detalles oscuros (`dark`) y el acento (`accent`; `neon` si las luces van de otro color).
 */
export const LIVERY_LOOKS = {
  rift: null,
  carbono: { accent: 0x4dff9a, hull: 0x2b3040, rough: 0.28, metal: 0.6, dark: 0x0e1016 },
  aurora: { accent: 0x9d6bff, neon: 0x4de8ff, hull: 0x86dccf, rough: 0.34, metal: 0.2, dark: 0x1a2748 },
  solar: { accent: 0xff7a2a, hull: 0xeee4d4, rough: 0.4, metal: 0.15, dark: 0x3a2416 },
  fundador: { accent: 0xffd877, neon: 0xfff0b8, hull: 0xd6a33c, rough: 0.24, metal: 0.85, dark: 0x2b1e08 },
  prisma: { accent: 0xff4dd2, neon: 0x4de8ff, hull: 0xd9d3ff, rough: 0.18, metal: 0.7, dark: 0x1d1640 }
};

/** Color de la llama de los motores: [llama, halo, brillo de la tobera]. */
export const TRAIL_COLORS = {
  cian: [0x59bfff, 0x7fe8ff, 0x9ff3ff],
  magenta: [0xff4dd2, 0xff7fe0, 0xffa8ec],
  verde: [0x4dff9a, 0x7fffb5, 0xa8ffd0],
  violeta: [0x9d6bff, 0xb89aff, 0xd0bdff],
  dorado: [0xffb43d, 0xffd27f, 0xffe2a8]
};

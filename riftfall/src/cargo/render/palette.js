// Colores de Rift Cargo. Estilo claro y limpio: blancos, celeste lavanda, azul de marca y amarillo
// de los drones (los "montacargas" de la estación). Los colores de carga se usan igual en 3D y en la UI.

export const C = {
  deck: 0xe8ecf9,
  deckLine: 0xd9dff2,
  deckSide: 0xc9d1ec,
  deckDark: 0xb7c1e2,
  white: 0xf7f8fc,
  offWhite: 0xeef1f9,
  wall: 0xf3f5fb,
  roof: 0xc9d6fb,
  roofDark: 0xaebff3,
  blue: 0x2f5fe8,
  blueDark: 0x2247b8,
  blueSoft: 0x8fa8f4,
  navy: 0x1d2a55,
  steel: 0x5b6684,
  steelLight: 0xa9b3cc,
  yellow: 0xf6b52a,
  yellowDark: 0xd9961a,
  orange: 0xf39237,
  glass: 0x18223f,
  glow: 0x6fd6ff,
  red: 0xf0525e,
  green: 0x38c172,
  cloud: 0xf4f7ff,
  cloudShade: 0xcdd6f1,
  sky: 0xdfe6f8
};

/** Colores por tipo de carga (también en styles.css como --c-<id>). */
export const CARGO_COLORS = {
  agua: 0x3d8ef0,
  mineral: 0xf0873a,
  alimentos: 0x34b47a,
  combustible: 0x8a63e8,
  piezas: 0xe8577a
};

export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

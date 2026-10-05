// Matemática determinista para la simulación.
// Las operaciones IEEE-754 básicas (+ - * / sqrt floor) dan el mismo resultado en todos los
// motores JS, pero las funciones trigonométricas y exponenciales de Math NO están garantizadas
// bit a bit entre navegadores.
// Como el servidor re-simula cada partida para verificarla, la simulación solo usa estas funciones.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

export function dsin(x) {
  x = x - TAU * Math.floor((x + PI) / TAU); // [-PI, PI)
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))));
}

export function dcos(x) {
  return dsin(x + HALF_PI);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

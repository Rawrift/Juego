// Identificador público de un jugador en los rankings: un resumen de su id secreto, que no sirve
// para hacerse pasar por él. Funciona igual en Node, en el navegador y en Cloudflare (sin node:crypto).

import { sha256, toUtf8Bytes } from 'ethers';

export const publicId = (pid) => sha256(toUtf8Bytes(`riftfall-player|${pid}`)).slice(2, 14);

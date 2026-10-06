// Empaqueta datos en un texto corto para un link (JSON comprimido en base64url). Lo usan RIFTFALL
// y Rift Cargo para llevar el progreso a otro navegador, por ejemplo al de la app de MetaMask.

const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

/** Objeto → texto para el link (comprimido si el navegador puede, que son casi todos). */
export async function packData(data) {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') return `z${b64url(await pipe(json, new CompressionStream('gzip')))}`;
  return `j${b64url(json)}`;
}

/** Texto del link → objeto. */
export async function unpackData(text) {
  const kind = text[0];
  const bytes = unb64url(text.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
  const data = JSON.parse(new TextDecoder().decode(raw));
  if (!data || typeof data !== 'object') throw new Error('datos inválidos');
  return data;
}

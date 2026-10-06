// Función de Vercel: ranking compartido de las partidas normales ("Hoy" e "Histórico").
// GET  /api/ranking  → { day, today, all } (lo cachea la CDN unos segundos).
// POST /api/ranking  → { pid, name, seed, ship, shipLevel, talents, rift, parts, inputs, choices }:
//                       re-juega la partida y la anota si entra.
// El tablero es un archivo JSON público en Vercel Blob (ranking/runs.json).

import { put } from '@vercel/blob';
import { createRunBoard } from '../server/run-board.mjs';

const MAX_BODY = 1_500_000;
const PATH = 'ranking/runs.json';

function blobHost() {
  const id = String(process.env.BLOB_READ_WRITE_TOKEN ?? '').split('_')[3];
  if (!id) throw new Error('falta BLOB_READ_WRITE_TOKEN');
  return `https://${id.toLowerCase()}.public.blob.vercel-storage.com`;
}

const board = createRunBoard({
  async load(fresh) {
    const res = await fetch(`${blobHost()}/${PATH}${fresh ? `?t=${Date.now()}` : ''}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`no se pudo leer el ranking (${res.status})`);
    return res.json();
  },
  async save(data) {
    await put(PATH, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    });
  }
});

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export async function GET() {
  return json(await board.get(), 200, { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' });
}

export async function POST(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: 'too-big' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'json' }, 400);
  }
  const res = await board.submit(body);
  return json(res, res.ok ? 200 : 400, { 'cache-control': 'no-store' });
}

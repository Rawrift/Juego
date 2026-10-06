// Función de Vercel: ranking mundial del Desafío del Día.
// GET  /api/daily?n=<día>  → top del día (lo cachea la CDN unos segundos).
// POST /api/daily          → { n, pid, name, inputs, choices }: re-juega la partida y la anota si entra.
// Los tableros son archivos JSON públicos en Vercel Blob (daily/<día>.json).

import { put } from '@vercel/blob';
import { createDailyBoard } from '../server/world-board.mjs';

const MAX_BODY = 1_500_000;

function blobHost() {
  // El token es vercel_blob_rw_<idDelStore>_<secreto>; los archivos públicos viven en <id>.public.blob.vercel-storage.com.
  const id = String(process.env.BLOB_READ_WRITE_TOKEN ?? '').split('_')[3];
  if (!id) throw new Error('falta BLOB_READ_WRITE_TOKEN');
  return `https://${id.toLowerCase()}.public.blob.vercel-storage.com`;
}

const board = createDailyBoard({
  async load(n, fresh) {
    const res = await fetch(`${blobHost()}/daily/${n}.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`no se pudo leer el ranking (${res.status})`);
    return res.json();
  },
  async save(n, data) {
    await put(`daily/${n}.json`, JSON.stringify(data), {
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

export async function GET(request) {
  const n = new URL(request.url).searchParams.get('n');
  const data = await board.get(n);
  if (!data) return json({ error: 'day' }, 400);
  return json(data, 200, { 'cache-control': 'public, s-maxage=20, stale-while-revalidate=60' });
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

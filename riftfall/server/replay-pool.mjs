// Re-simula partidas en hilos separados para no bloquear el servidor HTTP.

import { Worker } from 'node:worker_threads';
import os from 'node:os';

export function createReplayPool(size = Math.max(1, Math.min(4, os.cpus().length - 1))) {
  const workers = [];
  const queue = [];
  const pending = new Map();
  let nextId = 1;

  const spawn = () => {
    const w = new Worker(new URL('./replay-worker.mjs', import.meta.url));
    w.busy = false;
    w.on('message', ({ id, result }) => {
      w.busy = false;
      pending.get(id)?.(result);
      pending.delete(id);
      pump();
    });
    w.on('error', (err) => {
      w.busy = false;
      for (const [id, resolve] of pending) {
        if (w.current === id) {
          resolve({ ok: false, error: `worker: ${err.message}` });
          pending.delete(id);
        }
      }
      workers.splice(workers.indexOf(w), 1);
      workers.push(spawn());
      pump();
    });
    return w;
  };

  const pump = () => {
    for (const w of workers) {
      if (w.busy || queue.length === 0) continue;
      const { id, job } = queue.shift();
      w.busy = true;
      w.current = id;
      w.postMessage({ id, job });
    }
  };

  for (let i = 0; i < size; i++) workers.push(spawn());

  return {
    run(job) {
      return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        queue.push({ id, job });
        pump();
      });
    },
    close() {
      for (const w of workers) w.terminate();
    }
  };
}

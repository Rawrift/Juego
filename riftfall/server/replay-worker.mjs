import { parentPort } from 'node:worker_threads';
import { replayRun } from '../src/sim/replay.js';

parentPort.on('message', ({ id, job }) => {
  let result;
  try {
    result = replayRun(job);
  } catch (err) {
    result = { ok: false, error: `replay: ${err.message}` };
  }
  parentPort.postMessage({ id, result });
});

/**
 * Lazily starts the I/O Web Worker and exposes it through Comlink. Falls back to
 * running the same functions on the main thread where workers are unavailable
 * (unit tests, very old browsers).
 */
import { wrap, type Remote } from 'comlink';
import type { IoApi } from './io-api';

let remote: Promise<Remote<IoApi> | IoApi> | null = null;

export function getIo(): Promise<Remote<IoApi> | IoApi> {
  if (!remote) {
    if (typeof Worker === 'undefined' || import.meta.env.MODE === 'test') {
      remote = import('./io-api').then((m) => m.ioApi);
    } else {
      const worker = new Worker(new URL('./io.worker.ts', import.meta.url), {
        type: 'module',
        name: 'io',
      });
      remote = Promise.resolve(wrap<IoApi>(worker));
    }
  }
  return remote;
}

#!/usr/bin/env node
/**
 * Initial JavaScript budget (spec §11: < 200 kB compressed).
 * Follows the static import graph from the entry script of dist/index.html
 * (what the browser must download before the first screen) and sums gzip sizes.
 * Lazy chunks (other screens, charts, worker, schemas, en catalogue) are excluded.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 200 * 1000;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!entry) throw new Error('Entry script not found in dist/index.html');

const seen = new Set([entry]);
const queue = [entry];
while (queue.length > 0) {
  const file = queue.pop();
  const code = readFileSync(join(dist, file), 'utf8');
  for (const [, dep] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
    const path = `assets/${dep}`;
    if (!seen.has(path)) {
      seen.add(path);
      queue.push(path);
    }
  }
}

const rows = [...seen]
  .map((file) => ({ file, gzip: gzipSync(readFileSync(join(dist, file)), { level: 9 }).length }))
  .sort((a, b) => b.gzip - a.gzip);
const total = rows.reduce((sum, r) => sum + r.gzip, 0);
const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
for (const r of rows.slice(0, 8)) console.log(`${kb(r.gzip).padStart(9)}  ${r.file}`);
console.log(`${rows.length} chunks — initial JavaScript: ${kb(total)} gzip (budget ${kb(LIMIT)})`);
if (total > LIMIT) {
  console.error('Initial JavaScript budget exceeded.');
  process.exit(1);
}

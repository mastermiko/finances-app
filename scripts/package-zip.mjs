/**
 * Packages the "version d'origine": the blank, versioned static build as a .zip,
 * with SHA-256 sums of the archive and of every file it contains.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const root = 'dist';
const files = {};
const sums = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (!name.endsWith('.map')) {
      const data = readFileSync(path);
      const rel = relative(root, path).replaceAll('\\', '/');
      files[`finances-v${pkg.version}/${rel}`] = [
        data,
        { mtime: new Date('2000-01-01T00:00:00Z') },
      ];
      sums.push(`${createHash('sha256').update(data).digest('hex')}  ${rel}`);
    }
  }
};
walk(root);
files[`finances-v${pkg.version}/SHA256SUMS.txt`] = new TextEncoder().encode(`${sums.join('\n')}\n`);
const zip = zipSync(files, { level: 9 });
mkdirSync('dist-zip', { recursive: true });
const zipName = `finances-v${pkg.version}.zip`;
writeFileSync(join('dist-zip', zipName), zip);
const zipSum = createHash('sha256').update(zip).digest('hex');
writeFileSync(join('dist-zip', 'SHA256SUMS.txt'), `${zipSum}  ${zipName}\n`);
console.log(`${zipName} (${(zip.length / 1024).toFixed(0)} KiB) sha256 ${zipSum}`);

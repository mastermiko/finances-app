#!/usr/bin/env node
/**
 * Production dependencies, from pnpm's own resolution (exact for the pnpm layout):
 *   node scripts/supply-chain.mjs licenses   check licences against the allow-list
 *   node scripts/supply-chain.mjs sbom       write dist/sbom.cdx.json (CycloneDX 1.6)
 *                                            and dist/THIRD-PARTY-NOTICES.txt
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Unlicense',
]);

const pnpm = (args) =>
  JSON.parse(execFileSync('pnpm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/** name@version → { name, version, license } for every production package. */
function productionPackages() {
  const licences = new Map();
  for (const [license, packages] of Object.entries(
    pnpm(['licenses', 'list', '--prod', '--json']),
  )) {
    for (const p of packages) for (const v of p.versions) licences.set(`${p.name}@${v}`, license);
  }
  const found = new Map();
  const walk = (deps) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      const key = `${name}@${info.version}`;
      if (found.has(key)) continue;
      found.set(key, { name, version: info.version, license: licences.get(key) ?? 'UNKNOWN' });
      walk(info.dependencies);
    }
  };
  walk(pnpm(['list', '--prod', '--json', '--depth', 'Infinity'])[0]?.dependencies);
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const command = process.argv[2];
const packages = productionPackages();

if (command === 'licenses') {
  const rejected = packages.filter((p) => !ALLOWED.has(p.license));
  for (const p of packages) console.log(`${p.license.padEnd(14)} ${p.name}@${p.version}`);
  if (rejected.length > 0) {
    console.error(
      `\nLicences non autorisées : ${rejected.map((p) => `${p.name} (${p.license})`).join(', ')}`,
    );
    process.exit(1);
  }
  console.log(`\n${packages.length} dépendances de production, licences autorisées.`);
} else if (command === 'sbom') {
  const app = JSON.parse(readFileSync('package.json', 'utf8'));
  const purl = (p) =>
    `pkg:npm/${p.name.startsWith('@') ? p.name.replace('@', '%40') : p.name}@${p.version}`;
  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: { components: [{ type: 'application', name: 'scripts/supply-chain.mjs' }] },
      component: {
        type: 'application',
        'bom-ref': `${app.name}@${app.version}`,
        name: app.name,
        version: app.version,
        licenses: [{ license: { id: app.license } }],
      },
    },
    components: packages.map((p) => ({
      type: 'library',
      'bom-ref': purl(p),
      name: p.name,
      version: p.version,
      purl: purl(p),
      licenses: p.license === 'UNKNOWN' ? [] : [{ license: { id: p.license } }],
    })),
  };
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/sbom.cdx.json', `${JSON.stringify(bom, null, 2)}\n`);
  const notices = packages.map((p) => `${p.name} ${p.version} — ${p.license}`).join('\n');
  writeFileSync(
    'dist/THIRD-PARTY-NOTICES.txt',
    `${app.name} ${app.version} embarque les bibliothèques suivantes (licence entre tirets) :\n\n${notices}\n`,
  );
  console.log(`dist/sbom.cdx.json : ${packages.length} composants (CycloneDX 1.6)`);
} else {
  console.error('Usage: node scripts/supply-chain.mjs licenses|sbom');
  process.exit(2);
}

/**
 * i18n checks: both catalogues define the same keys, every message is valid ICU,
 * every key is used in the code (dynamic keys are declared below).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@formatjs/icu-messageformat-parser';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

const DYNAMIC_PREFIXES = [
  'operations.preset.',
  'analytics.tab.',
  'help.',
  'kind.',
  'status.',
  'accounts.type.',
  'backups.reason.',
  'recurrence.every.',
  'recurrences.unit.',
  'rules.match.',
  'rules.error.regex.',
  'security.strength.',
  'settings.',
  'keys.',
  'warning.',
  'reject.',
];

let errors = 0;
const fail = (message: string): void => {
  errors += 1;
  console.error(`✖ ${message}`);
};

const frKeys = Object.keys(fr);
const enKeys = new Set(Object.keys(en));
for (const key of frKeys) if (!enKeys.has(key)) fail(`missing in en: ${key}`);
for (const key of enKeys) if (!(key in fr)) fail(`missing in fr: ${key}`);
for (const [lang, catalogue] of [
  ['fr', fr],
  ['en', en],
] as const) {
  for (const [key, message] of Object.entries(catalogue)) {
    try {
      parse(message);
    } catch (error) {
      fail(`${lang} ${key}: invalid ICU (${(error as Error).message})`);
    }
  }
}

const sources: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.') && !path.includes('i18n'))
      sources.push(readFileSync(path, 'utf8'));
  }
};
walk('src');
const code = sources.join('\n');
const unused = frKeys.filter(
  (key) =>
    !code.includes(`'${key}'`) &&
    !code.includes(`"${key}"`) &&
    !DYNAMIC_PREFIXES.some((p) => key.startsWith(p)),
);
for (const key of unused) fail(`unused key: ${key}`);

if (errors > 0) {
  console.error(`${errors} i18n problem(s)`);
  process.exit(1);
}
console.log(`i18n OK: ${frKeys.length} keys, fr and en in sync, valid ICU`);

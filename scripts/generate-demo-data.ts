/**
 * Generates fictional data sets in the export format:
 *   docs/demo/finances-demo.json        ~18 months of a fictional student budget
 *   e2e/.data/perf-50000.json        50 000 operations for the volume tests
 * Deterministic (seeded PRNG); nothing comes from real data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  addPeriods,
  formatYmd,
  daysInMonth,
  parsePeriod,
  periodOfDate,
} from '../src/domain/common/civil-date';
import {
  createDefaultAccount,
  createDefaultCategories,
  createDefaultSettings,
  type ExportData,
  type Operation,
} from '../src/domain/model';
import { serializeExport } from '../src/io/json/export-json';

let seed = 42;
const random = (): number => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
let counter = 0;
const id = (): string => {
  counter += 1;
  const hex = counter.toString(16).padStart(12, '0');
  return `01900000-0000-7000-8000-${hex}`;
};

const NOW = '2026-10-23T10:00:00.000Z';

export function generate(months: number, perMonth: number, endPeriod = '2026-10'): ExportData {
  const settings = createDefaultSettings(NOW);
  const account = {
    ...createDefaultAccount('Compte courant', 'EUR', NOW),
    id: id(),
    openingBalanceMinor: 25000,
  };
  const categories = createDefaultCategories('fr-FR', NOW).map((c) => ({ ...c, id: id() }));
  const cat = (name: string): string => categories.find((c) => c.name === name)?.id ?? '';
  const variable: [string, string, number, number][] = [
    ['Alimentation', 'Courses', 1500, 6000],
    ['Alimentation', 'Café', 120, 350],
    ['Alimentation', 'Boulangerie', 110, 600],
    ['Alimentation', 'Restaurant universitaire', 330, 330],
    ['Transport', 'Essence', 2500, 6000],
    ['Transport', 'Parking', 150, 400],
    ['Transport', 'Tram', 170, 170],
    ['Loisirs', 'Cinéma', 800, 1200],
    ['Loisirs', 'Escalade', 900, 1500],
    ['Loisirs', 'Concert', 2500, 6000],
    ['Santé', 'Pharmacie', 500, 2500],
  ];
  const operations: Operation[] = [];
  const start = addPeriods(endPeriod, -(months - 1));
  for (let m = 0; m < months; m += 1) {
    const period = addPeriods(start, m);
    const { y, m: month } = parsePeriod(period);
    const push = (
      o: Partial<Operation> & Pick<Operation, 'amountMinor' | 'categoryId' | 'kind' | 'label'>,
    ): void => {
      operations.push({
        id: id(),
        accountId: account.id,
        date: null,
        period,
        currency: 'EUR',
        amountExpression: null,
        note: '',
        tagIds: [],
        status: 'cleared',
        recurrenceId: null,
        recurrenceKey: null,
        transferGroupId: null,
        importBatchId: null,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
        ...o,
      });
    };
    push({ amountMinor: -42000, categoryId: cat('Logement'), kind: 'expense', label: 'Loyer' });
    push({
      amountMinor: -1399,
      categoryId: cat('Abonnements'),
      kind: 'expense',
      label: 'Abonnement musique',
    });
    push({
      amountMinor: 115000,
      categoryId: cat('Revenu'),
      kind: 'income',
      label: 'Salaire alternance',
      date: formatYmd({ y, m: month, d: 1 }),
    });
    push({
      amountMinor: 18000,
      categoryId: cat('Revenu'),
      kind: 'income',
      label: 'Aide au logement',
      date: formatYmd({ y, m: month, d: 5 }),
    });
    for (let i = 0; i < perMonth; i += 1) {
      const [category, label, min, max] = pick(variable);
      const day = 1 + Math.floor(random() * daysInMonth(y, month));
      const date = formatYmd({ y, m: month, d: day });
      push({
        amountMinor: -(min + Math.floor(random() * (max - min + 1))),
        categoryId: cat(category),
        kind: 'expense',
        label,
        date,
        period: periodOfDate(date, 1),
      });
    }
  }
  return {
    accounts: [account],
    categories,
    operations,
    budgets: [],
    recurrences: [],
    rules: [],
    tags: [],
    goals: [],
    importBatches: [],
    settings: { ...settings, defaultAccountId: account.id },
  };
}

const demo = await serializeExport(generate(18, 45), '1.0.0', NOW);
mkdirSync('docs/demo', { recursive: true });
writeFileSync('docs/demo/finances-demo.json', demo.text);
console.log(`docs/demo/finances-demo.json: ${demo.envelope.data.operations.length} operations`);

if (process.argv.includes('--perf')) {
  const perf = await serializeExport(generate(600, 80), '1.0.0', NOW);
  mkdirSync('e2e/.data', { recursive: true });
  writeFileSync('e2e/.data/perf-50000.json', perf.text);
  console.log(
    `e2e/.data/perf-50000.json: ${perf.envelope.data.operations.length} operations, ${(perf.text.length / 1e6).toFixed(1)} MB`,
  );
}

import { addOperation, addTransfer, createAccount, getDb, requireSettings } from '@/data';

/** Seeds a small realistic month (October 2026) plus September. */
export async function seed(): Promise<{ accountId: string; categories: Record<string, string> }> {
  const accountId = (await requireSettings()).defaultAccountId ?? '';
  const cats = Object.fromEntries((await getDb().categories.toArray()).map((c) => [c.name, c.id]));
  const base = { accountId, currency: 'EUR' };
  await addOperation({
    ...base,
    date: '2026-09-29',
    amountMinor: 124000,
    kind: 'income',
    categoryId: cats.Revenu ?? null,
    label: 'Salaire',
  });
  await addOperation({
    ...base,
    date: '2026-09-15',
    amountMinor: -4500,
    kind: 'expense',
    categoryId: cats.Alimentation ?? null,
    label: 'Courses',
  });
  await addOperation({
    ...base,
    date: null,
    period: '2026-10',
    amountMinor: -55000,
    kind: 'expense',
    categoryId: cats.Logement ?? null,
    label: 'Loyer',
  });
  await addOperation({
    ...base,
    date: '2026-10-02',
    amountMinor: -250,
    kind: 'expense',
    categoryId: cats.Alimentation ?? null,
    label: 'Café',
  });
  await addOperation({
    ...base,
    date: '2026-10-02',
    amountMinor: -250,
    kind: 'expense',
    categoryId: cats.Alimentation ?? null,
    label: 'café',
  });
  await addOperation({
    ...base,
    date: '2026-10-05',
    amountMinor: -4000,
    kind: 'expense',
    categoryId: cats.Transport ?? null,
    label: 'Essence',
    note: 'plein moto',
  });
  await addOperation({
    ...base,
    date: '2026-10-20',
    amountMinor: -1500,
    kind: 'expense',
    categoryId: cats.Loisirs ?? null,
    label: 'Cinéma',
    status: 'planned',
  });
  const savings = await createAccount({
    name: 'Livret A',
    type: 'savings',
    currency: 'EUR',
    openingBalanceMinor: 100000,
    openingDate: null,
  });
  await addTransfer({
    fromAccountId: accountId,
    toAccountId: savings.id,
    amountMinor: 10000,
    currency: 'EUR',
    date: '2026-10-10',
    label: 'Épargne',
  });
  return { accountId, categories: cats };
}

import { DEFAULT_CURRENCY } from '../money/money';
import { uuidv7 } from '../common/uuid';
import { SCHEMA_VERSION } from './constants';
import type { Account, Category, CategoryKind, Meta, Settings } from './types';

/**
 * Categorical palette (8 slots, fixed order) validated for colour-vision
 * deficiencies on adjacent pairs, in light and dark mode. The light value is the
 * one stored on the entity; the UI maps it to its dark counterpart.
 */
export const CATEGORY_PALETTE: readonly { readonly light: string; readonly dark: string }[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
  { light: '#6250d6', dark: '#9085e9' }, // violet
  { light: '#e34948', dark: '#e66767' }, // red
];

export function paletteColor(index: number): string {
  const slot =
    CATEGORY_PALETTE[
      ((index % CATEGORY_PALETTE.length) + CATEGORY_PALETTE.length) % CATEGORY_PALETTE.length
    ];
  return slot?.light ?? '#2a78d6';
}

/** Dark-mode variant of a stored colour (palette colours only; custom colours unchanged). */
export function darkVariant(color: string): string {
  const lower = color.toLowerCase();
  return CATEGORY_PALETTE.find((p) => p.light === lower)?.dark ?? color;
}

/** Icon keys available for categories (mapped to SVG icons in the UI layer). */
export const CATEGORY_ICONS = [
  'home',
  'car',
  'bus',
  'utensils',
  'coffee',
  'shopping-cart',
  'party',
  'gamepad',
  'repeat',
  'heart',
  'piggy-bank',
  'wallet',
  'briefcase',
  'gift',
  'graduation',
  'plane',
  'dumbbell',
  'shirt',
  'phone',
  'zap',
  'paw',
  'baby',
  'book',
  'tag',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

interface DefaultCategorySpec {
  readonly key: string;
  readonly kind: CategoryKind;
  readonly icon: CategoryIcon;
  readonly slot: number;
}

/**
 * Default categories: those of the spreadsheet (Logement, Transport, Alimentation,
 * Loisirs, Revenu) plus Abonnements, Santé and Épargne. `key` is an i18n key; the
 * name is resolved in the user's language at creation time.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategorySpec[] = [
  { key: 'housing', kind: 'expense', icon: 'home', slot: 0 },
  { key: 'transport', kind: 'expense', icon: 'car', slot: 1 },
  { key: 'food', kind: 'expense', icon: 'utensils', slot: 2 },
  { key: 'leisure', kind: 'expense', icon: 'party', slot: 3 },
  { key: 'subscriptions', kind: 'expense', icon: 'repeat', slot: 4 },
  { key: 'health', kind: 'expense', icon: 'heart', slot: 7 },
  { key: 'savings', kind: 'expense', icon: 'piggy-bank', slot: 6 },
  { key: 'income', kind: 'income', icon: 'wallet', slot: 5 },
];

export const DEFAULT_CATEGORY_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'fr-FR': {
    housing: 'Logement',
    transport: 'Transport',
    food: 'Alimentation',
    leisure: 'Loisirs',
    subscriptions: 'Abonnements',
    health: 'Santé',
    savings: 'Épargne',
    income: 'Revenu',
  },
  'en-GB': {
    housing: 'Housing',
    transport: 'Transport',
    food: 'Food',
    leisure: 'Leisure',
    subscriptions: 'Subscriptions',
    health: 'Health',
    savings: 'Savings',
    income: 'Income',
  },
};

export function createDefaultCategories(locale: string, nowIso: string): Category[] {
  const names = DEFAULT_CATEGORY_NAMES[locale] ?? DEFAULT_CATEGORY_NAMES['fr-FR'] ?? {};
  return DEFAULT_CATEGORIES.map((spec, index) => ({
    id: uuidv7(),
    name: names[spec.key] ?? spec.key,
    parentId: null,
    kind: spec.kind,
    color: paletteColor(spec.slot),
    icon: spec.icon,
    order: index,
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

export function createDefaultAccount(name: string, currency: string, nowIso: string): Account {
  return {
    id: uuidv7(),
    name,
    type: 'checking',
    currency,
    openingBalanceMinor: 0,
    openingDate: null,
    order: 0,
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function createDefaultSettings(
  nowIso: string,
  locale: Settings['locale'] = 'fr-FR',
): Settings {
  return {
    id: 'settings',
    locale,
    currency: DEFAULT_CURRENCY,
    dateFormat: 'locale',
    theme: 'system',
    budgetMonthStartDay: 1,
    budgetAutoRenew: true,
    backupReminderDays: 30,
    lastBackupAt: null,
    defaultAccountId: null,
    updatedAt: nowIso,
  };
}

export function createMeta(appVersion: string, nowIso: string): Meta {
  return { id: 'meta', schemaVersion: SCHEMA_VERSION, appVersion, createdAt: nowIso };
}

/**
 * Model barrel without the Zod schemas: constants, defaults, migrations and types
 * only, so that importing it never pulls Zod into the initial bundle.
 * Runtime validation: import from '@/domain/model/schemas' (the data layer loads it
 * on demand, see src/data/schemas-loader.ts).
 */
export * from './constants';
export type * from './types';
export * from './defaults';
export * from './migrations';

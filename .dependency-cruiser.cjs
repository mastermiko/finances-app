/**
 * Layer rules (hexagonal architecture), checked in CI:
 *   domain  → nothing but zod (pure business logic)
 *   io      → domain only (file formats, crypto, workers)
 *   data    → domain, io (IndexedDB adapters, repositories)
 *   ui      → domain (types/defaults) only — never data or features
 *   i18n    → domain types only
 *   features→ domain, data, io, ui, i18n, app/Layout
 *   app     → everything
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'domain/ ne dépend de rien d’autre (ni UI, ni base, ni IO, ni bibliothèque autre que zod).',
      severity: 'error',
      from: { path: '^src/domain' },
      to: {
        pathNot: ['^src/domain', '^node_modules/zod', '^node_modules/\\.pnpm/zod@'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'io-depends-on-domain-only',
      severity: 'error',
      from: { path: '^src/io' },
      to: { path: '^src/(data|features|ui|app|i18n)' },
    },
    {
      name: 'data-has-no-ui',
      severity: 'error',
      from: { path: '^src/data' },
      to: { path: '^src/(features|ui|app|i18n)' },
    },
    {
      name: 'ui-is-generic',
      comment: 'Le design system ne connaît ni les données ni les écrans.',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/(data|features|app|io)' },
    },
    {
      name: 'screens-never-touch-indexeddb',
      comment: 'Les écrans passent par les dépôts de data/, jamais par Dexie directement.',
      severity: 'error',
      from: { path: '^src/features' },
      to: {
        path: ['^node_modules/(\\.pnpm/)?dexie@', '^node_modules/dexie/', '^src/data/db\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '\\.test\\.tsx?$',
          '\\.stories\\.tsx$',
          'src/test/',
          'src/vite-env',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.tsx?$', 'src/test/', '\\.stories\\.tsx$'] },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'domain',
        'data',
        'io',
        'ui',
        'i18n',
        'entry',
        'operations',
        'dashboard',
        'budget',
        'analytics',
        'import',
        'settings',
        'pwa',
        'ci',
        'docs',
        'deps',
      ],
    ],
  },
};

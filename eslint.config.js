// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importX from 'eslint-plugin-import-x';

/**
 * Local rule: no raw text in JSX. Every user-facing string goes through the
 * i18n catalogues (src/i18n). Pure punctuation and symbols are allowed.
 */
const noJsxText = {
  meta: {
    type: 'problem',
    messages: { literal: 'Texte en dur dans le JSX : utilisez <T id="…" /> ou t("…").' },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        if (/\p{L}/u.test(node.value)) context.report({ node, messageId: 'literal' });
      },
      'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal'(node) {
        if (typeof node.value === 'string' && /\p{L}{2,}/u.test(node.value))
          context.report({ node, messageId: 'literal' });
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'storybook-static',
      'playwright-report',
      'test-results',
      'node_modules',
      'dev-dist',
      'dist-zip',
      '.lighthouseci',
      'e2e/.data',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: { 'import-x/internal-regex': '^@/' },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      'import-x': importX,
      local: { rules: { 'no-jsx-text': noJsxText } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      'local/no-jsx-text': 'error',
      // role="list" is kept on styled lists: Safari/VoiceOver drops list semantics when list-style is none.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Stylistic only, and its autofix changed `a && a.b !== null` into `a?.b !== null` (different meaning when a is undefined).
      '@typescript-eslint/prefer-optional-chain': 'off',
      // Narrow no-break spaces are expected in French number/currency formats (strings, regexes, templates).
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipRegExps: true, skipTemplates: true, skipComments: true },
      ],
      // Scrollable data tables are focusable regions (axe: scrollable-region-focusable); tab panels too.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
      // ARIA composite widgets built on lists (listbox/option, menu/menuitem), as in the jsx-a11y recommended preset.
      'jsx-a11y/no-noninteractive-element-to-interactive-role': [
        'error',
        {
          ul: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
          ol: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
          li: ['menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'row', 'tab', 'treeitem'],
          table: ['grid'],
          td: ['gridcell'],
          fieldset: ['radiogroup', 'presentation'],
        },
      ],
      // Design-system inputs get autoFocus only in dialogs and inline editors the user just opened (APG: focus the first field).
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/label-has-associated-control': [
        'error',
        { controlComponents: ['TextInput', 'Select', 'TextArea'], depth: 3, assert: 'either' },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'never',
        },
      ],
      'import-x/no-duplicates': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval est interdit (CSP stricte).',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function est interdit (CSP stricte).',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Pas de HTML non assaini (Trusted Types).',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Pas de innerHTML (Trusted Types).',
        },
      ],
      // react-hooks v7 compiler-oriented rules: kept as warnings would fail --max-warnings=0, so tuned explicitly
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    files: [
      '**/*.test.{ts,tsx}',
      'e2e/**',
      'src/test/**',
      'scripts/**',
      '*.config.{ts,js}',
      '.storybook/**',
      '**/*.stories.tsx',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'local/no-jsx-text': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      'jsx-a11y/no-autofocus': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);

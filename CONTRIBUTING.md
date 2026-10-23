# Contribuer

## Mise en place

```bash
corepack enable
pnpm install          # installe aussi les hooks Git (husky)
pnpm dev
```

Node 22.12+ (`.nvmrc`), pnpm 10. Les versions des dépendances sont figées par `pnpm-lock.yaml` ; Renovate propose les mises à jour.

## Avant chaque demande de fusion

```bash
pnpm typecheck && pnpm lint && pnpm depcruise && pnpm i18n:check
pnpm test:coverage
pnpm build && pnpm size && pnpm test:e2e
```

La CI rejoue ces étapes, plus Lighthouse, l’audit des dépendances (osv-scanner, `pnpm audit`), la vérification des licences et le SBOM.

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/fr/) (`feat:`, `fix:`, `docs:`…), vérifiés par commitlint. Chaque changement visible ajoute un fichier `pnpm changeset` ; le CHANGELOG et la version en découlent.
- **Couches** (`pnpm depcruise`) : `domain` n’importe que Zod ; `io` ne dépend que de `domain` ; les écrans (`features`) passent par `@/data`, jamais par Dexie. Détails : [ADR 0001](docs/adr/0001-architecture-hexagonale.md).
- **Montants** : entiers en unités mineures, jamais de nombre à virgule pour calculer. Utiliser `src/domain/money`.
- **Dates** : dates civiles `AAAA-MM-JJ` (`src/domain/common/civil-date.ts`), jamais `new Date()` pour une date d’opération. L’heure courante passe par `data/clock.ts` (remplaçable dans les tests).
- **Valeurs dérivées** (soldes, totaux, reports, pourcentages) : calculées, jamais stockées.
- **Textes** : aucun texte en dur dans le JSX (règle ESLint `local/no-jsx-text`). Ajouter la clé dans `src/i18n/fr.ts` puis `en.ts` (ICU MessageFormat), vérifier avec `pnpm i18n:check`.
- **Accessibilité** : composants de `src/ui` en priorité ; tout contrôle a un nom accessible, tout état est perceptible sans la couleur. Les tests de composants interrogent par rôle et par nom.
- **Sécurité** : ni `eval`, ni `new Function`, ni `innerHTML`, ni `dangerouslySetInnerHTML` (bloqués par ESLint, la CSP et Trusted Types). Aucune requête réseau à l’exécution.
- **Effets de bord à l’import** : le `package.json` déclare `sideEffects` pour permettre l’élagage du bundle initial. Un module qui exécute du code au chargement (enregistrement d’un plugin, configuration globale) doit y être ajouté, sinon ce code est supprimé du build.
- **Validation** : les écritures valident avec les schémas Zod chargés à la demande (`data/schemas-loader.ts`). Toujours `await loadSchemas()` avant d’ouvrir une transaction Dexie.

## Modifier le modèle de données

1. Modifier le schéma dans `src/domain/model/schemas.ts`.
2. Incrémenter `SCHEMA_VERSION` (`src/domain/model/constants.ts`).
3. Ajouter la migration `{ from, to, migrate }` dans `src/domain/model/migrations.ts` (fonction pure, idempotente).
4. Geler un jeu de données de l’ancienne version sous `src/test/fixtures/migrations/` et tester la migration.
5. `pnpm schema` pour régénérer `docs/export-format.schema.json`.

Au démarrage, la base locale est sauvegardée puis migrée dans une transaction ; un export ancien est migré à l’import.

## Données personnelles

Ne jamais versionner de données réelles (`*.finances.json`, `*.finances.enc`, `private-fixtures/` sont ignorés). Pour un nouveau cas d’import, l’ajouter au générateur `scripts/generate-workbook-fixture.py` (données inventées), lancer `pnpm fixture:workbook` et mettre à jour les attentes des tests.

## Publier une version

`pnpm changeset version`, puis étiquette `vX.Y.Z` : le workflow `release.yml` construit, produit l’archive `.zip` avec sa somme SHA-256, le SBOM et le Storybook, et crée la release GitHub.

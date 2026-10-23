# Finances

Application web de gestion de finances personnelles, **local-first** : elle remplace le classeur `Finances.xlsm` et fonctionne entièrement dans le navigateur, hors ligne, sans compte, sans serveur, sans cookie ni mesure d’audience. Les données restent dans l’IndexedDB de l’appareil ; elles se sauvegardent, se transportent et se restaurent par fichier.

Installable comme une application (PWA) sur iOS, Android, Windows, macOS et Linux.

**Application en ligne : https://mastermiko.github.io/finances-app/** — l’ouvrir sur le téléphone puis l’ajouter à l’écran d’accueil (iPhone : Partager → « Sur l’écran d’accueil » ; Android : menu ⋮ → « Installer l’application »).

## Fonctions

| Domaine         | Ce que fait l’application                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saisie          | Saisie en quelques secondes (touche **N** ou bouton +), calculs dans le montant (`12,50+7,30`), suggestions de libellés, catégories récentes en premier, brouillon conservé, « Enregistrer et nouvelle », dépenses, revenus, remboursements, virements entre comptes, charges sans date |
| Opérations      | Liste virtualisée groupée par jour, recherche, filtres combinables conservés dans l’URL, total de la sélection, sélection multiple (recatégoriser, pointer, supprimer), duplication, corbeille 30 jours, annulation 10 s après chaque action                                            |
| Budget          | Enveloppes par catégorie et budget global, report du reste, reconduction automatique, jauges avec repère du mois écoulé, alertes à 80 % et 100 %                                                                                                                                        |
| Tableau de bord | Reste à dépenser, rythme de dépense, solde prévisionnel de fin de mois, alertes, dernières opérations, soldes des comptes, objectifs d’épargne                                                                                                                                          |
| Analyses        | Évolution mensuelle, comparaison de périodes, revenus / dépenses / épargne, bilan annuel, libellés les plus fréquents, suivi par tag ; chaque graphique a sa table de données et s’exporte en PNG et CSV                                                                                |
| Automatisation  | Récurrences (loyer, abonnements…) avec confirmation, règles de catégorisation (contient, égal, commence par, expression régulière), regroupement des libellés similaires                                                                                                                |
| Fichiers        | Import du classeur `.xlsm` avec contrôle des soldes F2 au centime, relevés bancaires CSV / OFX / QIF avec détection des doublons, sauvegarde JSON (format de référence) et chiffrée, export CSV et XLSX ; chaque import est annulable                                                   |
| Sécurité        | CSP stricte, Trusted Types, aucune requête réseau après le chargement, sauvegardes automatiques locales avant toute opération destructrice                                                                                                                                              |
| Accessibilité   | Objectif RGAA 4.1 / WCAG 2.2 AA : navigation clavier complète, lecteurs d’écran, contrastes vérifiés en clair et en sombre, cibles de 44 px, réduction des animations, sans défilement horizontal de 320 à 1 920 px                                                                     |
| Langues         | Français et anglais (ICU MessageFormat)                                                                                                                                                                                                                                                 |

Guide d’utilisation intégré : **Paramètres → Aide**.

## Démarrage

Prérequis : Node.js 22.12 ou plus récent (22.x LTS, voir `.nvmrc`) et pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # version de production dans dist/
pnpm preview        # sert dist/ sur http://localhost:4173
```

Jeu de données fictif pour essayer : **Importer → `docs/demo/finances-demo.json`**.

## Déploiement

`dist/` est un site statique autonome (chemins relatifs, routage par `#`) : il se dépose tel quel sur n’importe quel hébergement statique, y compris dans un sous-dossier.

- GitHub Pages : le workflow `.github/workflows/pages.yml` publie l’application à chaque envoi sur `main` (réglage unique : _Settings → Pages → Source : GitHub Actions_). GitHub Pages n’applique pas `public/_headers` : la CSP vient de la balise `<meta>`, HTTPS et HSTS sont fournis par `github.io`.
- Netlify ou Cloudflare Pages : `public/_headers` applique la CSP, HSTS et les autres en-têtes de sécurité ; `netlify.toml` est fourni.
- Autre hébergeur : la CSP est aussi présente en balise `<meta>` ; ajouter les en-têtes de `public/_headers` dans la configuration du serveur si possible (`frame-ancestors` n’est effectif qu’en en-tête).
- Archive de livraison : `pnpm package:zip` produit `dist-zip/finances-vX.Y.Z.zip` et `SHA256SUMS.txt`.

Le service worker met l’application en cache au premier chargement ; une nouvelle version est proposée par un bandeau, jamais appliquée de force.

## Scripts

| Commande                                                                     | Rôle                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                             | TypeScript strict                                                                               |
| `pnpm lint`                                                                  | ESLint (typescript-eslint strict, jsx-a11y strict, aucun texte en dur dans le JSX)              |
| `pnpm depcruise`                                                             | Respect des couches (domaine pur, écrans sans accès direct à IndexedDB, pas de cycle)           |
| `pnpm test` / `pnpm test:coverage`                                           | Tests unitaires et de composants (Vitest) avec seuils de couverture                             |
| `pnpm test:e2e`                                                              | Parcours Playwright sur le build de production (Chromium, Firefox, WebKit, mobiles) et axe-core |
| `pnpm fixture:demo --perf` puis `pnpm exec playwright test --project=volume` | Test de volume 50 000 opérations                                                                |
| `pnpm size`                                                                  | Budget JavaScript initial (< 200 kB compressé)                                                  |
| `pnpm lhci`                                                                  | Lighthouse CI                                                                                   |
| `pnpm i18n:check`                                                            | Catalogues fr / en complets et ICU valide                                                       |
| `pnpm schema`                                                                | Régénère `docs/export-format.schema.json`                                                       |
| `pnpm storybook`                                                             | Catalogue des composants (`src/ui`)                                                             |
| `pnpm licenses` / `pnpm sbom`                                                | Licences des dépendances, SBOM CycloneDX                                                        |

## Qualité mesurée (version 1.0.0)

| Exigence                                     | Résultat                                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import du classeur réel : soldes F2          | 0 écart, tous les mois                                                                                                                                                                                                             |
| Export → import → export                     | identique octet pour octet                                                                                                                                                                                                         |
| JavaScript initial                           | 192,8 kB gzip en 7 fichiers (budget 200 kB)                                                                                                                                                                                        |
| Lighthouse mobile simulé (premier lancement) | performance 0,94–0,95, accessibilité 1,00, bonnes pratiques 1,00 ; LCP 2,6–2,7 s pour un objectif de 2,5 s (voir ADR 0006)                                                                                                         |
| 50 000 opérations, Chromium                  | filtrage 62 ms, tableau de bord 107 ms (calcul + rendu), export JSON 1,7 s                                                                                                                                                         |
| Tests                                        | 230 tests unitaires et de composants ; 27 cas E2E (Chromium bureau et mobile) dont axe sans violation grave en clair et en sombre ; couverture des lignes : domaine 99 %, formats 96 %, données 93 %, écrans 83 %, composants 99 % |

## Architecture

```
src/
  domain/    règles métier pures : montants, dates civiles, budgets, récurrences, règles, analyses, schémas Zod, migrations
  io/        formats : XLSX/XLSM, CSV, OFX, QIF, JSON, chiffrement — exécutés dans un Web Worker
  data/      IndexedDB (Dexie) : dépôts, sauvegardes automatiques, démarrage et migrations
  ui/        design system : composants accessibles, jetons de couleur clair / sombre
  i18n/      catalogues fr / en, formatage Intl
  features/  écrans : saisie, opérations, budget, tableau de bord, analyses, import, paramètres
  app/       démarrage, routage, service worker, Trusted Types
```

Décisions et écarts au cahier des charges : [`docs/adr/`](docs/adr). Formats de fichiers : [`docs/formats.md`](docs/formats.md).

## Données personnelles

Aucune donnée ne quitte l’appareil. Le dépôt ne contient aucune donnée réelle : les tests utilisent un classeur fictif (`src/test/fixtures/finances-fictif.xlsx`, produit par `pnpm fixture:workbook`) et des jeux générés. Le classeur réel peut être rejoué localement avec `FINANCES_XLSM=/chemin/Finances.xlsm pnpm test`, sans jamais être versionné (`.gitignore`).

## Limites connues (V1)

- Verrouillage de l’application et chiffrement des données au repos (SEC-01) : non inclus ; seule la sauvegarde exportée est chiffrable.
- Pièces jointes (ATT-01) : non incluses.
- Synchronisation entre appareils (SYNC-01) : par fichier uniquement (export / import en mode fusion) ; l’architecture prévoit un dossier cloud chiffré en V2.

## Licence

MIT — voir [`LICENSE`](LICENSE).

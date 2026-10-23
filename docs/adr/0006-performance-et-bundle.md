# 0006 — Budget de performance et découpage du bundle

- Statut : accepté
- Date : 2026-10-23

## Contexte

Cahier des charges : JavaScript initial < 200 kB compressé, filtrage < 100 ms, tableau de bord < 300 ms, export JSON < 2 s pour 50 000 opérations.

## Décision

Le premier écran (tableau de bord) ne charge que React, le routeur, Dexie, le catalogue français et le code de lecture. Sont chargés à la demande :

| Chunk                                                             | Déclencheur                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Écrans Opérations, Budget, Analyses (ECharts), Import, Paramètres | navigation                                                           |
| Formulaire de saisie                                              | préchargé 1,5 s après l’affichage, ou à la première ouverture        |
| Schémas Zod (validation des écritures)                            | préchargés avec le formulaire ; `loadSchemas()` avant toute écriture |
| Catalogue anglais                                                 | choix de la langue                                                   |
| Worker d’import / export (XLSX, CSV, OFX, chiffrement)            | premier import ou export                                             |
| Sauvegardes (gzip), export d’urgence                              | à l’usage                                                            |

- Le premier écran est servi en 7 fichiers JavaScript : `vendor` (React, routeur, Dexie, FormatJS), `core` (domaine commun, accès aux réglages, catalogue français) et l’application ; regroupement explicite par `build.rolldownOptions.output.codeSplitting` pour limiter les allers-retours sur les hébergeurs HTTP/1.1.
- L’enregistrement du service worker attend l’événement `load` : le pré-cache (≈ 1,9 Mo) ne concurrence pas le premier affichage.
- Le catalogue de langue et l’ouverture d’IndexedDB se font en parallèle au démarrage.
- La validation des paramètres d’URL n’utilise pas Zod (petits validateurs dans `features/shared/search-params.ts`).
- `package.json` déclare `sideEffects` : les barils (`@/data`, `@/domain/model`) n’entraînent plus de modules inutilisés. Les modules qui s’exécutent au chargement (`echarts.ts`, `schemas.ts`, worker, CSS) y sont listés.
- `pnpm size` (`scripts/check-bundle-size.mjs`) parcourt le graphe d’imports statiques depuis `dist/index.html` et échoue au-delà de 200 kB gzip.
- Mesures User Timing (`finances:filter`, `finances:derive`, `finances:dashboard`) lues par le test de volume.

## Résultats (Chromium, conteneur 2 vCPU)

| Mesure                                     | Valeur        | Objectif |
| ------------------------------------------ | ------------- | -------- |
| JavaScript initial                         | 194,7 kB gzip | < 200 kB |
| Filtrage + tri + totaux, 50 000 opérations | 62 ms         | < 100 ms |
| Tableau de bord (calculs partagés + rendu) | 107 ms        | < 300 ms |
| Export JSON 50 000 opérations (26 Mo)      | 1,7 s         | < 2 s    |

Lighthouse (mobile simulé : 4G lente, processeur ×4, premier lancement, 3 exécutions) : performance 0,94–0,95, accessibilité 1,00, bonnes pratiques 1,00, TBT 50–130 ms, CLS 0, **LCP 2,6–2,7 s** (objectif 2,5 s). Le même premier lancement dans Chrome avec processeur ×4 sans bridage réseau affiche le contenu à 0,9–1,1 s. Le LCP simulé est dominé par le téléchargement estimé de 193 kB de JavaScript ; l’assertion LCP de `lighthouserc.json` est un avertissement tant que l’écart subsiste, le score de performance (≥ 0,9), le TBT et le CLS restent bloquants.

## Conséquences

- La première saisie peut attendre le chargement du formulaire si elle a lieu dans la seconde qui suit l’ouverture (fichiers servis par le service worker : quelques millisecondes).
- Marge du budget initial : 7 kB. Pistes pour passer sous 2,5 s en simulation : messages ICU précompilés (supprime l’analyseur ICU, ≈ 15 kB gzip, et l’analyse à l’exécution), catalogue découpé par écran, CSS critique en ligne (nécessite une empreinte dans la CSP).

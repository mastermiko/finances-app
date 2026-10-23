# 0001 — Architecture hexagonale local-first

- Statut : accepté
- Date : 2026-10-23

## Contexte

L’application remplace un classeur Excel. Tout doit fonctionner hors ligne, sans serveur, et rester industrialisable (ajout d’une synchronisation par fichier chiffré en V2 sans refonte).

## Décision

Couches et sens des dépendances (vérifiés par `pnpm depcruise`) :

| Couche         | Rôle                                                                     | Peut dépendre de           |
| -------------- | ------------------------------------------------------------------------ | -------------------------- |
| `src/domain`   | Entités (schémas Zod), règles métier, calculs purs, migrations           | zod uniquement             |
| `src/io`       | Formats de fichiers (XLSX, CSV, OFX, QIF, JSON), chiffrement, Web Worker | domain                     |
| `src/data`     | Adaptateur IndexedDB (Dexie), dépôts, sauvegardes, bootstrap             | domain, io                 |
| `src/ui`       | Design system générique                                                  | domain (types)             |
| `src/i18n`     | Catalogues ICU, formatage Intl                                           | domain (types)             |
| `src/features` | Écrans et cas d’usage                                                    | domain, data, io, ui, i18n |
| `src/app`      | Bootstrap, routage, service worker, Trusted Types                        | tout                       |

Les opérations sont l’unique source de vérité ; soldes, totaux, pourcentages et reports sont dérivés (fonctions pures de `domain/analytics` et `domain/budgets`). Les migrations sont des fonctions pures sur un instantané complet, réutilisées pour la base locale et pour les exports anciens.

Port de synchronisation (V2) : `mergeExportData` (fusion par identifiant, la version `updatedAt` la plus récente gagne) et le format chiffré `.finances.enc` sont déjà les deux briques d’un adaptateur « fichier dans un dossier cloud ».

## Conséquences

- Le domaine est testable sans navigateur (couverture ≥ 90 %).
- Les écrans n’importent jamais Dexie (règle `screens-never-touch-indexeddb`).

## Alternatives écartées

- Redux / store global persistant : doublon avec IndexedDB + `liveQuery`.

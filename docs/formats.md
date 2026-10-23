# Formats de fichiers

Tous les fichiers sont lus et écrits dans le navigateur (Web Worker). Rien n’est envoyé sur le réseau.

## Sauvegarde JSON — format de référence (`finances_AAAA-MM-JJ_HHmm.json`)

Schéma : [`export-format.schema.json`](./export-format.schema.json) (JSON Schema 2020-12, généré depuis les schémas Zod par `pnpm schema`). Exemple fictif : [`demo/finances-demo.json`](./demo/finances-demo.json).

```jsonc
{
  "format": "finances-app",
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-10-23T08:00:00.000Z",
  "checksum": "sha256-…",          // SHA-256 du JSON canonique de "data"
  "data": {
    "accounts": [ … ], "categories": [ … ], "operations": [ … ],
    "budgets": [ … ], "recurrences": [ … ], "rules": [ … ], "tags": [ … ],
    "goals": [ … ], "importBatches": [ … ], "settings": { … }
  }
}
```

- En-tête en premier, puis une entité par ligne : le fichier reste lisible et un `diff` entre deux sauvegardes montre les opérations changées.
- Tableaux triés par identifiant, clés dans un ordre canonique : export → import dans un navigateur vide → export donne un fichier **identique octet pour octet** (hors `exportedAt`).
- Montants en unités mineures entières (`amountMinor: -1250` = −12,50 €), dates civiles `AAAA-MM-JJ` sans fuseau, horodatages ISO 8601 UTC, identifiants UUID v7.
- Aucune valeur dérivée (solde, total, pourcentage, report) n’est stockée.
- À l’import : vérification du format, de la version, de la somme de contrôle (avertissement si elle diffère), validation de chaque entité, migration si le fichier est plus ancien, refus s’il est plus récent. Deux modes : _remplacer_ (sauvegarde automatique prise avant) ou _fusionner_ (par identifiant, la version modifiée le plus récemment l’emporte).

## Sauvegarde chiffrée (`.finances.enc`)

Enveloppe JSON autour de la sauvegarde ci-dessus :

```jsonc
{
  "format": "finances-app-encrypted",
  "version": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64, 16 o>" },
  "cipher": { "name": "AES-GCM", "iv": "<base64, 12 o>" },
  "data": "<base64 : AES-GCM 256 du JSON de sauvegarde>",
}
```

L’en-tête `{format, version}` est authentifié (données associées AES-GCM). Le mot de passe n’est jamais stocké ; s’il est perdu, le fichier est irrécupérable.

## CSV des opérations

RFC 4180, UTF-8 avec BOM, séparateur `;`, décimale `,`, fins de ligne CRLF, dates ISO `AAAA-MM-JJ` (s’ouvre directement dans Excel et LibreOffice en français). Les textes commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot sont préfixés d’une apostrophe (injection de formules).

| Colonne                                        | Contenu                                      |
| ---------------------------------------------- | -------------------------------------------- |
| Date                                           | `AAAA-MM-JJ`, vide pour une charge sans date |
| Période                                        | `AAAA-MM` (mois budgétaire)                  |
| Montant                                        | signé, `-12,50`                              |
| Devise                                         | ISO 4217                                     |
| Type                                           | Dépense, Revenu, Virement                    |
| Catégorie, Catégorie parente                   | noms                                         |
| Libellé, Compte, Tags (séparés par `, `), Note | texte                                        |
| Statut                                         | Validée, Prévue                              |
| Expression                                     | calcul saisi (`12,50+7,30`)                  |
| Identifiant, Groupe virement                   | UUID                                         |
| Créé le, Modifié le                            | ISO 8601                                     |

Ce fichier se réimporte sans configuration (en-têtes reconnus) ; les identifiants évitent les doublons.

## Classeur XLSX exporté

Trois feuilles : **Opérations** (mêmes colonnes que le CSV, montants au format monétaire, dates au format date), **Récapitulatif mensuel** (revenus, dépenses, résultat, solde reporté, taux d’épargne, une colonne par catégorie principale), **Catégories**. Valeurs uniquement, aucune formule ni macro.

## Import du classeur Finances (`.xlsm`, `.xlsx`)

- Une feuille par mois, nommée `Novembre2025`, `Février 2026`… ; les autres feuilles sont ignorées et listées dans le rapport.
- En-têtes attendus en A1:D1 : `Date`, `Montant`, `Type de dépense`, `Libellé` (casse et accents indifférents).
- Montant : valeur numérique, calcul en texte (`12,5+3`) ou formule ; seule la valeur mise en cache par Excel est lue, la formule est conservée comme expression. Une formule sans valeur en cache n’est évaluée que si elle est purement arithmétique.
- Date : numéro de série Excel ou texte `JJ/MM/AAAA` ; vide = charge sans date rattachée au mois de l’onglet.
- Catégories inconnues : proposées à la création ou au rapprochement avec une catégorie existante.
- `G2` du premier mois = solde initial ; `F2` de chaque mois = contrôle. Après import, le solde calculé par l’application est comparé à `F2` mois par mois (critère d’acceptation : aucun écart). Les ruptures de report (G2 saisi à la main) et les mois manquants sont signalés.
- Les macros (`vbaProject.bin`) ne sont jamais extraites ni exécutées ; les DTD/entités XML sont refusées ; la décompression est bornée.

## Relevés bancaires

- **CSV** : séparateur, encodage, format de date et colonnes détectés puis confirmés dans un écran de correspondance (montant unique ou colonnes débit / crédit) ; la correspondance est mémorisée par banque (signature des en-têtes).
- **OFX / QFX** (SGML ou XML) et **QIF**.
- Doublons : même date, même montant, même libellé normalisé et même compte → décochés par défaut dans l’aperçu.

## Sauvegardes automatiques

Prises avant chaque import, migration, restauration et réinitialisation ; 5 conservées, compressées (gzip) dans une base IndexedDB séparée (`finances-backups`). Elles se téléchargent au format JSON ci-dessus.

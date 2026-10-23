# 0004 — Précisions du modèle de données

- Statut : accepté
- Date : 2026-10-23

1. **Période explicite.** `Operation.period` est stockée. Elle est dérivée de la date et de `budgetMonthStartDay` à la saisie, mais l’import du classeur conserve la période de l’onglet : le classeur range des revenus datés du 26–30 dans le mois suivant, et le contrôle F2 exige de respecter ce rattachement.
2. **Remboursements.** `kind` suit la catégorie (dépense / revenu) et le signe suit le flux. Une dépense positive est un remboursement : elle réduit les dépenses de sa catégorie au lieu d’être refusée.
3. **Champs ajoutés.** `Operation.recurrenceKey` (clé d’échéance, rend la génération des récurrences idempotente), `Recurrence.name/dtstart/undated/active`, `ImportBatch.mode/createdCategoryIds/backupId/undoneAt` (annulation d’import), `Settings.budgetAutoRenew/backupReminderDays/dateFormat/defaultAccountId`, `Goal.archived`. L’enveloppe d’export ajoute `goals` et `importBatches` (sinon `importBatchId` pointerait dans le vide).
4. **Budgets reconduits.** Un mois sans enveloppe reprend la dernière définie (réglable). Le report est calculé en remontant la chaîne des mois `rollover`.
5. **Taille d’import.** 20 Mo pour les fichiers tiers, 100 Mo pour les sauvegardes de l’application : 50 000 opérations pèsent environ 26 Mo en JSON.
6. **Restauration JSON.** Une restauration n’ajoute rien aux données (pas d’ImportBatch persistant) afin que export → import → export soit identique octet pour octet ; l’annulation passe par la sauvegarde automatique prise juste avant.

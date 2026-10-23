# 0005 — Stratégie de tests

- Statut : accepté
- Date : 2026-10-23

- **Unitaires (Node)** : domaine, IO, données (fake-indexeddb). Propriétés fast-check sur l’arithmétique des montants, les dates civiles, les soldes reportés et le tri.
- **Composants (jsdom)** : l’application complète rendue sur une base IndexedDB simulée et un routeur en mémoire, parcourue avec Testing Library et user-event. Seuils : 90 % des lignes de `domain/` et `io/`, 70 % de `features/` et `ui/`.
- **Import de référence** : `src/test/fixtures/finances-fictif.xlsx`, entièrement inventé et produit de façon déterministe par `scripts/generate-workbook-fixture.py` (`pnpm fixture:workbook`). Il reprend la structure du classeur Finances et ses cas difficiles : formules avec valeur en cache, calcul saisi en texte, dates en texte, charges sans date, salaires datés du mois précédent, date à la mauvaise année, ligne sans montant, variantes d’en-têtes, mois manquants, report G2 saisi à la main, cellule de suivi « Prix café », feuille hors mois. Les 7 soldes F2 sont retrouvés au centime. La variable `FINANCES_XLSM` permet de rejouer le test sur le classeur réel, jamais versionné.
- **E2E (Playwright)** sur le build de production : saisie, modification, suppression annulée, import du classeur, aller-retour export / import octet pour octet, hors ligne, accessibilité axe (clair et sombre), absence de défilement horizontal de 320 à 1 920 px et d’erreur console (CSP, Trusted Types, chargement de chunk), volume 50 000 opérations (projet Playwright `volume`, exécuté seul).

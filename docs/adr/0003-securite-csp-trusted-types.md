# 0003 — CSP stricte et Trusted Types

- Statut : accepté
- Date : 2026-10-23

## Décision

- Politique du cahier des charges, en en-tête HTTP (`public/_headers`, lu par Netlify et Cloudflare Pages) et en `<meta>` injectée au build (pour les hébergeurs sans en-têtes ; `frame-ancestors` n’y est pas autorisé et reste dans l’en-tête).
- `require-trusted-types-for 'script'` avec une politique `default` (`src/app/trusted-types.ts`) : seules les URL de scripts de la même origine passent (Web Worker, service worker) ; tout HTML non vide et tout script sont refusés. Seul `innerHTML = ''` (vidage d’un conteneur par la bibliothèque de graphiques) est accepté.
- Zod en mode `jitless`, ECharts en info-bulles `richText` : aucun `eval`, aucune `new Function`, aucun HTML injecté. Règles ESLint `no-restricted-syntax` pour l’empêcher dans le code.
- Les tests E2E tournent sur le build de production : toute violation CSP ou Trusted Types apparaît dans la console et échoue l’accessibilité ou le parcours.

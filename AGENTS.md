# Consignes pour les agents (Codex, Claude)

Équipe : Myrtho (product designer, décide du produit), Claude (développeur principal), Codex (revue et développement).

## Règles de travail
- Jamais de push direct sur `main` : une branche, une PR, puis fusion.
- Aucun secret dans le dépôt ni dans les messages (clés Stripe, Resend, Supabase service role, CRON_SECRET, PIN SuperAdmin, coordonnées bancaires). `.env` n'est jamais commité.
- Ne jamais envoyer d'email ou de newsletter aux adhérents pendant un test.
- Ne jamais mettre de vraies données de membres dans le code ou les tests.
- Lancer `npm test` avant toute PR (tests Node + jsdom dans `scripts/`).

## Pages générées : ne pas les modifier à la main
Les sous-pages des rubriques sont produites par `node scripts/build-pages.mjs` :
`a-propos/*.html`, `historique/*.html`, `organisation/*.html`, `vingt-chantiers/*.html`,
ainsi que le menu (`#main-nav`) et le pied de page de toutes les pages publiques, et le contenu
principal d'`Apropos.html`, `historique.html` et `organisation.html`.
Une modification à la main sera écrasée au prochain lancement. Modifier plutôt :
- `api/_lib/site-pages.js` : structure (rubriques, sous-pages, 20 chantiers) — sert aussi au sitemap et à l'assistant ;
- `pages-src/*.html` : textes propres à une sous-page (candidats, diaspora) ;
- `pages-src/chantiers-resumes.mjs` : résumés des 20 chantiers (3 ou 4 paragraphes, fidèles au Livre blanc) ;
- `pages-src/_orig/*` : sections reprises des anciennes pages ;
- `docs/livre-blanc.txt` : texte du Livre blanc (avec les marqueurs `=== Page N ===`) ;
puis relancer `node scripts/build-pages.mjs` et commiter le résultat.

## Repères techniques
- Site statique (HTML/CSS/JS sans framework) + fonctions Vercel Node 22 (`api/`), Supabase, Resend, Stripe, Anthropic.
- Offre Vercel Hobby : 12 fonctions maximum, d'où les répartiteurs `api/admin.js`, `api/member.js`, `api/trivia.js`… Ne pas ajouter de fichier de fonction à la racine de `api/` sans vérifier ce plafond ; les fichiers préfixés par `_` ne sont pas des fonctions.
- CSP stricte : aucun script inline (voir `vercel.json`).
- Langues : le site est traduit par GTranslate ; l'assistant et les cartes d'invitation ont leurs propres textes en fr/en/ht/es.

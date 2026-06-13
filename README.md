# En Avant — Portail Web Premium

Portail officiel du parti politique **En Avant**.
Stack (conforme au DAT) : **HTML/CSS/JS vanilla** (zéro framework) · **Vercel Serverless Functions** (Node.js, `/api`) · **Supabase** (PostgreSQL + Auth + Storage) · **Stripe** (dons) · **Anthropic** (quiz) · **ElevenLabs** (TTS) · **Resend** (emails).

## Structure

```
├── *.html                  Une seule version source, rédigée en français
│                           Google Translate traduit dynamiquement tout le site
├── css/
│   ├── ultra.css           LE design system (nav pilule, bento, glass, marquee…)
│   └── premium.css         Tokens + formulaires .ea-* + veil + reveals (chargé partout)
├── js/
│   ├── env.js              Config PUBLIQUE frontend (SUPABASE_URL + anon key) — à remplir
│   ├── premium.js          Micro-interactions globales (toutes pages)
│   ├── app.js              Loader / menu mobile / slider
│   ├── adherer.js, don.js, livre-blanc.js   Formulaires branchés sur /api
│   ├── trivia.js           Quiz façon Duolingo (questions API + secours hors ligne)
│   ├── article.js          Page article + lecteur TTS (/api/tts)
│   ├── countdown.js        Compte à rebours (/api/events)
│   └── login.js, admin.js  SuperAdmin : identifiant/email, mot de passe et PIN
├── api/                    Vercel Serverless Functions (Node.js, ESM)
│   ├── members.js          POST adhésion → Supabase
│   ├── leads-livreblanc.js POST lead magnet → Supabase + email Resend
│   ├── create-checkout.js  POST Stripe Checkout Session
│   ├── webhooks/stripe.js  Webhook Stripe → table donations
│   ├── trivia/generate.js  Anthropic → trivia_questions (SuperAdmin, token vérifié)
│   ├── trivia/questions.js GET questions mélangées (jeu public)
│   ├── trivia/score.js     POST score (classement & viralité)
│   ├── tts.js              ElevenLabs → MP3 → Storage tts-articles
│   ├── articles.js, events.js  Lectures publiques (blog AJAX, ?slug= article, countdown)
│   ├── media.js            Galerie publique dynamique
│   ├── admin/*             CRUD SuperAdmin : contenus, équipe, médias et diagnostics
│   └── _lib/               Helpers partagés (non exposés comme endpoints)
├── supabase/schema.sql     Tables + RLS + rôles + 4 buckets Storage
├── vercel.json             Headers sécurité, cache, maxDuration
```

## Mise en route

La procédure complète de production et les commandes PowerShell sont dans
[`DEPLOYMENT.md`](DEPLOYMENT.md).

### 1. Supabase
1. Créer un projet sur [supabase.com](https://supabase.com).
2. SQL Editor → coller et exécuter `supabase/schema.sql` (tables, RLS, buckets).
3. Authentication → créer l'utilisateur SuperAdmin, puis :
   `update public.profiles set role = 'superadmin' where id = '<son-uuid>';`
4. Configurer l'identifiant et le PIN chiffré du SuperAdmin avec
   `supabase/setup-superadmin.sql`.
5. Storage → bucket `documents` : uploader `livre-blanc.pdf` et `livre-blanc.txt`
   (texte brut servant de source au générateur de quiz).

### 2. Stripe
1. Récupérer la clé secrète (`STRIPE_SECRET_KEY`).
2. Developers → Webhooks → endpoint `https://<domaine>/api/webhooks/stripe`,
   événement `checkout.session.completed` → copier le `STRIPE_WEBHOOK_SECRET`.

### 3. Vercel
1. Importer le repo (racine du projet = ce dossier).
2. Settings → Environment Variables : renseigner toutes les variables de `.env.example`.
   `ADMIN_PIN_COOKIE_SECRET` doit être une valeur aléatoire d'au moins 32 caractères.
3. Frontend : remplir `js/env.js` avec `SUPABASE_URL` et `SUPABASE_ANON_KEY`
   (clés publiques — indispensables pour `login.html` et `admin.html`).
3. Déployer. Les fichiers de `/api` deviennent automatiquement des fonctions
   (aucun rewrite nécessaire) ; le reste est servi en statique sur l'Edge Network.
4. (DAT) Placer Cloudflare en proxy devant le domaine : WAF + rate-limiting
   sur `/api/members` et `/api/create-checkout`.

### Dev local

```bash
npm install
npm run dev      # sert le statique + les fonctions /api sur localhost:4886
npm run check    # contrôle local avant déploiement
```

## Règles de sécurité (non négociables)

- Le frontend n'utilise **que** `SUPABASE_ANON_KEY` (RLS active) et, au besoin,
  `STRIPE_PUBLISHABLE_KEY`.
- **Aucune clé secrète** (Stripe, Anthropic, ElevenLabs, `service_role`) ne doit
  apparaître dans le HTML/CSS/JS : tout passe par `/api/*`.
- `members`, `donations`, `leads_livreblanc` : zéro accès anon direct — écriture
  via les fonctions serveur uniquement, lecture réservée au SuperAdmin.
- Le PIN SuperAdmin est haché dans PostgreSQL et peut être modifié depuis
  l'onglet Sécurité du dashboard ; il n'est jamais renvoyé au navigateur.
- Webhook Stripe : signature vérifiée sur le corps brut (`bodyParser` désactivé).

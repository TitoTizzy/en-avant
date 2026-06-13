# Déploiement Vercel - En Avant

## 1. Avant le déploiement

Dans Supabase SQL Editor, exécuter à nouveau :

```text
supabase/lock-admin-api.sql
supabase/verify.sql
```

Dans le bucket privé `documents`, vérifier la présence de :

```text
livre-blanc.pdf
livre-blanc.txt
```

Compléter les variables manquantes dans `.env`, puis lancer :

```powershell
cd "C:\Users\ouhha\OneDrive\Desktop\EnAvant"
npm run check
```

Le contrôle doit terminer sans ligne `[À FAIRE]`.

## 2. Premier déploiement

```powershell
cd "C:\Users\ouhha\OneDrive\Desktop\EnAvant"
npx vercel login
npx vercel link
npx vercel
```

Dans Vercel, ouvrir **Settings > Environment Variables** et ajouter pour
`Production`, `Preview` et `Development` :

```text
SITE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PIN_COOKIE_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_FROM
ANTHROPIC_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
LIVRE_BLANC_TEXT_PATH
LIVRE_BLANC_PDF_PATH
```

Ne jamais ajouter ces secrets dans `js/env.js`. Ce fichier ne doit contenir
que `SUPABASE_URL` et `SUPABASE_ANON_KEY`.

## 3. Production

Mettre `SITE_URL` à l’URL publique exacte, sans slash final, puis :

```powershell
cd "C:\Users\ouhha\OneDrive\Desktop\EnAvant"
npm run check
npx vercel --prod
```

Configurer ensuite le webhook Stripe :

```text
https://VOTRE-DOMAINE/api/webhooks/stripe
```

Événement requis :

```text
checkout.session.completed
```

## 4. Contrôles après déploiement

1. Connexion SuperAdmin avec identifiant puis email.
2. Vérification du PIN et ouverture du dashboard.
3. Création puis publication d’un article.
4. Ajout d’un événement et d’une photo dans la médiathèque.
5. Adhésion test avec NINU unique.
6. Génération d’une question Trivia.
7. Lecture audio d’un article publié.
8. Envoi du Livre blanc vers une adresse de test.
9. Don Stripe en mode test, puis vérification du webhook dans le dashboard Stripe.
10. Vérification de l’onglet `Intégrations` du dashboard.

# Déploiement Vercel - En Avant

## 1. Avant le déploiement

Utiliser Node.js 22, comme indiqué par `package.json` et `.nvmrc`.
Le Node système 24.15 de cet environnement a présenté un plantage natif au
chargement de `node:https`, indépendant du projet. La validation finale des
21 tests a été réalisée avec le runtime fourni par l'application (24.22.3).
La recette sur le runtime Node 22 de Vercel reste à effectuer avant production.

Dans Supabase SQL Editor, exécuter à nouveau :

```text
supabase/lock-admin-api.sql
supabase/donations-stripe.sql
supabase/security-hardening.sql
supabase/verify.sql
```

Pour une base neuve, exécuter d'abord dans cet ordre : `schema.sql`,
`add-member-role.sql`, `add-user-permissions.sql`, `articles-review.sql`,
`team.sql`, `team-sections.sql`, `site-settings.sql`, puis les scripts ci-dessus.
Ne pas réexécuter `schema.sql` après `security-hardening.sql` : le schéma initial
réaccorde certains accès directs retirés par la migration de sécurité.

Activer **Confirm email** dans Supabase Authentication, configurer l'expéditeur
SMTP et autoriser `https://VOTRE-DOMAINE/login` dans les URL de redirection.
La création du profil membre fait partie de la transaction Auth. Si la
confirmation est désactivée, l'API refuse l'inscription et retire le nouveau
compte non vérifié.

La migration doit précéder la nouvelle API : les quotas, les parties de quiz et
le journal Stripe échouent volontairement si elle manque. Appliquer les deux
pendant une fenêtre de maintenance ; les anciens clients de quiz devront
recharger la page. La migration retire l'accès direct aux réponses du quiz.
Les anciens scores non vérifiés restent en base, mais quittent le classement.

Les permissions `voir_membres`, `voir_ninu`, `traiter_membres`, `voir_dons`,
`voir_leads` et `exporter_donnees` sont indépendantes. Un export exige aussi le
droit de lecture de son jeu de données. `acces_dashboard` seul ne donne aucun
accès à ces données. Le SuperAdmin conserve tous les droits après PIN.

Exécuter `npm test` avant le déploiement. Les tests utilisent des services
simulés et PostgreSQL local embarqué, sans écriture sur Supabase distant.

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
AI_DAILY_LIMIT
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

Événements requis (version du webhook : `2025-08-27.basil`) :

```text
checkout.session.completed
checkout.session.async_payment_succeeded
invoice.paid
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

## 4. Contrôles après déploiement

1. Connexion SuperAdmin avec identifiant puis email.
2. Vérification du PIN et ouverture du dashboard.
3. Création puis publication d’un article.
4. Ajout d’un événement et d’une photo dans la médiathèque.
5. Adhésion test avec NINU unique.
6. Génération d’une question Trivia.
7. Inscription membre, réception de l'email et confirmation avant connexion.
8. Envoi du Livre blanc vers une adresse de test.
9. Don Stripe en mode test, puis vérification du webhook dans le dashboard Stripe.
10. Vérification de l’onglet `Intégrations` du dashboard.

11. Vérifier avec un compte limité que lecture, NINU, export et validation
    d'adhésion sont refusés sans leurs permissions respectives.
12. Tester une échéance mensuelle, un remboursement partiel puis complet et
    un rejeu du même webhook ; les totaux sont nets et séparés par devise.

Après une mise à jour de DOMPurify, exécuter `npm run vendor:sync` et `npm test`
pour mettre à jour la copie navigateur versionnée et sa licence.

L'absence de clés locales n'établit pas leur absence en production. Ne jamais
remplacer une clé manquante par une valeur factice pour rendre le contrôle vert.

# Corrections du frontend et du backend

Le rapport `AUDIT-EN-AVANT.md` décrit l'état antérieur. Les corrections présentes
dans le workspace couvrent les failles identifiées, sans attester une mise en
production ni la configuration des services distants.

- HTML éditorial assaini sur les écritures API et au rendu public/admin ; textes
  et attributs échappés dans l'espace membre, le blog et le dashboard.
- Permissions serveur séparées pour les listes privées, le NINU, les exports et
  le traitement des adhésions. La réponse générale filtre aussi ses données.
- Inscription avec confirmation email Supabase et profil membre créé par trigger
  transactionnel ; aucune attribution de rôle depuis les métadonnées du demandeur.
- Quotas partagés en PostgreSQL pour les routes sensibles, par utilisateur et au
  niveau global pour l'IA. Les écritures de questions sont attendues.
- Parties de quiz privées, réponses verrouillées une par une et scores calculés
  en base. Les anciens scores non vérifiés sont exclus du classement.
- Journal Stripe atomique, rapprochement des événements désordonnés, replays sans
  doublon, remboursements partiels et clôture des litiges. Échecs de recherche
  réessayables. Prix Stripe vérifiés avant checkout et clé d'idempotence par tentative.
- Totaux nets agrégés en base et séparés par devise, sans liste tronquée.
- États distincts pour article absent et service indisponible. Le retour de Stripe
  n'est plus présenté comme preuve de paiement.
- Routes de développement alignées sur les rewrites ; URLs propres et blocage des
  fichiers internes. Protection des fichiers sensibles conservée dans `.vercelignore`.

## Validation

`npm test` exécute des tests de handlers, de parcours DOM et de PostgreSQL embarqué
(PGlite). Aucun paiement, envoi d'email ni changement Supabase distant n'est effectué.
Résultat final : 21 tests réussis avec Node 24.22.3 fourni par l'application.
Le Node système 24.15 plante sur son propre module HTTPS ; Node 22 reste la
version déclarée pour le projet et la production. L'audit npm après correction
de la dépendance `qs` ne signalait aucune vulnérabilité connue.
`npm run check` inspecte désormais tous les fichiers HTML, JS et CSS publics pour
les secrets connus, et vérifie la présence des nouveaux fichiers nécessaires.

## Activation restante

Suivre `DEPLOYMENT.md` : migrations dans l'ordre, confirmation email et SMTP Auth,
événements Stripe, variables Vercel, puis déploiement et recette des services réels.
Les quotas et le quiz échouent volontairement si la migration de sécurité manque.
Les clés Stripe, Resend et Anthropic absentes localement n'ont pas été remplacées
par des valeurs factices. Le rendu mobile visuel n'a pas été certifié par les tests DOM.

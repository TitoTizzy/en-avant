# Déploiement des compléments de sécurité

Cette branche part du commit `9eeff2f` de `origin/main`. Les adhésions unifiées,
le rôle `pending`, les approbations, invitations, relances, notifications,
statistiques, réglages mobiles, traductions GTranslate et SEO sont conservés.
L'ancien formulaire d'inscription séparé n'est pas réintroduit.

## Avant la production

1. Vérifier que les migrations de la version actuelle de Claude sont appliquées,
   en particulier `adhesion-unifiee.sql`, `activation.sql`, `notifications.sql`,
   `push.sql`, `relances.sql`, `articles-review.sql`, `add-user-permissions.sql`,
   `donations-stripe.sql` et `securite-p0.sql`.
2. Appliquer `supabase/security-hardening.sql`. Elle préserve le défaut `pending`
   et le trigger Auth existants ; elle ne transforme aucun demandeur en membre.
3. Exécuter `npm test` sous Node 22. Le lint et les tests d'import de Claude sont
   conservés, suivis des tests DOM et PostgreSQL embarqué supplémentaires.
4. Déployer une prévisualisation Vercel puis tester l'adhésion, l'approbation,
   l'envoi du lien d'accès, la connexion, les onglets membres et les notifications.
5. Promouvoir en production seulement après la migration et ces vérifications.

Les quotas et les parties du quiz utilisent de nouvelles fonctions SQL. Sans la
migration, ces routes refusent les opérations ; ne pas pousser cette branche sur
la branche de production avant l'application de la migration.

Le webhook Stripe doit utiliser la version `2025-08-27.basil` et recevoir :
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`invoice.paid`, `charge.refunded`, `charge.dispute.created`,
`charge.dispute.updated`, `charge.dispute.closed`.

Le journal rapproche les événements désordonnés et distingue les remboursements
partiels. Les notifications de dons et d'alertes de Claude sont conservées.
Les totaux nets sont calculés en base par devise, avec le format de réponse déjà
utilisé par son dashboard et ses graphiques.

Le checkout vérifie les prix réellement configurés dans Stripe et utilise une
clé d'idempotence par tentative. Un montant libre doit fixer des bornes de
100 à 1 000 000 centimes USD. Un retour d'URL ne confirme pas le paiement.

## Bibliothèques de nettoyage HTML

Le format Quill, les images et les liens éditoriaux restent autorisés. Le rendu
navigateur utilise DOMPurify. Le nettoyeur serveur est compilé en CommonJS pour
rester compatible avec les tests qui désactivent `require(esm)` : une mise à jour
de dépendance ne doit pas réintroduire le défaut d'import déjà corrigé par Claude.
Après leur mise à jour, lancer `npm run vendor:sync`, puis `npm test`.
Les fichiers générés et leurs licences sont versionnés.

## Validation locale

Les 42 tests de la suite de Claude et 9 tests supplémentaires sont passés avec
le runtime fourni par l'application (Node 24.22.3), y compris ses imports avec
`require(esm)` désactivé. Node 22 reste la version de production déclarée.
Aucun paiement, email ni changement de Supabase distant n'a été exécuté par ces tests.
L'audit npm après correction des dépendances ne signalait aucune vulnérabilité.

# Activer les montants de don

La page propose 10, 25, 50, 100, 250, 500 et 1 000 USD, ainsi qu'un montant libre.
Tous les liens sont initialement vides : aucun paiement n'est possible et la page
annonce leur disponibilite prochaine.

Un montant correspond a un **Payment Link Stripe**, pas a une cle API differente.
Les cles secretes ne doivent jamais etre ajoutees aux fichiers publics.

1. Dans le dashboard Stripe, creer un paiement ponctuel a prix fixe pour chaque
   montant en USD. Quantite 1 non modifiable, sans autre produit, taxe, option ou
   remise susceptible de changer la somme. Verifier aussi la conversion de devise.
2. Copier chaque URL `https://buy.stripe.com/...` dans l'entree correspondante de
   `js/donation-links.js`. Laisser vide toute entree dont le lien n'est pas pret.
3. Pour `custom`, creer un lien « Le client choisit le montant » en USD. Le donateur
   saisira la somme sur Stripe ; ce lien ne doit pas servir pour les prix fixes.
4. Tester chaque lien en mode test : prix, devise, beneficiaire, paiement ponctuel
   et recu. Ne pas melanger liens de test et reels.
5. Configurer et tester le webhook pour le compte Stripe utilise si les dons doivent
   etre enregistres dans Supabase. La selection ne prouve pas cet enregistrement.
6. Remplacer les liens de test par les liens de production verifies et deployer.

Seuls les liens HTTPS sur `buy.stripe.com` sont acceptes. Une URL vide ou invalide
reste indisponible ; aucun lien de substitution n'est utilise. Les domaines Stripe
personnalises necessiteraient une adaptation de la liste autorisee.

Le code public ne peut pas lire le prix derriere une URL Stripe : verifier donc
l'association montant/lien dans Stripe avant activation. Le montant facture est
defini sur Stripe, jamais par le texte du bouton.

Documentation : https://docs.stripe.com/payment-links/create

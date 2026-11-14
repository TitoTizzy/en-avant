# Dons en ligne — configuration

Compte Stripe : **En Avant Miami Inc** (mode live). Les dons financent les activités
du parti En Avant en Haïti. Ils ne sont pas déductibles des impôts.

## Fonctionnement

1. `don.html` affiche le choix **Don unique / Don mensuel** et les montants.
2. `js/don.js` interroge `GET /api/create-checkout` : les montants ne deviennent
   cliquables que si le serveur répond `enabled: true`.
3. Au clic, `POST /api/create-checkout` reçoit `{ frequency, amount }`. Le serveur
   traduit cette clé en identifiant de prix Stripe via une **liste blanche**
   (`STRIPE_PRICE_*`) et ouvre une session Stripe Checkout.
4. `api/webhooks/stripe.js` enregistre les dons dans la table `donations`
   (unique : `checkout.session.completed` ; mensuel : `invoice.paid`), et met à jour
   le statut en cas de remboursement (`refunded`) ou de litige (`disputed`).

## Variables d'environnement (Vercel > Settings > Environment Variables)

| Variable | Rôle |
| --- | --- |
| `DONATIONS_ENABLED` | `true` pour ouvrir les dons. **Laisser `false`** tant que les conditions ci-dessous ne sont pas remplies. |
| `STRIPE_SECRET_KEY` | Clé secrète `sk_live_…`, serveur uniquement. |
| `STRIPE_WEBHOOK_SECRET` | Secret `whsec_…` du webhook `https://enavant.org/api/webhooks/stripe`. |
| `SITE_URL` | `https://enavant.org` (sert aux URL de retour Stripe). |
| `STRIPE_PRICE_UNIQUE_10` … `_1000`, `STRIPE_PRICE_UNIQUE_LIBRE` | Prix des dons uniques. |
| `STRIPE_PRICE_MENSUEL_10` … `_1000` | Prix des dons mensuels (pas de montant libre en mensuel). |

Les identifiants de prix ne sont pas secrets, mais ils restent côté serveur pour
que le navigateur ne puisse jamais imposer un prix. Les valeurs sont dans `.env`
(local, jamais commité) et doivent être recopiées dans Vercel.

Prix créés dans Stripe (produit `prod_Vd3iVBe8TcXOW2`), retrouvables par `lookup_key` :
`don_unique_10` … `don_unique_1000`, `don_unique_libre` (1 à 10 000 USD),
`don_mensuel_10` … `don_mensuel_1000`.

## Avant de passer `DONATIONS_ENABLED=true`

- [ ] Compte Stripe activé (représentant légal, conditions acceptées, compte bancaire).
- [ ] Avis d'un avocat américain sur l'enregistrement FARA (collecte aux États-Unis
      pour un parti politique étranger).
- [ ] Vérification par un juriste haïtien (loi de 2014 sur le financement des partis,
      plafonds annuels par donateur).
- [ ] Migration `supabase/donations-stripe.sql` exécutée.
- [ ] Politique de confidentialité et mentions légales publiées.
- [ ] Failles critiques de l'audit (`audit/AUDIT-EN-AVANT.md`, P0) corrigées.
- [ ] Un don réel de 10 USD testé puis remboursé ; ligne vérifiée dans `donations`.

## Tests

`node --test scripts/test-donations.mjs` — liste blanche, fermeture des dons,
refus des clés inconnues et des autres origines. Aucun appel à Stripe.

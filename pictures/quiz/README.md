# Images documentées du quiz

Source documentaire unique : `docs/livre-blanc.pdf` (218 pages).

40 visuels originaux dessinés par code : 20 pictogrammes de chantier, 10 objectifs chiffrés, 5 cartogrammes schématiques et 5 schémas/frises. Aucune photographie, aucun portrait réel. Aucun changement du quiz en production : cette livraison prépare seulement ses assets et leurs fiches pour un usage ultérieur.

Chaque image possède une variante 1200 × 675 et une variante 800 × 450, encodées en WebP qualité 80. Les fichiers sont décrits dans `manifest.json` ; `verification.json` contient les correspondances de chaque texte et fait avec les pages du PDF, sa somme SHA-256 et les poids des fichiers.

## Précautions pour la génération des questions

- Les numéros et intitulés des chantiers viennent des pages de titre de la partie II. Ils priment sur les exemples de noms de fichiers donnés dans la demande.
- Les valeurs affichées sont des objectifs du programme ou leur point de départ, pas des résultats constatés aujourd’hui. La légende et les faits font partie du contexte obligatoire.
- Les deux horizons de la justice sont parallèles : le schéma ne leur impose pas une succession.
- Les cartes sont des **cartogrammes en cases** des regroupements décrits page 105. Le document ne fournit pas de fond cartographique. Elles ne permettent aucune question sur les frontières, les superficies, les distances, les positions exactes ou les voisinages. Ce ne sont pas des cartes géographiques à l’échelle.
- Les regroupements Nord, Sud et zone métropolitaine sont ceux proposés dans le Livre blanc ; ne pas les présenter comme un nouveau découpage déjà adopté.
- Le PDF donne des valeurs différentes de couverture forestière dans ses états des lieux. Les assets concernés citent exclusivement la transition de 1,5% à 5% de la page 106 ; ne pas fusionner les chiffres d’autres pages.
- Le contrôle normalise Unicode NFC, les espaces et les césures typographiques de fin de ligne. Il ne modifie ni les chiffres, ni la casse, ni les mots. Certains intitulés conservent les accents et conventions du document source.
- Les pictogrammes sont symboliques ; leurs formes décoratives ne constituent pas de données quantitatives.

## Reproduire et contrôler

Prérequis : Python, Pillow, pypdf, polices Windows Segoe UI (`segoeui.ttf`, `segoeuib.ttf`).

```sh
python scripts/generate-quiz-images.py
python scripts/validate-quiz-images.py
```

Le validateur contrôle le JSON, les 40 identifiants, les catégories, les 80 fichiers, les dimensions, les poids, les fichiers orphelins et tous les éléments visibles/faits aux pages citées. Une planche de contrôle visuel a également été examinée aux dimensions d’un affichage mobile.

## Catalogue

| Image | Titre | Source |
|---|---|---|
| [quiz-chantier-01-securite](quiz-chantier-01-securite.webp) | SÉCURITÉ | docs/livre-blanc.pdf, page(s) PDF 38 (pagination imprimée identique). |
| [quiz-chantier-02-defense-et-protection-civile](quiz-chantier-02-defense-et-protection-civile.webp) | DÉFENSE ET PROTECTION CIVILE | docs/livre-blanc.pdf, page(s) PDF 52 (pagination imprimée identique). |
| [quiz-chantier-03-economie-et-creation-demplois](quiz-chantier-03-economie-et-creation-demplois.webp) | ECONOMIE ET CRÉATION D’EMPLOIS | docs/livre-blanc.pdf, page(s) PDF 56 (pagination imprimée identique). |
| [quiz-chantier-04-education](quiz-chantier-04-education.webp) | EDUCATION | docs/livre-blanc.pdf, page(s) PDF 65 (pagination imprimée identique). |
| [quiz-chantier-05-diaspora](quiz-chantier-05-diaspora.webp) | DIASPORA | docs/livre-blanc.pdf, page(s) PDF 79 (pagination imprimée identique). |
| [quiz-chantier-06-sante](quiz-chantier-06-sante.webp) | SANTÉ | docs/livre-blanc.pdf, page(s) PDF 86 (pagination imprimée identique). |
| [quiz-chantier-07-egalite-hommes-femmes](quiz-chantier-07-egalite-hommes-femmes.webp) | EGALITÉ HOMMES - FEMMES | docs/livre-blanc.pdf, page(s) PDF 94 (pagination imprimée identique). |
| [quiz-chantier-08-environnement-et-amenagement-du-territoire](quiz-chantier-08-environnement-et-amenagement-du-territoire.webp) | ENVIRONNEMENT ET AMÉNAGEMENT DU TERRITOIRE | docs/livre-blanc.pdf, page(s) PDF 102 (pagination imprimée identique). |
| [quiz-chantier-09-culture](quiz-chantier-09-culture.webp) | CULTURE | docs/livre-blanc.pdf, page(s) PDF 109 (pagination imprimée identique). |
| [quiz-chantier-10-jeunesse-sport-et-action-civique](quiz-chantier-10-jeunesse-sport-et-action-civique.webp) | JEUNESSE, SPORT ET ACTION CIVIQUE | docs/livre-blanc.pdf, page(s) PDF 114 (pagination imprimée identique). |
| [quiz-chantier-11-justice](quiz-chantier-11-justice.webp) | JUSTICE | docs/livre-blanc.pdf, page(s) PDF 119 (pagination imprimée identique). |
| [quiz-chantier-12-tourisme](quiz-chantier-12-tourisme.webp) | TOURISME | docs/livre-blanc.pdf, page(s) PDF 129 (pagination imprimée identique). |
| [quiz-chantier-13-infrastructures](quiz-chantier-13-infrastructures.webp) | INFRASTRUCTURES | docs/livre-blanc.pdf, page(s) PDF 137 (pagination imprimée identique). |
| [quiz-chantier-14-diplomatie-politique-etrangere-et-cooperation-externe](quiz-chantier-14-diplomatie-politique-etrangere-et-cooperation-externe.webp) | DIPLOMATIE, POLITIQUE ÉTRANGÈRE ET COOPÉRATION EXTERNE | docs/livre-blanc.pdf, page(s) PDF 146 (pagination imprimée identique). |
| [quiz-chantier-15-production-nationale-et-agriculture](quiz-chantier-15-production-nationale-et-agriculture.webp) | PRODUCTION NATIONALE ET AGRICULTURE | docs/livre-blanc.pdf, page(s) PDF 158 (pagination imprimée identique). |
| [quiz-chantier-16-transparence-et-reddition-de-comptes](quiz-chantier-16-transparence-et-reddition-de-comptes.webp) | TRANSPARENCE ET REDDITION DE COMPTES | docs/livre-blanc.pdf, page(s) PDF 165 (pagination imprimée identique). |
| [quiz-chantier-17-secteur-prive](quiz-chantier-17-secteur-prive.webp) | SECTEUR PRIVÉ | docs/livre-blanc.pdf, page(s) PDF 172 (pagination imprimée identique). |
| [quiz-chantier-18-energie](quiz-chantier-18-energie.webp) | ENERGIE | docs/livre-blanc.pdf, page(s) PDF 178 (pagination imprimée identique). |
| [quiz-chantier-19-mines](quiz-chantier-19-mines.webp) | MINES | docs/livre-blanc.pdf, page(s) PDF 185 (pagination imprimée identique). |
| [quiz-chantier-20-collectivites-territoriales](quiz-chantier-20-collectivites-territoriales.webp) | COLLECTIVITÉS TERRITORIALES | docs/livre-blanc.pdf, page(s) PDF 193 (pagination imprimée identique). |
| [quiz-chiffre-01-economie-emergente](quiz-chiffre-01-economie-emergente.webp) | 2054 — économie émergente | docs/livre-blanc.pdf, page(s) PDF 20 (pagination imprimée identique). |
| [quiz-chiffre-02-personnes-vivant-en-dessous-du-seuil-de-pauvrete](quiz-chiffre-02-personnes-vivant-en-dessous-du-seuil-de-pauvrete.webp) | 20% — personnes vivant en dessous du seuil de pauvreté | docs/livre-blanc.pdf, page(s) PDF 61 (pagination imprimée identique). |
| [quiz-chiffre-03-linflation](quiz-chiffre-03-linflation.webp) | 10% — l’inflation | docs/livre-blanc.pdf, page(s) PDF 61 (pagination imprimée identique). |
| [quiz-chiffre-04-couverture-sanitaire](quiz-chiffre-04-couverture-sanitaire.webp) | 100% — couverture sanitaire | docs/livre-blanc.pdf, page(s) PDF 89 (pagination imprimée identique). |
| [quiz-chiffre-05-budget-sante](quiz-chiffre-05-budget-sante.webp) | 15 % — budget santé | docs/livre-blanc.pdf, page(s) PDF 92 (pagination imprimée identique). |
| [quiz-chiffre-06-couverture-forestiere-depart](quiz-chiffre-06-couverture-forestiere-depart.webp) | 1,5% — couverture forestière | docs/livre-blanc.pdf, page(s) PDF 106 (pagination imprimée identique). |
| [quiz-chiffre-07-couverture-forestiere](quiz-chiffre-07-couverture-forestiere.webp) | 5% — couverture forestière | docs/livre-blanc.pdf, page(s) PDF 106 (pagination imprimée identique). |
| [quiz-chiffre-08-revenu-per-capita-rural](quiz-chiffre-08-revenu-per-capita-rural.webp) | 50% — revenu per capita rural | docs/livre-blanc.pdf, page(s) PDF 163 (pagination imprimée identique). |
| [quiz-chiffre-09-autosuffisance](quiz-chiffre-09-autosuffisance.webp) | 60% — autosuffisance | docs/livre-blanc.pdf, page(s) PDF 163 (pagination imprimée identique). |
| [quiz-chiffre-10-exportations-de-produits-agricoles](quiz-chiffre-10-exportations-de-produits-agricoles.webp) | 100% — exportations de produits agricoles | docs/livre-blanc.pdf, page(s) PDF 163 (pagination imprimée identique). |
| [quiz-carte-01-la-region-nord](quiz-carte-01-la-region-nord.webp) | La région Nord | docs/livre-blanc.pdf, page(s) PDF 105 (pagination imprimée identique). |
| [quiz-carte-02-la-region-sud](quiz-carte-02-la-region-sud.webp) | La région Sud | docs/livre-blanc.pdf, page(s) PDF 105 (pagination imprimée identique). |
| [quiz-carte-03-la-zone-metropolitaine](quiz-carte-03-la-zone-metropolitaine.webp) | La zone métropolitaine | docs/livre-blanc.pdf, page(s) PDF 105 (pagination imprimée identique). |
| [quiz-carte-04-artibonite](quiz-carte-04-artibonite.webp) | Artibonite | docs/livre-blanc.pdf, page(s) PDF 105 (pagination imprimée identique). |
| [quiz-carte-05-centre](quiz-carte-05-centre.webp) | Centre | docs/livre-blanc.pdf, page(s) PDF 105 (pagination imprimée identique). |
| [quiz-frise-01-energie](quiz-frise-01-energie.webp) | ENERGIE | docs/livre-blanc.pdf, page(s) PDF 178, 182 (pagination imprimée identique). |
| [quiz-frise-02-justice](quiz-frise-02-justice.webp) | JUSTICE | docs/livre-blanc.pdf, page(s) PDF 119, 123, 125 (pagination imprimée identique). |
| [quiz-frise-03-couverture-forestiere](quiz-frise-03-couverture-forestiere.webp) | couverture forestière | docs/livre-blanc.pdf, page(s) PDF 106 (pagination imprimée identique). |
| [quiz-frise-04-lacces](quiz-frise-04-lacces.webp) | l’accès | docs/livre-blanc.pdf, page(s) PDF 182 (pagination imprimée identique). |
| [quiz-frise-05-sante](quiz-frise-05-sante.webp) | Santé | docs/livre-blanc.pdf, page(s) PDF 89 (pagination imprimée identique). |

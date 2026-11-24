# Suivi partagé de développement — En Avant

Référence commune pour Myrtho, Claude et Codex. Créé le 21 novembre 2026 à partir du regroupement des feedbacks validé avec Myrtho.

## Règles de suivi

- Lire ce document avant de commencer une tâche et préserver le travail existant de Claude et Codex.
- Suivre la liste technique ci-dessous dans l'ordre, une tâche à la fois. Prochaine tâche : **DEV-01**. La création de ce suivi ne démarre pas son implémentation.
- Statuts : **À faire**, **En cours**, **En attente externe**, **Terminé**.
- Avant de travailler, vérifier l'état réel du code pour éviter de refaire une fonction déjà livrée.
- Après chaque tâche achevée, inscrire **Terminé** à côté de son numéro, avec la date, l'auteur, les changements et les vérifications dans le journal. Mettre à jour la prochaine tâche.
- Distinguer implémentation, validation et déploiement. Une tâche nécessitant une configuration ou une validation non obtenue ne devient pas « Terminé » sur la seule présence du code.
- Mentionner le commit et le déploiement quand ils existent ; sinon écrire « non effectué ». Ne jamais consigner de secrets ni de données personnelles dans ce fichier.
- Si une dépendance empêche de terminer une tâche, noter précisément le blocage. Ne pas modifier silencieusement l'ordre convenu ; demander l'arbitrage de Myrtho si nécessaire.

## Déjà terminé — ne pas remettre au backlog

| Élément | Statut | Référence / validation connue |
|---|---|---|
| Langues et traductions | **Terminé** | Confirmation de Myrtho et d'Aurélie. |
| Alignements demandés du footer sur ordinateur et téléphone | **Terminé** | Correction publiée ; commit `f2383d6`. |
| Ajout de TikTok et alignement des réseaux sociaux et liens légaux | **Terminé** | Correction publiée ; commit `f2383d6`. |
| Soulignement du menu hamburger, sans changement du menu desktop | **Terminé** | Correction publiée ; commit `035270f`. |
| Parcours d'adhésion, emails et notifications | **Terminé** | Travail de Claude confirmé par Myrtho. Le classement territorial reste DEV-01. |
| Publication GitHub et Vercel des corrections visuelles ci-dessus | **Terminé** | Livraison sur enavant.org rapportée dans le suivi de conversation. |

## 1. Travaux techniques — ordre convenu

Ces tâches peuvent avancer sans attendre les photos, textes ou coordonnées des responsables. Les dépendances de configuration restent à signaler.

| Ordre | Chantier | Statut | Résultat attendu pour clôturer |
|---|---|---|---|
| DEV-01 | Organisation territoriale | **À faire** | Modèle pays, départements, communes et branches ; rattachement des membres ; compatibilité avec les adhésions et données existantes ; vérifications documentées. |
| DEV-02 | Administration par branche | **À faire** | Accès limités à la branche autorisée et supervision nationale ; contrôle des permissions côté serveur et vérification de l'isolation entre branches. Dépend de DEV-01. |
| DEV-03 | Espaces publics des branches | **À faire** | Modèles de pages et gestion des responsables, coordonnées et activités ; traitement propre des champs vides sans inventer de contenu. Dépend de DEV-01. |
| DEV-04 | Calendrier public | **À faire** | Liste et détails des événements, filtres utiles, connexion à l'administration existante et rattachement aux branches. |
| DEV-05 | Inscriptions aux événements | **À faire** | Formulaires, confirmations et listes de participants avec accès autorisés et vérification du parcours. Dépend de DEV-04. |
| DEV-06 | Newsletter | **À faire** | Abonnement, désabonnement et gestion des abonnés ; configuration du service email et vérification de l'envoi avant clôture. Ne pas confondre avec les emails d'adhésion déjà livrés. |
| DEV-07 | Quiz : explications et vérifications techniques | **À faire** | Explication claire du fonctionnement ; vérification des besoins techniques restants sans refaire les scores et classements déjà sécurisés. La validation éditoriale reste EXT-07. |
| DEV-08 | Sauvegardes et restauration | **À faire** | Vérification de la configuration réelle de Supabase et documentation d'une procédure de restauration vérifiée. L'absence de code de sauvegarde dans le dépôt ne prouve pas l'absence de sauvegardes. |

## 2. Contenus, informations et validations externes

| Référence | Chantier | Statut | Apport attendu |
|---|---|---|---|
| EXT-01 | Dons | **En attente externe** | Informations de **Jocelyn David**, puis configuration par Myrtho. Intégration Stripe déjà développée ; vérifier et activer le parcours lorsque les informations seront disponibles. |
| EXT-02 | Politique de confidentialité | **En attente externe** | Usages des données, durées de conservation, contact responsable et validation du texte final. La page indique encore une rédaction en cours lors du dernier examen. |
| EXT-03 | Contenu des branches | **En attente externe** | Noms, fonctions, photos, coordonnées et informations approuvées par la direction. |
| EXT-04 | Événements réels | **En attente externe** | Dates, lieux, descriptions, visuels et modalités de participation. |
| EXT-05 | Actualités et publications | **En attente externe** | Articles, annonces, photos, vidéos et documents validés ; responsable et rythme de publication. |
| EXT-06 | Contenu de la newsletter | **En attente externe** | Contenu des éditions, fréquence et personne responsable de la validation. |
| EXT-07 | Validation éditoriale du quiz | **En attente externe** | Relecture des questions et réponses par une personne maîtrisant le Livre blanc. |

## Journal des réalisations

### Demande prioritaire du 23 novembre 2026 — images du quiz

Myrtho demande explicitement cette production avant la reprise de DEV-01 ; l'ordre DEV-01 à DEV-08 reste inchangé pour la suite.

| Référence | Statut | Périmètre et livraison |
|---|---|---|
| QUIZ-IMAGES | **En cours** | 20 chantiers, 10 chiffres, 5 cartogrammes schématiques et 5 frises/schémas ; source unique PDF ; 2 formats WebP par image ; manifeste et contrôle des sources. Branche `feat/quiz-images`, PR à ouvrir, aucune poussée directe sur main. |

| Date | Référence | Auteur | Réalisation et vérification | Commit / déploiement |
|---|---|---|---|---|
| 2026-11-21 | Suivi partagé | Codex | Regroupement des feedbacks, distinction technique / externe, ordre de travail et éléments déjà terminés consignés. Aucune fonction du site modifiée. | Non effectué à la création du suivi. |

## Communication à l'équipe

Après validation, préparer pour Myrtho un bilan des éléments terminés et des dépendances restantes, afin qu'il puisse informer Aurélie. Ne pas envoyer de message externe sans instruction explicite.

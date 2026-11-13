# Audit technique et SEO — En Avant

Date : 12 novembre 2026. Dossier audité : `C:\Users\ouhha\OneDrive\Desktop\EnAvant`.

## Verdict

**Note globale provisoire : 4/10 (38/100 sur la grille ci-dessous).**

Le projet possède une structure fonctionnelle ambitieuse et plusieurs bons réflexes de sécurité. Toutefois, la présence de nombreuses fonctionnalités ne prouve pas leur fiabilité. Les permissions du tableau de bord sont trop larges, les articles masquent leurs erreurs par du contenu de démonstration, le référencement des articles est incomplet, et la protection des données d'adhésion est insuffisamment documentée. Je déconseille une validation de production pour les parcours sensibles avant correction des priorités P0 et recette sur une préproduction.

Cette note évalue la préparation technique du code lisible. Elle n'est ni une note Lighthouse, ni une certification de sécurité, ni une mesure du classement Google. Le rendu graphique, les contrastes réels et les performances en production ne sont pas notés faute de mesures dans un navigateur.

| Domaine | Maximum | Points accordés | Justification |
|---|---:|---:|---|
| Sécurité et protection des données | 30 | 10 | Vérification serveur des sessions et cookie PIN signé ; permissions trop générales, emails auto-confirmés, injections HTML et quotas IA insuffisants |
| SEO technique et éditorial | 25 | 8 | Titres, descriptions et contenu statique présents ; canonicals absentes, articles peu préparés pour les robots et partages, repli de démonstration |
| Fiabilité des fonctions métier | 20 | 8 | API structurée et webhook signé ; scores déclaratifs, erreurs profil ignorées, total des dons tronqué |
| Maintenabilité et validation | 15 | 8 | Helpers et dossiers cohérents ; contrôles superficiels, migrations manuelles et documentation désynchronisée |
| Préparation des ressources et du cache | 10 | 4 | Cache et lazy loading partiels ; images lourdes, PDF volumineux et images immuables sans version dans le nom |
| **Total** | **100** | **38** | Arrondi de communication : **4/10** |

Il s'agit d'une grille d'appréciation professionnelle, pas d'un calcul automatique. Les fichiers inaccessibles constituent des réserves d'audit : leur contenu n'est pas présumé défectueux.

## Périmètre et limites

Ont été examinés : les 15 pages HTML principales, `README.md`, `DEPLOYMENT.md`, `package.json`, `vercel.json`, les contrôles locaux et les modules API/JS lisibles. Les preuves détaillées et la liste des lectures réussies ou échouées se trouvent dans `evidence.json`, produit par `verify-audit.mjs`.

Malgré l'amélioration de l'accès OneDrive, des fichiers essentiels renvoient encore « The cloud operation was unsuccessful » : notamment des routeurs API, `supabase/schema.sql`, plusieurs migrations, `js/admin.js`, `js/app.js`, `css/blog.css`, `css/style.css` et les endpoints d'adhésion. Leurs garanties ne peuvent pas être certifiées. `js/premium.js` et les CSS `premium.css` et `ultra.css`, initialement illisibles, ont finalement pu être lus. Le rapport progresse sur les preuves disponibles au lieu de bloquer toute l'analyse.

Résultats de vérification : **62 fichiers source lus, 28 lectures échouées, 15 pages HTML analysées, 33 fichiers JavaScript/MJS lisibles sans erreur de syntaxe**. Les **six vérifications isolées reproduisent les six défauts attendus** : compteur par instance, score falsifiable, export NINU avec droit général, email auto-confirmé/profil en erreur ignoré, article de démonstration sur slug invalide et injection HTML dans le titre membre. Cela ne constitue pas six tests de sécurité réussis.

`npm run check` a signalé cinq points : `.vscode/tasks.json` illisible et quatre variables d'intégration absentes localement (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`). Les variables de production Vercel n'ont pas été consultées ; on ne peut pas déduire de ces absences locales que la production est mal configurée. Le contrôle d'absence de secrets du projet porte sur un sous-ensemble des fichiers et tolère certaines lectures échouées : son résultat n'est pas une certification.

Aucun document de cadrage distinct n'a été identifié dans l'inventaire, au-delà des documents techniques et du livre blanc. Le livre blanc politique ne remplace pas un cahier de recette technique. La conformité à un cadrage non lisible ou absent reste à établir.

Aucun paiement, email, création de compte réel, écriture Supabase ou déploiement n'a été exécuté. Aucun secret n'est reproduit dans ce rapport. Le domaine `enavant.org` apparaît dans le code ; son rattachement à ce déploiement n'a pas été vérifié. Aucun résultat HTTP de production, rapport Search Console, audit de dépendances réseau ou mesure Core Web Vitals n'est inventé.

## Ce qui est correctement engagé

- Séparation entre frontend et clés serveur ; client `service_role` réservé au backend dans le code examiné.
- Validation du token par `supabase.auth.getUser()` et contrôle du rôle/permission côté serveur.
- Cookie PIN signé par HMAC, comparaison temporellement sûre, `HttpOnly`, `SameSite=Strict` et expiration courte.
- Signature Stripe vérifiée sur le corps brut, vérification du statut `paid`, traitement particulier des doublons PostgreSQL et réponse 500 en cas d'échec de traitement.
- Entêtes `nosniff`, anti-iframe, HSTS, Referrer-Policy et Permissions-Policy configurés.
- Titres, descriptions, langue française, balises de structure et attributs ARIA présents dans les pages publiques.
- Plusieurs composants de l'organigramme utilisent `textContent`, une bonne pratique à généraliser.
- Les CSS finalement lisibles prévoient `:focus-visible` et `prefers-reduced-motion`, et un repli pour les éléments animés lorsque JavaScript est absent. Leur fonctionnement réel reste à tester dans le navigateur.
- Statique HTML simple : aucune migration vers React ou Next.js n'est nécessaire pour corriger les problèmes recensés.

## Écarts entre la documentation et le produit

| Promesse documentaire | État observé | Conséquence |
|---|---|---|
| Dons Stripe | API présente ; `don.html` annonce la carte bancaire « bientôt disponible » et propose Cash App/Zelle | Une API ne constitue pas un parcours de don opérationnel |
| Livre blanc obtenu par formulaire/email | `livre-blanc.html` donne accès directement à `/docs/livre-blanc.pdf` | Choisir explicitement accès libre, envoi email facultatif ou accès contrôlé ; le PDF local est déjà public dans le code |
| Contrôle avant déploiement | Le script vérifie principalement présence, JSON, variables et un sous-ensemble du frontend | Un contrôle vert ne démontre pas que les permissions, paiements ou adhésions fonctionnent |
| Serveur local « comme sur Vercel » | `dev-server.mjs` ne reproduit ni les rewrites de `vercel.json` ni `cleanUrls` | Risque de faux échecs ou de différences entre local et déploiement |
| Procédure SQL | README : schéma initial ; déploiement : verrouillage et vérification ; plusieurs migrations supplémentaires présentes | Une base neuve n'a pas un parcours d'installation complètement explicite |
| Lecture audio d'article dans la recette | La recette la réclame et une migration supprime le TTS ; la page article examinée n'expose pas ce lecteur | Clarifier la fonctionnalité attendue et mettre à jour la recette |

## Constats prioritaires

### F01 — Les permissions du dashboard donnent trop de droits — P0

**Preuve :** `api/_admin/dashboard.js:9` ne demande que `acces_dashboard`. Le même handler permet ensuite `PATCH` sur les statuts d'adhésion, consultation/export des adhérents avec NINU, dons et leads. La réponse GET générale retourne aussi ces données. `requirePermission` dans `api/_lib/supabase.js` accepte un non-superadmin qui possède cette permission.

**Impact :** donner accès à l'interface revient aussi à donner accès à des données privées et à une mutation métier. Ce n'est pas un accès anonyme démontré ; c'est une séparation insuffisante des droits d'utilisateurs déjà authentifiés.

**Correction :** permissions distinctes pour statistiques, lecture des adhérents, NINU, exports, dons et validation d'adhésion. Contrôler chaque branche et filtrer aussi la réponse par défaut. Masquer un onglet dans le navigateur n'est pas un contrôle d'accès.

### F02 — Données non échappées dans l'espace membre — P0

**Preuve :** `membre.html:576` insère `a.titre`, `a.excerpt` et `a.review_note` dans une chaîne affectée à `innerHTML`. `api/_member/articles.js` accepte titre/extrait comme texte sans encodage HTML. Une vérification isolée confirme qu'une balise fournie dans le titre se retrouve telle quelle dans le HTML rendu.

**Impact :** injection HTML et risque XSS persistante dans ce rendu. Le scénario directement établi concerne l'espace de l'auteur ; une exploitation vers un administrateur n'a pas été démontrée, car son module de rendu reste inaccessible.

**Correction :** construire ces éléments avec `createElement` et `textContent`. Même défaut à corriger dans `js/premium.js:504` : le pseudo/nom des métadonnées de session est interpolé dans `innerHTML`. Pour le corps éditorial HTML, appliquer une politique d'assainissement explicite. `clean()` ne fait qu'un `trim()` et n'est pas un assainisseur.

### F03 — Corps d'article inséré en HTML sans protection locale — P0

**Preuve :** `js/article.js:58` affecte `article.contenu` à `innerHTML`. L'API membre accepte du contenu HTML sans assainissement visible. Le traitement éventuel dans le module admin de publication n'a pas pu être lu.

**Impact :** point d'injection public dangereux si le contenu atteint la publication sans assainissement. La chaîne complète membre → validation → public reste à vérifier ; ce rapport ne prétend pas avoir démontré une XSS publique exploitable.

**Correction :** une liste de balises/attributs autorisés côté serveur, protection du rendu avec un outil éprouvé et suppression des gestionnaires `on*`, URL dangereuses et éléments actifs. Réexaminer aussi les anciens articles. Ajouter une CSP comme défense complémentaire.

### F04 — Email déclaré confirmé sans preuve de possession — P0

**Preuve :** `api/_auth/register.js:36` transmet `email_confirm: true` à `auth.admin.createUser()` depuis une inscription publique. L'erreur du `profiles.update()` suivant n'est pas contrôlée avant le succès 201.

**Impact :** création d'un compte au nom d'une adresse que le demandeur ne possède pas, et succès apparent possible avec profil mal initialisé. Le changement de rôle peut échouer silencieusement.

**Correction :** inscription avec vérification email réelle et redirection autorisée ; droits membre attribués côté serveur selon un mécanisme sûr. Contrôler chaque erreur et prévoir une reprise si Auth et profil divergent.

### F05 — Coûts IA insuffisamment bornés — P0

**Preuve :** `api/_trivia/generate-session.js` autorise tout membre, puis appelle Anthropic sans rate limit, quota utilisateur ou plafond journalier visible. Chaque appel relit le document et utilise jusqu'à 60 000 caractères. L'insertion est lancée avec `.then()` sans être attendue avant la réponse.

**Impact :** multiplication des appels payants, croissance de la banque de questions et persistance non garantie en contexte serverless. L'inscription libre amplifie le risque. L'absence de clé locale limite actuellement la disponibilité locale, pas le défaut de conception une fois activée.

**Correction :** quota atomique partagé avant l'appel, limite de concurrence, plafond global, cache de questions validées et insertion attendue. Échantillonner des sections du document au lieu de tronquer toujours son début.

### F06 — Politique de confidentialité et mentions légales factices — P0

**Preuve :** les liens légaux de 11 pages publiques pointent vers `#`. Le formulaire d'adhésion demande identité, email, téléphone, ville et NINU, avec une case évoquant une politique non consultable. Le dashboard expose le NINU complet aux détenteurs du droit général.

**Impact :** information utilisateur incomplète et exposition accrue de données associées à une adhésion politique. Aucune conformité juridique n'est certifiée ici.

**Correction :** pages réelles, explication des finalités, destinataires, durée de conservation et contact ; justification de chaque donnée ; NINU masqué par défaut ; restriction et journalisation des accès/exports. Le responsable du parti doit valider ces décisions et les textes avec les compétences appropriées.

### F07 — Limiteur en mémoire insuffisant pour plusieurs instances — P1

**Preuve :** `api/_lib/http.js` utilise une `Map` locale indexée par endpoint/IP. Deux instances isolées acceptent chacune leur propre quota. Le commentaire reconnaît cette limite et le README prévoit un WAF externe, dont la configuration n'est pas vérifiée.

**Correction :** compteur partagé atomique et règles de périphérie vérifiées. Pour la connexion, limites distinctes par compte et par IP. Ne pas faire confiance à un `x-forwarded-for` contrôlable hors du proxy attendu.

### F08 — Une erreur d'article devient un faux contenu valide — P1

**Preuve :** `js/article.js:97` à la fin de `load()` : article absent, erreur réseau ou absence de slug conduisent au même communiqué de démonstration daté. `blog.html:129`, `172`, `215` contient trois titres différents liés au même `/article-details.html` sans slug.

**Impact :** lien trompeur, contenu dupliqué et risque de soft 404. Une API 404 n'est pas une page HTML 404 : le document statique a déjà été servi.

**Correction :** supprimer ces replis en production ; distinguer 404 et indisponibilité ; servir un véritable statut 404/503 au niveau de la page ; donner une URL unique à chaque article réel.

### F09 — SEO des articles et métadonnées incomplets — P1

**Preuve :** `article-details.html:15` contient `Article | En Avant` et une description générique, puis un corps « Chargement… ». Le JS modifie le titre seulement. Pas de canonical dans les 15 pages HTML principales ; aucun `robots.txt` ou sitemap dans l'inventaire source. Les images OG de l'accueil et du blog visent `/assets/images/...`, absent du dossier.

**Nuance :** Google peut rendre du JavaScript ; le site n'est pas automatiquement non indexable. Les robots de partage et le traitement des erreurs sont néanmoins mal servis. Une image distante pourrait exister sur le domaine : son échec HTTP n'a pas été testé.

**Correction :** générer ou rendre les articles en HTML avec métadonnées propres, canonical, dates et contenu ; sitemap des URL publiques publiées ; images de partage existantes. Un `robots.txt` n'est ni obligatoire pour être indexé, ni une protection des espaces privés.

### F10 — Classement du quiz falsifiable — P1

**Preuve :** `api/_trivia/score.js` accepte directement `score`, `total` et `user_session` du navigateur. Un score 50/50 est accepté par le handler simulé sans aucune réponse de quiz. Le GET choisit le classement seulement parmi les 300 soumissions les plus récentes.

**Impact :** classement manipulable, résultats anciens potentiellement ignorés. La validation de bornes numériques ne vérifie pas une partie réelle.

**Correction :** identifiant de partie serveur, questions associées, réponses envoyées au serveur, score calculé côté serveur et enregistrement unique. Calculer le classement sur l'ensemble des parties pertinentes dans la base.

### F11 — Total des dons tronqué et non séparé par devise — P1

**Preuve :** `api/_admin/dashboard.js:112` sélectionne `montant` puis `.limit(5000)` ; la somme est calculée en JavaScript. Elle n'inclut pas `devise`. La limite effective du service peut être plus basse selon la configuration Supabase.

**Impact :** total inexact dès que le jeu de données dépasse la limite. Une addition de devises différentes serait également incorrecte ; le checkout actuellement lu crée des USD, donc le défaut multi-devise est latent.

**Correction :** agrégation SQL sur toutes les lignes et regroupement par devise ; tests avec plus de 5 000 dons fictifs et plusieurs devises sur une base de test.

### F12 — Paiements et procédures à aligner — P1

**Preuve :** la page présente Cash App/Zelle comme disponibles et Stripe comme futur. Le webhook ne traite que `checkout.session.completed` payé. Il traite le code `23505` comme doublon, mais la contrainte unique du schéma inaccessible n'a pas été confirmée.

**Autre défaut confirmé :** `js/don.js` affiche « Votre don a bien été enregistré » dès que l'URL contient `?statut=succes`, sans consulter l'état serveur. Toute personne peut donc afficher ce message sans paiement. Cela ne crée pas un don dans la base, mais constitue un faux accusé de réception visuel.

**Correction :** documenter les canaux réellement actifs, le bénéficiaire, le rapprochement et le reçu. Avant activation Stripe, vérifier signature, rejeu, contrainte unique, échecs base, montants et rapprochement. Prévoir les événements asynchrones/remboursements seulement si ces modes sont activés. Fixer `SITE_URL` à une origine autorisée au lieu d'utiliser les entêtes Host en secours. Ne confirmer un paiement à l'écran qu'après vérification d'une session de paiement côté serveur.

### F13 — Ressources lourdes et cache fragile — P1/P2

**Preuve :** 49 fichiers image totalisent 20 764 212 octets dans le dossier, ce qui n'est pas le poids d'une page chargée. PDF de 23 987 523 octets ; `chantier-05.jpeg` de 2 694 627 octets ; plusieurs autres images dépassent 1 Mo. Pas de `srcset` ni dimensions HTML explicites sur les images des pages principales. Une réservation en CSS reste possible et doit être contrôlée élément par élément. Le cache des images dure un an avec `immutable`, sans noms de fichiers hachés.

**Impact :** transferts potentiellement excessifs sur mobile et ancienne image conservée après remplacement. Aucun temps de chargement ni CLS réel n'a été mesuré. Les images de chantiers ne sont pas nécessairement toutes téléchargées au premier affichage.

**Correction :** variantes dimensionnées WebP/AVIF, dimensions ou ratio réservé, lazy loading sous la ligne de flottaison, hero prioritaire, PDF compressé et fichiers versionnés.

### F14 — Validation et maintenance trop manuelles — P2

**Preuve :** `scripts/check-project.mjs` ne teste pas les règles métier, ne lit qu'une sélection du frontend pour les secrets et peut considérer un fichier illisible comme une chaîne vide. `package.json` utilise `latest` pour le SDK Anthropic et ne propose aucun script de test métier. Le menu et le footer sont copiés entre pages ; `js/admin.js` dépasse 116 ko, mais sa qualité interne n'a pas été évaluée.

**Correction :** contrôles reproductibles en CI, lecture échouée = contrôle échoué, tests d'autorisations et de parcours, migrations ordonnées, versions maîtrisées, composants statiques partagés et modules JS par fonctionnalité.

### F15 — Initialisation fragile et loader dépendant du JavaScript — P1

**Preuve :** `js/premium.js` ajoute `js-ready` immédiatement ; son callback `DOMContentLoaded` commence ensuite par un accès `localStorage.getItem()` sans protection. Si le stockage lève une exception, les initialisations suivantes ne sont pas exécutées, alors que plusieurs éléments sont masqués par les styles `html.js-ready`. Le loader de l'accueil est un overlay fixe `z-index:9999`, masqué par une classe JS ou par l'état « déjà visité » ; aucun repli `noscript` n'apparaît dans l'accueil.

**Impact :** risque de menu ou contenu invisible lors d'une erreur de stockage ; accueil recouvert si JavaScript est désactivé avant la première visite. Ces états ont été établis par lecture du code et restent à reproduire visuellement.

**Correction :** rendre le contenu visible par défaut, activer les animations seulement après initialisation réussie, protéger les accès au stockage, isoler les modules et rendre le loader non bloquant. Ajouter ces scénarios à T14 et T16.

### F16 — Traduction automatique et fonctions inachevées à clarifier — P2

**Preuve :** le README annonce une source française traduite dynamiquement et `js/premium.js` charge Google Translate ; aucune URL linguistique ni `hreflang` n'apparaît dans les pages principales. Le bouton de chat ouvre seulement une alerte « bientôt disponible ».

**Impact :** la traduction à la volée ne fournit pas, à elle seule, une version créole ou anglaise stable et contrôlée éditorialement pour le référencement. Le chat suggère une fonction qui n'existe pas encore.

**Correction :** si le multilingue fait partie du cadrage, produire des pages FR/HT et éventuellement EN relues, avec URL propres, langue et liens alternatifs cohérents ; n'ajouter `hreflang` que pour des versions réellement disponibles. Retirer le bouton de chat ou annoncer clairement son état. À intégrer à T08/T09 et T17 après validation du périmètre.

## Plan d'exécution pour développeur débutant

Priorités : **P0** = avant validation des fonctions sensibles ; **P1** = avant lancement public complet ; **P2** = consolidation. Les étapes ci-dessous sont des tickets exécutables. Une revue expérimentée est nécessaire pour la conception des droits, l'assainissement HTML et les migrations de sécurité. Le débutant peut préparer et tester ces changements, mais ne doit pas improviser une politique de sécurité.

### Préparation commune — 0,5 à 1 jour

1. Rendre tous les fichiers disponibles hors ligne. Vérifier la liste `unreadable` du rapport de preuves.
2. Créer une branche dédiée ; conserver une sauvegarde du code et exporter une sauvegarde de la base avant toute migration.
3. Utiliser un projet Supabase de test, Stripe en mode test et une configuration email de test. Ne pas recopier automatiquement les données d'adhérents en préproduction.
4. Employer Node 22 comme demandé par `package.json` ; l'audit a été lancé avec Node 24.15.0, différence à éliminer en recette.
5. Lancer `npm ci`, puis `npm run check`. Le téléchargement des dépendances nécessite une connexion. Ne pas lancer les scripts de connexion réels avant d'avoir confirmé l'environnement ciblé.
6. Créer une fiche de recette : action, compte utilisé, résultat attendu, résultat obtenu, capture et date.

### T01 — Séparer les permissions — P0 — 1 à 2 jours

**Fichiers :** `api/_admin/dashboard.js`, définition des permissions, interface admin.

1. Écrire une matrice avec les permissions `voir_statistiques`, `lire_adherents`, `voir_ninu`, `exporter_adherents`, `valider_adherents`, `lire_dons`, `lire_leads`.
2. Faire valider cette matrice par le responsable du produit et un développeur expérimenté.
3. Ajouter un contrôle serveur avant chaque lecture, export et mutation. Le GET général ne doit plus renvoyer de données personnelles avec le seul droit d'ouverture.
4. Retourner un NINU masqué sauf droit spécifique ; ne pas envoyer la valeur complète puis la masquer en CSS.
5. Tester avec visiteur, membre, compte ayant seulement accès au dashboard, gestionnaire d'adhésions et superadmin.

**Terminé lorsque :** le compte « dashboard seulement » reçoit 403 sur les exports et PATCH, et aucune donnée privée dans le GET général. Les comptes autorisés conservent leurs fonctions attendues.

### T02 — Supprimer les injections HTML — P0 — 1 à 2 jours

**Fichiers :** `membre.html`, `js/article.js`, handlers de création/modification/publication et rendus admin.

1. Pour titre, extrait, note et pseudo affiché dans la navigation : créer des éléments DOM et renseigner `textContent`.
2. Définir les quelques balises nécessaires au contenu éditorial : paragraphes, titres, listes et liens sûrs.
3. Choisir une bibliothèque d'assainissement maintenue et adaptée au runtime ; ne pas écrire un filtre à base de remplacements regex.
4. Appliquer cette politique côté serveur à toutes les entrées d'articles et contrôler le rendu public. Réexaminer le contenu déjà enregistré.
5. Tester balises actives, attributs `on*`, liens `javascript:` et HTML valide sur préproduction avec des marqueurs inoffensifs.

**Terminé lorsque :** titre/extrait/note s'affichent comme texte, aucun contenu actif non autorisé n'exécute du JavaScript, les paragraphes et liens légitimes restent utilisables.

### T03 — Corriger l'inscription — P0 — 1 à 2 jours

**Fichiers :** `api/_auth/register.js`, `js/register.js`, Supabase Auth et trigger de profil.

1. Remplacer l'auto-confirmation par un parcours de confirmation email réel.
2. Configurer les URL de retour autorisées et l'expiration des liens.
3. Créer le profil et son rôle par un mécanisme serveur qui n'accepte aucun rôle fourni par le navigateur.
4. Traiter les erreurs de profil et les inscriptions répétées ; prévoir une reprise pour les comptes partiellement créés.
5. Afficher « Vérifiez votre email » et tester confirmation, expiration et renvoi.

**Terminé lorsque :** le compte non vérifié ne peut pas accéder aux fonctions membres, un rôle ne peut pas être choisi par le client, et une erreur de base ne produit pas un faux succès.

### T04 — Quotas et anti-abus partagés — P0/P1 — 1 à 2 jours

**Fichiers :** `api/_lib/http.js`, `api/_trivia/generate-session.js`, connexion/inscription/adhésion/checkout.

1. Ajouter un stockage partagé de compteurs atomiques, avec expiration.
2. Appliquer les limites sensibles par utilisateur et les limites d'entrée par IP fiable.
3. Consommer le quota IA avant l'appel ; limiter les appels simultanés et fixer un budget global.
4. Mettre en cache des questions validées ; attendre l'insertion ou employer une file persistante.
5. Tester deux processus simultanés, un quota atteint et une panne du fournisseur.

**Terminé lorsque :** deux instances partagent la même limite, un 429 n'entraîne aucun appel payant, et l'état de persistance est connu avant le succès.

### T05 — Confidentialité et cycle des données — P0 — 1 à 2 jours techniques, validation externe à prévoir

**Fichiers :** nouvelle page de confidentialité, mentions légales, footer, formulaire et API adhésion.

1. Faire documenter par le responsable : finalité du NINU, destinataires, durée, suppression et contact.
2. Créer les vraies pages et remplacer tous les liens `#` correspondants.
3. Relier directement la case du formulaire à la politique consultable.
4. Enregistrer côté serveur la version du texte accepté et l'heure, si la politique retenue le nécessite.
5. Masquer les identifiants dans les listes, limiter les exports et journaliser acteur/action/date sans copier les données sensibles dans les logs.
6. Tester accès, rectification et suppression avec des données fictives.

**Terminé lorsque :** les informations sont lisibles avant envoi et que les droits et durées sont effectivement appliqués, pas seulement écrits.

### T06 — Vérifier les RLS et migrations — P0 — 1 à 2 jours après accès complet

**Fichiers :** `supabase/schema.sql`, `lock-admin-api.sql`, migrations permissions/rôles/articles et fonctions PIN.

1. Établir l'ordre exact des migrations et les exécuter sur une base de test vide.
2. Vérifier RLS activée, privilèges des rôles, fonctions `SECURITY DEFINER`, `search_path` et accès aux buckets.
3. Avec les clés publiques et des comptes de test, tenter lecture/modification des profils, NINU, dons, rôles, PIN et documents privés.
4. Vérifier qu'aucune métadonnée utilisateur ne permet d'élever un rôle.
5. Vérifier une contrainte unique adaptée à l'identifiant de transaction Stripe.

**Terminé lorsque :** les tentatives non autorisées échouent et que toute la procédure fonctionne à partir d'une base vierge. Ne pas considérer le seul nom « lock-admin-api » comme une preuve.

### T07 — Articles et erreurs réelles — P1 — 1 à 2 jours

**Fichiers :** `js/article.js`, `blog.html`, routage Vercel et futur rendu d'article.

1. Supprimer `FALLBACK_ARTICLE` et les faux articles récents du chemin de production.
2. Remplacer les cartes de démonstration par des articles réels avec slug ; sinon afficher un état vide honnête.
3. Distinguer article absent, chargement et service indisponible.
4. Préparer un rendu serveur ou une génération statique pour servir le statut HTTP correct.

**Terminé lorsque :** un slug inconnu retourne une page HTTP 404 ; une panne produit une erreur adaptée, jamais un communiqué différent.

### T08 — Rendre les articles exploitables par les robots — P1 — 2 à 3 jours

**Fichiers :** génération/rendu HTML, API articles et configuration de routage.

1. Choisir une URL stable telle que `/actualites/mon-slug` et une seule version canonique.
2. Générer le HTML à la publication ou le rendre côté serveur, sans exiger de réécriture complète du site.
3. Produire titre, description, canonical, Open Graph, image, contenu, auteur et dates depuis l'article.
4. Ajouter les données structurées `Article` ou `NewsArticle` si appropriées, avec des informations réelles.
5. Définir comment une publication, modification ou dépublication invalide le cache ou régénère la page.

**Terminé lorsque :** « afficher le code source » montre le vrai article et ses métadonnées ; deux articles ont deux URL et aperçus distincts ; un brouillon n'est pas rendu publiquement.

### T09 — Canonicals, sitemap et cohérence des URL — P1 — 0,5 à 1 jour

1. Confirmer le domaine de production et son protocole ; ne pas supposer qu'il correspond à celui écrit dans les anciennes balises.
2. Harmoniser liens internes et `cleanUrls` ; choisir `/a-propos` et rediriger l'ancienne adresse sans casser les favoris.
3. Ajouter une canonical propre à chaque page publique.
4. Générer `sitemap.xml` avec les pages publiques et articles publiés uniquement ; dates `lastmod` réelles.
5. Ajouter `robots.txt` indiquant le sitemap. Conserver `noindex` sur les espaces privés et leur authentification réelle.
6. Soumettre le sitemap dans Search Console après vérification de propriété.

**Terminé lorsque :** URL canonique en HTTP 200, anciennes variantes redirigées, sitemap valide sans brouillons et sans URL privées. Le sitemap ne garantit pas l'indexation.

### T10 — Corriger les partages — P1 — 0,5 jour

1. Remplacer les images `/assets/images/og-banner.jpg` et `blog-banner.jpg` par des fichiers réellement servis.
2. Ajouter une image propre ou une image par défaut cohérente pour chaque article, avec URL absolue.
3. Vérifier titre, description, type, URL et image dans les métadonnées initiales.
4. Tester un aperçu réel sur les outils de débogage des réseaux concernés après déploiement de test.

**Terminé lorsque :** accueil, blog et deux articles donnent les bons aperçus ; aucune image de partage n'est en 404.

### T11 — Score de quiz vérifié — P1 — 1 à 2 jours

1. Créer une partie serveur avec identifiant imprévisible et expiration.
2. Associer la liste de questions et conserver les bonnes réponses côté serveur pour la soumission.
3. Envoyer les réponses choisies ; recalculer le score côté serveur.
4. Empêcher le rejeu d'une partie terminée et calculer le classement en SQL sur la période annoncée.

**Terminé lorsque :** envoyer arbitrairement `score:50` ne permet plus d'obtenir 50 points ; la même partie ne peut pas être comptée deux fois.

### T12 — Total des dons et recette Stripe — P1 — 1 à 2 jours

1. Remplacer le chargement partiel par un `SUM` SQL regroupé par devise.
2. Documenter le bénéficiaire et le rapprochement Cash App/Zelle ; ne pas promettre un enregistrement automatique qui n'a pas été démontré.
3. Garder Stripe désactivé dans l'interface jusqu'à la réussite de sa recette.
4. Tester avec Stripe test : paiement valide, signature invalide, même événement deux fois, échec base puis rejeu.
5. Vérifier l'unicité SQL et un retour succès fondé sur l'état serveur. Ajouter les événements requis par les modes de paiement réellement proposés.

**Terminé lorsque :** une transaction n'est comptée qu'une fois, les montants de référence concordent et les erreurs sont récupérables.

### T13 — Images et PDF — P1/P2 — 1 à 2 jours

1. Dresser la liste des dimensions d'affichage nécessaires et conserver les originaux séparément.
2. Générer des tailles adaptées en WebP/AVIF avec fallback si nécessaire ; objectifs de départ : vignette <100 ko, image éditoriale <250 ko, hero <350 ko, sous réserve de qualité acceptable.
3. Utiliser `srcset`, `sizes` et dimensions/ratio réservés ; charger paresseusement les images hors écran.
4. Ne pas charger paresseusement l'image principale ; mesurer avant d'ajouter une priorité élevée.
5. Proposer un PDF compressé, afficher son poids et conserver une version haute définition si utile. Vérifier lisibilité, liens et texte sélectionnable.
6. Avec `immutable`, changer l'URL quand le fichier change, par exemple avec un hash dans le nom.

**Terminé lorsque :** qualité visuelle préservée, pas de ressource énorme pour une petite vignette, pas d'image périmée après remplacement.

### T14 — Accessibilité et mobile — P1/P2 — 1 à 2 jours de recette et corrections à chiffrer

1. Tester toutes les pages à 320, 375, 768 et 1280 px ; relever débordements et recouvrements.
2. Parcourir au clavier sans souris : menu, liens, formulaires, partage et modales.
3. Vérifier focus visible, ouverture/fermeture par Échap, restauration du focus et `aria-expanded` synchronisé.
4. Ajouter un lien d'évitement vers le contenu ; vérifier les erreurs reliées aux champs et annoncées.
5. Mesurer les contrastes réels, le zoom à 200 %, les cibles tactiles et la réduction des animations.
6. Tester JavaScript désactivé et panne des scripts tiers : le contenu et les liens essentiels doivent rester accessibles. Vérifier particulièrement le loader.

**Terminé lorsque :** aucun blocage clavier sur les parcours essentiels, contrastes conformes au niveau visé et absence de perte de contenu au zoom. Les attributs ARIA seuls ne prouvent pas la conformité.

### T15 — CSP et validation des fichiers — P2 — 1 jour

1. Inventorier scripts, styles, images, iframes et connexions nécessaires.
2. Déployer une CSP en mode `Report-Only`, traiter les violations puis activer une politique compatible ; externaliser les scripts inline ou utiliser des nonces/hashes adaptés.
3. Dans les uploads, vérifier le format réel par décodage, les dimensions et les limites de taille ; ne pas se fier à l'extension envoyée.
4. Épingler les versions des scripts tiers et utiliser SRI là où compatible ; vérifier les CDN réellement nécessaires.

**Terminé lorsque :** ressources légitimes fonctionnelles sous CSP, faux fichier image rejeté et absence de gestionnaires actifs autorisés par accident.

### T16 — Tests et CI qui bloquent les régressions — P1/P2 — 1 à 2 jours

1. Transformer les comportements attendus en tests : droits, 404, inscription, score, idempotence et agrégation.
2. Ajouter les contrôles HTML/JSON, liens locaux et syntaxe JS pour tous les fichiers concernés.
3. Faire échouer un contrôle de secret si un fichier ne peut pas être lu. Scanner tout l'artefact public, sans afficher les valeurs secrètes.
4. Exécuter ces contrôles en CI sur un clone propre et Node 22. Ajouter un audit de dépendances documenté ; ne pas appliquer `audit fix --force` sans examen.
5. Conserver la recette des services externes sur l'environnement de test.

**Terminé lorsque :** une régression volontaire de permission ou de rendu fait échouer la CI. Le script d'audit joint confirme des défauts actuels : ce n'est pas une suite attestant que le site est sûr.

### T17 — Déploiement reproductible et documentation — P2 — 1 à 2 jours

1. Donner une seule procédure pour installation, variables, ordre SQL, stockage et déploiement.
2. Aligner le serveur local sur les rewrites/URL propres ou utiliser `vercel dev` pour la recette correspondante.
3. Remplacer `latest` par une version maîtrisée et conserver le lockfile ; installer avec `npm ci`.
4. Séparer menu/footer en composants de génération statique et extraire progressivement les modules admin.
5. Exclure les audits, captures et fichiers temporaires du déploiement public. Choisir une sortie publique explicite ou un `.vercelignore` exhaustif, puis vérifier l'artefact final.
6. Documenter surveillance des erreurs, budget IA, erreurs webhook, sauvegarde et retour arrière.

**Terminé lorsque :** un autre développeur installe et valide le projet sans instruction orale ; les outils internes et rapports d'audit ne sont pas servis publiquement.

### T18 — Mesurer le résultat — P2 — 0,5 à 1 jour puis suivi

1. Après correction, lancer Lighthouse mobile sur accueil, blog, article, adhésion et livre blanc en préproduction comparable à la production.
2. Conserver trois exécutions comparables par page et le détail des ressources ; une seule note peut être instable.
3. Objectifs Core Web Vitals : LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 au 75e percentile des visites réelles. Les mesures de laboratoire préparent ce travail ; elles ne prouvent pas les résultats terrain.
4. Vérifier Search Console : exploration, indexation, canonical sélectionnée et erreurs de sitemap.
5. Réévaluer la note technique avec preuves des corrections ; ne pas promettre une position Google.

## Ordre de réalisation et charge

| Lot | Contenu | Condition de sortie |
|---|---|---|
| A — Assainir les fonctions sensibles | Préparation, T01 à T06 | Droits séparés, contenus sûrs, confirmation email, quotas et accès base vérifiés |
| B — Rendre le contenu fiable et indexable | T07 à T10 | Articles réels, bons statuts HTTP, HTML complet et URL cohérentes |
| C — Corriger les calculs et alléger | T11 à T14 | Scores et dons fiables, médias adaptés, recette mobile et clavier |
| D — Stabiliser la maintenance | T15 à T18 | CI, déploiement reproductible, surveillance et mesures archivées |

**Budget indicatif : 20 à 35 jours de développement et recette**, avec davantage de temps pour un débutant selon son accompagnement. Les estimations se chevauchent entre certains tickets ; ce ne sont pas des délais contractuels. La rédaction/validation des textes, les accès aux comptes et la remise à disposition des fichiers peuvent prolonger le calendrier. Réestimer après lecture des modules encore inaccessibles. Les tâches de sécurité doivent être relues avant déploiement.

## Vérification finale avant validation de production

- Un visiteur ne lit ni profils privés, ni NINU, ni dons, ni brouillons.
- Chaque permission est testée par une requête directe à l'API ; l'interface seule n'est pas la preuve.
- Une inscription exige la possession de l'email et ne peut choisir ses droits.
- Un article inexistant retourne 404 et n'affiche aucun contenu de démonstration.
- Le HTML initial d'un article contient son vrai titre, contenu et aperçu de partage.
- Le score est recalculé ; les dons sont totalisés par devise sans limite artificielle.
- Le rejeu d'un webhook ne double pas un don.
- Les politiques sont accessibles et les données conservées selon les décisions approuvées.
- Les parcours essentiels fonctionnent sur mobile, au clavier et en cas de panne d'un tiers.
- La CI fonctionne sur un clone propre et une restauration de sauvegarde a été exercée en test.

## Références techniques

Les recommandations ont été recoupées avec des sources primaires ; elles ne remplacent pas les observations sur ce code :

- [Google — JavaScript et SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) : rendu HTML, métadonnées, liens et traitement des erreurs.
- [Google — Construction d'un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) : URL canoniques et soumission.
- [OWASP — Prévention XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) : sorties adaptées au contexte et assainissement du HTML autorisé.
- [Stripe — Webhooks](https://docs.stripe.com/webhooks) : vérification de signature et traitement robuste des événements.
- [Google web.dev — Web Vitals](https://web.dev/articles/vitals) : seuils et distinction des mesures terrain/laboratoire.

## Utilisation des preuves jointes

Depuis la racine : `node audit/verify-audit.mjs`. Le script ne contacte aucun service et utilise des identités/données fictives. Il lit les sources, inventorie les ressources, vérifie la syntaxe des JS lisibles et exécute des handlers avec services simulés. Les imports sont remplacés dans un contexte isolé : cela prouve les branches de logique examinées, pas le comportement de bout en bout du déploiement.

Les vérifications de défauts sont volontairement vertes lorsque le défaut est reproduit. Après correction, elles doivent être remplacées par des tests affirmant le comportement sûr ; un échec du script d'audit peut donc signifier qu'une correction a changé le comportement.

Les seuls fichiers ajoutés pour cet audit sont dans `audit/`. Le code applicatif n'a pas été modifié.

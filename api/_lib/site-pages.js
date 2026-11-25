// Structure du site : rubriques, sous-pages et 20 chantiers.
// Source unique pour le menu (scripts/build-pages.mjs), le sitemap (api/articles.js) et l'assistant.

export const CHANTIER_PAGES = [
  { n: 1, slug: 'securite', titre: 'Sécurité', theme: 'souverainete', famille: 'Souveraineté', icon: 'fa-solid fa-shield', resume: 'Rétablir la sécurité sur l’ensemble du territoire afin de permettre le retour de la paix et la normalisation des activités économiques et sociales.' },
  { n: 2, slug: 'defense-protection-civile', titre: 'Défense et protection civile', theme: 'souverainete', famille: 'Souveraineté', icon: 'fa-solid fa-helmet-safety', resume: 'Reconstituer des forces de défense aux missions sécuritaires et civiques clairement encadrées, avec des garde-fous contre les dérives du passé.' },
  { n: 3, slug: 'economie-emploi', titre: 'Économie et création d’emploi', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-chart-line', resume: 'Relancer l’économie haïtienne pour produire de la croissance, créer des emplois durables et soutenir l’ambition d’une économie émergente en 2054.' },
  { n: 4, slug: 'education', titre: 'Éducation', theme: 'social', famille: 'Social', icon: 'fa-solid fa-school', resume: 'Garantir l’accès gratuit à l’école primaire et améliorer la qualité de l’éducation, de la formation professionnelle et de l’enseignement supérieur sur tout le territoire.' },
  { n: 5, slug: 'diaspora', titre: 'Intégration de la diaspora', theme: 'gouvernance', famille: 'Gouvernance', icon: 'fa-solid fa-earth-americas', resume: 'Associer la diaspora aux décisions d’avenir et réinscrire la communauté expatriée dans la construction politique, économique et institutionnelle du pays.' },
  { n: 6, slug: 'sante', titre: 'Santé', theme: 'social', famille: 'Social', icon: 'fa-solid fa-heart-pulse', resume: 'Mettre en place une politique nationale de santé garantissant l’accès aux services sanitaires de base, quelles que soient les ressources ou la région d’habitation.' },
  { n: 7, slug: 'egalite-femmes-hommes', titre: 'Égalité femmes-hommes', theme: 'social', famille: 'Social', icon: 'fa-solid fa-venus-mars', resume: 'Promouvoir l’égalité entre les femmes et les hommes dans toutes les sphères de la vie nationale et à tous les niveaux de responsabilité.' },
  { n: 8, slug: 'environnement', titre: 'Environnement et aménagement du territoire', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-leaf', resume: 'Réhabiliter l’environnement par des actions concertées sur le foncier, l’agriculture, l’économie locale et la planification territoriale.' },
  { n: 9, slug: 'culture', titre: 'Culture', theme: 'social', famille: 'Social', icon: 'fa-solid fa-masks-theater', resume: 'Déployer une politique culturelle capable de soutenir le développement économique, social et le rayonnement d’Haïti dans le monde.' },
  { n: 10, slug: 'jeunesse-sport', titre: 'Jeunesse, sport et action civique', theme: 'social', famille: 'Social', icon: 'fa-solid fa-futbol', resume: 'Favoriser la pratique du sport et offrir à la jeunesse des espaces d’engagement civique en protection civile, environnement, hygiène publique et reboisement.' },
  { n: 11, slug: 'justice', titre: 'Justice', theme: 'gouvernance', famille: 'Gouvernance', icon: 'fa-solid fa-scale-balanced', resume: 'Établir un pouvoir judiciaire fort, indépendant et accessible afin de consolider l’État de droit, la sécurité et la stabilité démocratique.' },
  { n: 12, slug: 'tourisme', titre: 'Tourisme', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-umbrella-beach', resume: 'Faire d’Haïti une destination touristique de référence dans la Caraïbe pour transformer ce secteur en moteur de développement économique.' },
  { n: 13, slug: 'infrastructures', titre: 'Infrastructures', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-road-bridge', resume: 'Lancer un plan ambitieux de réhabilitation et de construction : routes, ponts, ports, eau, énergie, télécommunications, transport et gestion des déchets.' },
  { n: 14, slug: 'diplomatie', titre: 'Diplomatie, politique étrangère et coopération externe', theme: 'gouvernance', famille: 'Gouvernance', icon: 'fa-solid fa-handshake-angle', resume: 'Faire de la diplomatie économique un levier de développement et d’amélioration durable de l’image d’Haïti à l’international.' },
  { n: 15, slug: 'agriculture', titre: 'Production nationale et agriculture', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-wheat-awn', resume: 'Construire une agriculture rentable, productive et performante au service de l’autosuffisance alimentaire et du redressement de la production nationale.' },
  { n: 16, slug: 'transparence', titre: 'Transparence et reddition des comptes', theme: 'gouvernance', famille: 'Gouvernance', icon: 'fa-solid fa-file-invoice-dollar', resume: 'Combattre la corruption, renforcer les institutions et donner aux citoyens un accès direct à l’information sur l’utilisation des fonds publics.' },
  { n: 17, slug: 'secteur-prive', titre: 'Secteur privé', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-briefcase', resume: 'Prioriser la création de richesse et d’emploi par l’investissement privé local et étranger, des microentreprises aux grandes entreprises.' },
  { n: 18, slug: 'energie', titre: 'Énergie', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-bolt', resume: 'Moderniser le plan national du secteur énergétique afin d’améliorer la desserte en électricité au moindre coût pour la population et l’économie.' },
  { n: 19, slug: 'mines', titre: 'Mines', theme: 'developpement', famille: 'Développement', icon: 'fa-solid fa-gem', resume: 'Adopter une loi minière avec des procédures claires pour une exploitation moderne, responsable et bénéfique au développement d’Haïti.' },
  { n: 20, slug: 'collectivites-territoriales', titre: 'Collectivités territoriales', theme: 'gouvernance', famille: 'Gouvernance', icon: 'fa-solid fa-map-location-dot', resume: 'Mettre en place une véritable décentralisation politique, fiscale et économique, fondée sur des collectivités territoriales effectives.' },
].map((c) => ({ ...c, href: `/vingt-chantiers/${c.slug}`, file: `vingt-chantiers/${c.slug}.html` }));

export const FAMILLES = ['Souveraineté', 'Social', 'Développement', 'Gouvernance'];

const sub = (dir, slug, titre, description, icon) => ({ slug, titre, description, icon, href: `/${dir}/${slug}`, file: `${dir}/${slug}.html` });

/** Rubriques du menu qui ont des sous-pages. */
export const RUBRIQUES = [
  {
    key: 'apropos', label: 'À propos', href: '/Apropos', file: 'Apropos.html',
    pages: [
      sub('a-propos', 'identite', 'Notre identité', 'Un parti réformiste, centriste et social-démocrate qui rassemble au-delà des clivages.', 'fa-solid fa-compass'),
      sub('a-propos', 'valeurs', 'Nos valeurs', 'Les principes qui fondent notre engagement : bonne gouvernance, justice, intégrité, solidarité.', 'fa-solid fa-scale-balanced'),
      sub('a-propos', 'heritage', 'L’idéal christophien', 'Un héritage de grandeur, de rigueur et de modernité qui guide notre combat.', 'fa-solid fa-landmark'),
      sub('a-propos', 'vision-2054', 'Démocratie et vision 2054', 'Une démocratie réelle et l’ambition d’une Haïti émergente à l’horizon 2054.', 'fa-solid fa-flag'),
      sub('a-propos', 'mot-du-coordonnateur', 'Le mot du coordonnateur national', 'Jerry Tardieu présente le Livre blanc et la vision du parti.', 'fa-solid fa-quote-left'),
    ],
  },
  {
    key: 'historique', label: 'Historique', href: '/historique', file: 'historique.html',
    pages: [
      sub('historique', 'origines', 'Nos origines', 'De la naissance du mouvement en 2020 au parti politique En Avant.', 'fa-solid fa-seedling'),
      sub('historique', 'engagement', 'Le temps de l’engagement', 'Le réveil, la participation à tous les niveaux et les héritiers d’un long combat.', 'fa-solid fa-people-group'),
      sub('historique', 'remettre-de-l-ordre', 'Remettre de l’ordre dans la République', 'Restaurer l’autorité de l’État : la grande ambition du parti et ses trois priorités.', 'fa-solid fa-building-columns'),
    ],
  },
  {
    key: 'organisation', label: 'Organisation', href: '/organisation', file: 'organisation.html',
    pages: [
      sub('organisation', 'organisme', 'L’organisme En Avant', 'Congrès national, Coordination nationale, Conseil stratégique et coordinations.', 'fa-solid fa-sitemap'),
      sub('organisation', 'candidats', 'Nos candidats', 'Les candidats de la bannière En Avant pour Haïti (n° 85) aux prochaines élections.', 'fa-solid fa-check-to-slot'),
      sub('organisation', 'diaspora', 'Diaspora et branches extérieures', 'Les coordinations du parti hors d’Haïti et la place de la diaspora.', 'fa-solid fa-earth-americas'),
    ],
  },
  {
    key: 'chantiers', label: 'Vingt chantiers', href: '/vingt-chantiers', file: 'vingt-chantiers.html',
    pages: CHANTIER_PAGES.map((c) => ({ ...c, description: c.resume })),
  },
];

/** Menu principal, dans l'ordre. */
export const NAV = [
  { label: 'Accueil', href: '/index.html', file: 'index.html' },
  ...RUBRIQUES.slice(0, 4),
  { label: 'Blog', href: '/blog.html', file: 'blog.html' },
  { label: 'Galerie', href: '/galerie', file: 'galerie.html' },
  { label: 'Livre blanc', href: '/livre-blanc.html', file: 'livre-blanc.html' },
];

/** Toutes les sous-pages (chemins publics, sans .html). */
export const SUBPAGES = RUBRIQUES.flatMap((r) => r.pages.map((p) => ({ ...p, rubrique: r })));

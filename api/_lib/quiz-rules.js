// Règles du module Quiz membres partagées entre l'API, l'administration et les tests.
// Le calcul des points vit en base (quiz_answer) ; ces valeurs servent à l'affichage.

export const QUESTIONS_PAR_PARTIE = 15;
export const CHRONO_SECONDES = 15;

export const TITRES = [
  { min: 40000, titre: 'Visionnaire' },
  { min: 15000, titre: 'Stratège' },
  { min: 5000, titre: 'Cadre' },
  { min: 1000, titre: 'Militant' },
  { min: 0, titre: 'Sympathisant' },
];

/** Titre d'après le score cumulé. */
export function titreFor(cumul) {
  const points = Number(cumul) || 0;
  return (TITRES.find((t) => points >= t.min) || TITRES.at(-1)).titre;
}

/** Prochain titre et points manquants (null au dernier titre). */
export function prochainTitre(cumul) {
  const points = Number(cumul) || 0;
  const next = [...TITRES].reverse().find((t) => t.min > points);
  return next ? { titre: next.titre, manque: next.min - points } : null;
}

export const BADGES = {
  premier_pas: { nom: 'Premier pas', description: 'Terminer sa première partie', icone: 'fa-shoe-prints' },
  serie_de_feu: { nom: 'Série de feu', description: '5 bonnes réponses d’affilée', icone: 'fa-fire' },
  inarretable: { nom: 'Inarrêtable', description: '15 bonnes réponses d’affilée', icone: 'fa-bolt-lightning' },
  eclair: { nom: 'Éclair', description: '10 réponses en moins de 5 s dans une partie', icone: 'fa-bolt' },
  assidu: { nom: 'Assidu', description: 'Jouer 7 jours différents', icone: 'fa-calendar-check' },
  champion_semaine: { nom: 'Champion de la semaine', description: 'Finir 1er du défi de la semaine', icone: 'fa-trophy' },
  duelliste: { nom: 'Duelliste', description: 'Gagner 5 duels', icone: 'fa-khanda' },
  ambassadeur: { nom: 'Ambassadeur', description: 'Faire jouer 3 personnes en duel', icone: 'fa-bullhorn' },
};

/** Nom et description d'un badge, y compris « Expert du chantier N ». */
export function badgeInfo(code, chantiers = {}) {
  const match = /^expert_chantier_(\d{1,2})$/.exec(code);
  if (match) {
    const n = Number(match[1]);
    return { code, nom: `Expert : ${chantiers[n] || `chantier ${n}`}`, description: `20 bonnes réponses sur le chantier ${n}`, icone: 'fa-medal', chantier: n };
  }
  return BADGES[code] ? { code, ...BADGES[code] } : null;
}

/** Points d'une bonne réponse (miroir de la règle SQL, pour l'aide de jeu). */
export function pointsFor({ correct, fast, streak }) {
  if (!correct) return 0;
  return 10 + (fast ? 5 : 0) + (streak >= 3 ? 2 * (streak - 2) : 0);
}

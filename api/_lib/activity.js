// Journal d'activité : enregistre, en français clair, ce qui se passe sur la plateforme
// (adhésions, dons, contenus, newsletter, quiz, équipe, sécurité, système).
// Ne bloque jamais l'action principale : une erreur d'écriture est seulement signalée en console.
import { getServiceClient } from './supabase.js';

export const CATEGORIES = {
  adhesions: 'Adhésions',
  dons: 'Dons',
  contenus: 'Contenus',
  newsletter: 'Newsletter',
  quiz: 'Quiz',
  equipe: 'Équipe',
  securite: 'Sécurité',
  systeme: 'Système',
};

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Ajoute une ligne au journal.
 * @param {object} entry { categorie, message, niveau?, acteur?, acteurId?, details?, ref? }
 */
export async function logActivity(supabase, entry) {
  try {
    const categorie = Object.hasOwn(CATEGORIES, entry?.categorie) ? entry.categorie : 'systeme';
    const message = clip(entry?.message, 500);
    if (message.length < 3) return;
    const row = {
      categorie,
      niveau: ['info', 'attention', 'erreur'].includes(entry.niveau) ? entry.niveau : 'info',
      message,
      acteur: entry.acteur ? clip(entry.acteur, 120) : null,
      acteur_id: entry.acteurId || null,
      details: entry.details || null,
      ref: entry.ref ? clip(entry.ref, 200) : null,
    };
    const client = supabase || getServiceClient();
    const { error } = await client.from('activity_logs').insert(row);
    if (error && error.code !== '23505') console.error('[journal]', error.message);
  } catch (error) {
    console.error('[journal]', error?.message || error);
  }
}

/** Nom lisible de la personne connectée (profil, sinon email). */
export async function actorName(supabase, user) {
  if (!user?.id) return null;
  try {
    const { data } = await supabase.from('profiles').select('nom, username').eq('id', user.id).maybeSingle();
    return data?.nom || data?.username || user.email || null;
  } catch {
    return user.email || null;
  }
}

/** Raccourci pour une action de l'équipe : retrouve le nom puis enregistre. */
export async function logTeamAction(supabase, user, entry) {
  return logActivity(supabase, { categorie: 'equipe', ...entry, acteur: await actorName(supabase, user), acteurId: user?.id || null });
}

const lieu = (...parts) => {
  const txt = parts.map((p) => clip(p, 60)).filter(Boolean).join(', ');
  return txt ? ` (${txt})` : '';
};
export { lieu };

export const money = (cents, devise = 'usd') => {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(devise || 'usd').toUpperCase() }).format((Number(cents) || 0) / 100);
  } catch {
    return `${((Number(cents) || 0) / 100).toFixed(2)} ${String(devise || '').toUpperCase()}`;
  }
};

const haitiDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Port-au-Prince', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/**
 * Quiz : une seule ligne par jour et par type de partie, mise à jour à chaque partie
 * terminée (« 5 adhérents ont terminé le défi de la semaine… »), pour ne pas noyer le journal.
 */
export async function logQuizDay(supabase, gameId) {
  try {
    const { data: game } = await supabase.from('quiz_games').select('mode, finished_at').eq('id', gameId).maybeSingle();
    if (!game?.finished_at) return;
    const day = haitiDay(new Date(game.finished_at));
    // Bornes du jour à Port-au-Prince (UTC-5 / UTC-4) : marge large puis filtre exact.
    const from = new Date(Date.parse(`${day}T00:00:00Z`) - 864e5).toISOString();
    const { data: games } = await supabase.from('quiz_games').select('mode, points, finished_at, user_id')
      .gte('finished_at', from).not('finished_at', 'is', null).limit(5000);
    const today = (games || []).filter((g) => haitiDay(new Date(g.finished_at)) === day);
    const defi = today.filter((g) => g.mode === 'defi');
    const autres = today.filter((g) => g.mode !== 'defi');
    const rows = [];
    if (game.mode === 'defi' && defi.length) {
      rows.push({
        categorie: 'quiz', niveau: 'info', ref: `defi_jour:${day}`, created_at: new Date().toISOString(),
        message: `${defi.length === 1 ? '1 adhérent a terminé' : `${defi.length} adhérents ont terminé`} le défi de la semaine aujourd’hui (meilleur score : ${Math.max(...defi.map((g) => g.points || 0))} points).`,
      });
    }
    if (game.mode !== 'defi' && autres.length) {
      const joueurs = new Set(autres.map((g) => g.user_id)).size;
      const duels = autres.filter((g) => g.mode === 'duel').length;
      rows.push({
        categorie: 'quiz', niveau: 'info', ref: `quiz_jour:${day}`, created_at: new Date().toISOString(),
        message: `${autres.length} partie(s) de quiz jouée(s) aujourd’hui par ${joueurs} adhérent(s)${duels ? `, dont ${duels} en duel` : ''}.`,
      });
    }
    if (rows.length) {
      const { error } = await supabase.from('activity_logs').upsert(rows, { onConflict: 'ref' });
      if (error) console.error('[journal]', error.message);
    }
  } catch (error) {
    console.error('[journal]', error?.message || error);
  }
}

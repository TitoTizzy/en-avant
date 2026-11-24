// /api/admin/maintenance — Bilan de santé et réparations sûres, sans toucher au code (SuperAdmin).
//   GET                                   → bilan : chaque service avec son état et une explication claire
//   POST { action:'reprendre_envois' }    → poursuit les newsletters / invitations interrompues
//   POST { action:'relancer_echecs' }     → renvoie les emails en échec des 7 derniers jours
//   POST { action:'debloquer_compteurs' } → remet à zéro les compteurs anti-abus (personnes bloquées « trop de demandes »)
//   POST { action:'vider_cache_assistant' } → l'assistant relit le Livre blanc et les pages (≤ 5 min)
//   POST { action:'mode_maintenance', actif, message } → bannière « site en maintenance » sur le site public
// Chaque réparation est inscrite au journal d'activité.
import { Resend } from 'resend';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, plainCause } from '../_lib/http.js';
import { processQueue } from '../_lib/newsletter.js';
import { logTeamAction } from '../_lib/activity.js';

const DAY = 864e5;
const withTimeout = (promise, ms = 6000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
]);

/** Un contrôle : { cle, titre, etat: ok|attention|erreur, explication, reparation? } */
async function check(cle, titre, fn) {
  const started = Date.now();
  try {
    const r = await fn();
    return { cle, titre, duree_ms: Date.now() - started, ...r };
  } catch (error) {
    return { cle, titre, etat: 'erreur', explication: `Le contrôle a échoué : ${plainCause(error)}.`, duree_ms: Date.now() - started };
  }
}

export async function healthReport(supabase, env = process.env) {
  const checks = await Promise.all([
    check('base', 'Base de données', async () => {
      const { count, error } = await withTimeout(supabase.from('profiles').select('id', { count: 'exact', head: true }));
      if (error) throw error;
      return { etat: 'ok', explication: `La base répond normalement (${count} comptes).` };
    }),

    check('migrations', 'Mises à jour de la base', async () => {
      const manquantes = [];
      const probe = async (table, column, label) => {
        const { error } = await supabase.from(table).select(column).limit(1);
        if (error) manquantes.push(label);
      };
      await Promise.all([
        probe('activity_logs', 'id', 'journal d’activité'),
        probe('newsletters', 'type', 'invitations au quiz'),
        probe('quiz_challenges', 'week_start', 'défi de la semaine'),
        probe('newsletter_deliveries', 'email', 'suivi des envois'),
      ]);
      return manquantes.length
        ? { etat: 'erreur', explication: `Il manque des mises à jour de la base : ${manquantes.join(', ')}. Ces fonctions ne peuvent pas marcher : demandez à Claude d’appliquer la migration correspondante.` }
        : { etat: 'ok', explication: 'Toutes les mises à jour attendues sont en place.' };
    }),

    check('emails', 'Envoi d’emails (Resend)', async () => {
      if (!env.RESEND_API_KEY) return { etat: 'erreur', explication: 'Aucune clé Resend n’est configurée : aucun email ne peut partir (adhésions, newsletter, quiz).' };
      const { data, error } = await withTimeout(new Resend(env.RESEND_API_KEY).domains.list());
      if (error) {
        // Une clé limitée à l'envoi ne peut pas lister les domaines : ce n'est pas une panne.
        if (/restricted|permission|not allowed/i.test(error.message || '')) return { etat: 'ok', explication: 'La clé d’envoi est en place (clé limitée à l’envoi, c’est normal).' };
        return { etat: 'erreur', explication: `Resend refuse la clé configurée (${error.message}). Les emails ne partent plus : la clé doit être remplacée dans Vercel.` };
      }
      const domains = data?.data || [];
      const ko = domains.filter((d) => d.status !== 'verified');
      return ko.length
        ? { etat: 'attention', explication: `Domaine d’envoi non vérifié : ${ko.map((d) => d.name).join(', ')}. Les emails risquent d’arriver en indésirables.` }
        : { etat: 'ok', explication: `Le service d’emails fonctionne${domains.length ? ` (domaine ${domains.map((d) => d.name).join(', ')} vérifié)` : ''}.` };
    }),

    check('envois', 'Newsletters et invitations', async () => {
      const since = new Date(Date.now() - 7 * DAY).toISOString();
      const [{ data: enCours, error }, { count: echecs, error: e2 }] = await Promise.all([
        supabase.from('newsletters').select('id, sujet, started_at, updated_at').eq('statut', 'en_cours'),
        supabase.from('newsletter_deliveries').select('email', { count: 'exact', head: true })
          .eq('statut', 'echec').neq('erreur', 'Désinscrit avant l’envoi').gte('claimed_at', since),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const bloques = (enCours || []).filter((n) => Date.now() - Date.parse(n.updated_at || n.started_at) > 10 * 60000);
      if (bloques.length) {
        return { etat: 'attention', reparation: 'reprendre_envois',
          explication: `${bloques.length} envoi(s) commencé(s) mais interrompu(s) (fermeture de la page ou limite de temps) : ${bloques.map((n) => `« ${n.sujet} »`).join(', ')}. Cliquez sur « Reprendre les envois ».` };
      }
      if (echecs) {
        return { etat: 'attention', reparation: 'relancer_echecs',
          explication: `${echecs} email(s) n’ont pas pu partir ces 7 derniers jours. Cliquez sur « Relancer les échecs » pour réessayer.` };
      }
      return { etat: 'ok', explication: (enCours || []).length ? 'Un envoi est en cours, il avance normalement.' : 'Aucun envoi bloqué, aucun échec récent.' };
    }),

    check('paiements', 'Dons par carte (Stripe)', async () => {
      if (!env.STRIPE_SECRET_KEY) return { etat: 'erreur', explication: 'Aucune clé Stripe : les dons par carte sont impossibles.' };
      if (!env.STRIPE_WEBHOOK_SECRET) return { etat: 'erreur', explication: 'Le secret du webhook Stripe manque : les dons seraient encaissés mais jamais enregistrés sur le site.' };
      await withTimeout(new Stripe(env.STRIPE_SECRET_KEY).balance.retrieve());
      const { data: last } = await supabase.from('donations').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
      return { etat: 'ok', explication: `Stripe répond normalement.${last ? ` Dernier don enregistré le ${new Date(last.created_at).toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' })}.` : ''}` };
    }),

    check('ia', 'Intelligence artificielle (assistant et quiz)', async () => {
      if (!env.ANTHROPIC_API_KEY) return { etat: 'erreur', explication: 'Aucune clé Anthropic : l’assistant du site et la génération de questions du quiz sont arrêtés.' };
      await withTimeout(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).models.list({ limit: 1 }));
      const { count } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('kind', 'chat').gte('created_at', new Date(Date.now() - DAY).toISOString())
        .then((r) => r, () => ({ count: null }));
      return { etat: 'ok', explication: `Le service d’IA répond normalement${count ? ` (${count} questions posées à l’assistant en 24 h)` : ''}.` };
    }),

    check('taches', 'Tâches automatiques', async () => {
      if (!env.CRON_SECRET) return { etat: 'erreur', explication: 'Le secret des tâches automatiques manque : ni résumé quotidien, ni relances, ni invitation du mardi.' };
      const { data: last } = await supabase.from('activity_logs').select('created_at')
        .ilike('message', 'Résumé quotidien%').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!last) return { etat: 'ok', explication: 'Tâches configurées. Le résumé quotidien n’a pas encore été enregistré au journal (il passe chaque jour à 7 h, heure d’Haïti).' };
      const age = Date.now() - Date.parse(last.created_at);
      return age > 1.5 * DAY
        ? { etat: 'attention', explication: `Le résumé quotidien n’est pas passé depuis ${Math.floor(age / DAY)} jour(s) : les tâches automatiques semblent arrêtées. Vérifiez l’onglet « Cron Jobs » du projet Vercel.` }
        : { etat: 'ok', explication: 'Le résumé quotidien et les relances passent normalement.' };
    }),

    check('anti_abus', 'Protection anti-abus', async () => {
      const { count, error } = await supabase.from('api_rate_limits').select('key', { count: 'exact', head: true })
        .gt('reset_at', new Date().toISOString());
      if (error) throw error;
      return { etat: 'ok', reparation: count ? 'debloquer_compteurs' : undefined,
        explication: count
          ? `${count} compteur(s) actif(s). Si une personne se plaint d’un message « trop de demandes, réessayez plus tard », vous pouvez les remettre à zéro.`
          : 'Aucun visiteur n’est actuellement limité.' };
    }),

    check('maintenance', 'Mode maintenance du site', async () => {
      const { data } = await supabase.from('site_settings').select('value').eq('key', 'maintenance').maybeSingle();
      return data?.value?.actif
        ? { etat: 'attention', explication: `La bannière « site en maintenance » est affichée aux visiteurs${data.value.message ? ` : « ${data.value.message} »` : ''}.` }
        : { etat: 'ok', explication: 'Le site fonctionne normalement pour les visiteurs (pas de bannière de maintenance).' };
    }),
  ]);
  const pire = checks.some((c) => c.etat === 'erreur') ? 'erreur' : checks.some((c) => c.etat === 'attention') ? 'attention' : 'ok';
  return {
    etat: pire,
    resume: pire === 'ok' ? 'Tout fonctionne normalement.'
      : pire === 'attention' ? 'Le site fonctionne, mais certains points demandent votre attention.'
        : 'Un ou plusieurs services sont en panne : voir les explications ci-dessous.',
    checks,
    at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user } = await requireRole(req, ['superadmin']);
    const supabase = getServiceClient();

    if (req.method === 'GET') return json(res, 200, await healthReport(supabase));
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const body = getBody(req);
    switch (body.action) {
      case 'reprendre_envois': {
        const { data, error } = await supabase.from('newsletters').select('id, sujet').eq('statut', 'en_cours');
        if (error) throw error;
        const started = Date.now();
        const resultats = [];
        for (const n of data || []) {
          if (Date.now() - started > 40000) break;
          const p = await processQueue(supabase, n.id, { deadlineMs: Math.max(5000, 40000 - (Date.now() - started)) });
          resultats.push({ sujet: n.sujet, ...p });
        }
        const message = resultats.length
          ? resultats.map((r) => `« ${r.sujet} » : ${r.envoyes}/${r.destinataires} envoyés${r.termine ? ' (terminé)' : ' (à poursuivre)'}`).join(' ; ')
          : 'aucun envoi en cours';
        await logTeamAction(supabase, user, { categorie: 'systeme', message: `a repris les envois interrompus : ${message}.` });
        return json(res, 200, { ok: true, message: `Envois repris : ${message}.`, resultats });
      }

      case 'relancer_echecs': {
        const since = new Date(Date.now() - 7 * DAY).toISOString();
        const { data: rows, error } = await supabase.from('newsletter_deliveries').update({ statut: 'en_attente', erreur: null })
          .eq('statut', 'echec').neq('erreur', 'Désinscrit avant l’envoi').gte('claimed_at', since)
          .select('newsletter_id');
        if (error) throw error;
        const ids = [...new Set((rows || []).map((r) => r.newsletter_id))];
        if (ids.length) await supabase.from('newsletters').update({ statut: 'en_cours' }).in('id', ids);
        const started = Date.now();
        let envoyes = 0;
        for (const id of ids) {
          if (Date.now() - started > 40000) break;
          const p = await processQueue(supabase, id, { deadlineMs: Math.max(5000, 40000 - (Date.now() - started)) });
          envoyes += p.envoyes;
        }
        await logTeamAction(supabase, user, { categorie: 'systeme', message: `a relancé ${rows?.length || 0} email(s) en échec.` });
        return json(res, 200, { ok: true, message: rows?.length ? `${rows.length} email(s) remis en file d’envoi.` : 'Aucun email en échec à relancer.' });
      }

      case 'debloquer_compteurs': {
        const { data, error } = await supabase.from('api_rate_limits').delete().gt('reset_at', '1970-01-01').select('key');
        if (error) throw error;
        await logTeamAction(supabase, user, { categorie: 'securite', niveau: 'attention', message: `a remis à zéro les compteurs anti-abus (${data?.length || 0} compteur(s)).` });
        return json(res, 200, { ok: true, message: `${data?.length || 0} compteur(s) remis à zéro : plus personne n’est bloqué.` });
      }

      case 'vider_cache_assistant': {
        const { error } = await supabase.from('site_settings')
          .upsert({ key: 'chatbot_cache', value: { version: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
        await logTeamAction(supabase, user, { categorie: 'systeme', message: 'a vidé le cache de l’assistant (relecture du Livre blanc et des pages).' });
        return json(res, 200, { ok: true, message: 'C’est fait : l’assistant relira le Livre blanc et les pages du site d’ici 5 minutes.' });
      }

      case 'mode_maintenance': {
        const actif = body.actif === true;
        const message = clean(body.message).replace(/[<>]/g, '').slice(0, 200)
          || 'Le site est en cours de maintenance : certaines fonctions peuvent être momentanément indisponibles.';
        const { error } = await supabase.from('site_settings')
          .upsert({ key: 'maintenance', value: { actif, message }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
        await logTeamAction(supabase, user, { categorie: 'systeme', niveau: 'attention', message: actif ? `a activé le mode maintenance (bannière : « ${message} »).` : 'a désactivé le mode maintenance.' });
        return json(res, 200, { ok: true, actif, message: actif ? 'Mode maintenance activé : la bannière s’affiche aux visiteurs.' : 'Mode maintenance désactivé.' });
      }

      default:
        return json(res, 400, { error: 'Action inconnue.' });
    }
  } catch (error) {
    return handleError(res, error, 'Maintenance indisponible.');
  }
}

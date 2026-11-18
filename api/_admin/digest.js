// GET /api/cron/digest — Tâche quotidienne (Vercel Cron) :
//   1. envoie les relances « Complétez votre adhésion » dues (1/semaine, 5 max) ;
//   2. envoie le résumé quotidien à l'équipe (avec les comptes à supprimer).
// Authentification : en-tête « Authorization: Bearer <CRON_SECRET> » ajouté par Vercel.
// Sans CRON_SECRET configuré, la route est fermée (503).
import { timingSafeEqual } from 'node:crypto';
import { getServiceClient } from '../_lib/supabase.js';
import { json, handleError } from '../_lib/http.js';
import { notifyTeam } from '../_lib/notify.js';
import { sendDueRelances, accountsToDelete, displayName } from '../_lib/relances.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const header = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET) return json(res, 503, { error: 'Résumé non configuré.' });
  if (!authorized(req)) return json(res, 401, { error: 'Non autorisé.' });

  try {
    const supabase = getServiceClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const count = (table, column) => supabase
      .from(table).select('id', { count: 'exact', head: true }).gte(column, since);

    const [leads, members, donations] = await Promise.all([
      supabase.from('leads_livreblanc').select('nom, ville', { count: 'exact' })
        .gte('downloaded_at', since).order('downloaded_at', { ascending: false }).limit(30),
      count('members', 'created_at'),
      count('donations', 'created_at'),
    ]);
    const failure = [leads.error, members.error, donations.error].find(Boolean);
    if (failure) throw failure;

    // Relances automatiques (avant le résumé, pour qu'il en rende compte).
    const relances = await sendDueRelances(supabase);
    const toDelete = await accountsToDelete(supabase);

    const nLeads = leads.count || 0;
    if (nLeads === 0 && !members.count && !donations.count && !relances.sent && !relances.failed && !toDelete.length) {
      return json(res, 200, { ok: true, sent: false, reason: 'aucune activité', relances });
    }

    const names = (leads.data || []).map((l) => `${l.nom}${l.ville ? ` (${l.ville})` : ''}`).join(', ');
    const sent = await notifyTeam({
      subject: `Résumé des 24 dernières heures — ${nLeads} Livre blanc`,
      title: 'Résumé quotidien de enavant.org',
      rows: [
        ['Téléchargements du Livre blanc', String(nLeads)],
        ['Demandes d’adhésion', String(members.count || 0)],
        ['Dons enregistrés', String(donations.count || 0)],
        ['Derniers lecteurs', names ? `${names}${nLeads > 30 ? '…' : ''}` : '—'],
        ['Relances d’adhésion envoyées', `${relances.sent}${relances.failed ? ` (${relances.failed} échec(s))` : ''}`],
        ['Comptes à supprimer (5 relances sans fiche)', toDelete.length
          ? toDelete.slice(0, 20).map((p) => displayName(p)).join(', ') + (toDelete.length > 20 ? '…' : '')
          : '—'],
      ],
      note: 'Les emails et téléphones des lecteurs sont consultables dans le tableau de bord (onglet Leads). '
        + 'Les comptes à supprimer sont listés sur l’accueil du tableau de bord (SuperAdmin).',
    });
    return json(res, 200, { ok: true, sent, relances, a_supprimer: toDelete.length });
  } catch (error) {
    return handleError(res, error, 'Résumé impossible.');
  }
}

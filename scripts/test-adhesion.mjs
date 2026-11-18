// Tests isolés de l'adhésion unifiée : faux client Supabase, aucun email réel.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFiche, onApproved, sendAccessLink, relanceEmail } from '../api/_lib/adhesion.js';
import members from '../api/members.js';

delete process.env.RESEND_API_KEY; // sendToMember renvoie false sans rien envoyer
process.env.SITE_URL = 'https://enavant.org';

/** Faux client : enregistre chaque requête (table, opération, filtres). */
function fakeSupabase({ profileByEmail = null, inviteError = null } = {}) {
  const calls = [];
  const linkCalls = [];
  const builder = (table) => {
    const q = { table, op: 'select', values: null, filters: [] };
    calls.push(q);
    const chain = {
      select() { return chain; },
      update(values) { q.op = 'update'; q.values = values; return chain; },
      insert(values) { q.op = 'insert'; q.values = values; return chain; },
      eq(col, val) { q.filters.push([col, val]); return chain; },
      is(col, val) { q.filters.push([col, val]); return chain; },
      limit() { return chain; },
      maybeSingle() {
        if (table === 'profiles') return Promise.resolve({ data: profileByEmail, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve) { resolve({ data: null, error: null }); },
    };
    return chain;
  };
  return {
    calls,
    linkCalls,
    from: builder,
    auth: {
      admin: {
        async generateLink(args) {
          linkCalls.push(args);
          if (args.type === 'invite' && inviteError) return { data: null, error: inviteError };
          return {
            data: { user: { id: 'u-new' }, properties: { action_link: `https://lien/${args.type}` } },
            error: null,
          };
        },
      },
    },
  };
}

const updatesOn = (sb, table) => sb.calls.filter((c) => c.table === table && c.op === 'update');

test('validateFiche : NINU commençant par 1, consentement obligatoire', () => {
  const ok = validateFiche({ sexe: 'Femme', ninu: '1234-567-890', telephone: '+509 3400 0000', ville: 'Jacmel', consent: true });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.ninu, '1234567890');
  assert.equal(ok.values.sexe, 'femme');

  const ko = validateFiche({ sexe: 'x', ninu: '2234567890', telephone: '12', ville: '', consent: 'true' });
  assert.deepEqual(Object.keys(ko.errors).sort(), ['consent', 'ninu', 'sexe', 'telephone', 'ville']);
});

test('Approbation d’un compte existant : seul le rôle « pending » passe en « member »', async () => {
  const sb = fakeSupabase();
  const r = await onApproved(sb, { id: 'm1', nom: 'Marie', email: 'm@x.org', user_id: 'u1' });
  assert.equal(r.mode, 'login');
  const [promotion] = updatesOn(sb, 'profiles');
  assert.deepEqual(promotion.values, { role: 'member' });
  assert.deepEqual(promotion.filters, [['id', 'u1'], ['role', 'pending']]);
  assert.equal(sb.linkCalls.length, 0);
});

test('Approbation d’une ancienne fiche sans compte : invitation, liaison, promotion', async () => {
  const sb = fakeSupabase();
  const r = await onApproved(sb, { id: 'm2', nom: 'Jean', email: 'j@x.org', user_id: null });
  assert.equal(r.mode, 'password');
  assert.equal(sb.linkCalls[0].type, 'invite');
  assert.equal(sb.linkCalls[0].options.redirectTo, 'https://enavant.org/mot-de-passe');
  const [link] = updatesOn(sb, 'members');
  assert.deepEqual(link.values, { user_id: 'u-new' });
  assert.deepEqual(link.filters, [['id', 'm2']]);
  assert.deepEqual(updatesOn(sb, 'profiles')[0].filters, [['id', 'u-new'], ['role', 'pending']]);
});

test('Ancienne fiche dont l’adresse a déjà un compte : lien de réinitialisation sur ce compte', async () => {
  const sb = fakeSupabase({ profileByEmail: { id: 'u-old' }, inviteError: { message: 'User already registered' } });
  await onApproved(sb, { id: 'm3', nom: 'Ana', email: 'a@x.org', user_id: null });
  assert.deepEqual(sb.linkCalls.map((c) => c.type), ['invite', 'recovery']);
  assert.deepEqual(updatesOn(sb, 'members')[0].values, { user_id: 'u-old' });
});

test('Erreur inattendue à l’invitation : remontée, rien n’est relié', async () => {
  const sb = fakeSupabase({ inviteError: { message: 'rate limit' } });
  await assert.rejects(onApproved(sb, { id: 'm4', nom: 'X', email: 'x@x.org', user_id: null }));
  assert.equal(updatesOn(sb, 'members').length, 0);
});

test('Lien d’accès pour un compte déjà relié : réinitialisation, pas de nouvelle liaison', async () => {
  const sb = fakeSupabase();
  await sendAccessLink(sb, { id: 'm5', nom: 'Y', email: 'y@x.org', user_id: 'u5' });
  assert.deepEqual(sb.linkCalls.map((c) => c.type), ['recovery']);
  assert.equal(updatesOn(sb, 'members').length, 0);
});

test('Relance : lien vers l’espace membre, aucune donnée sensible', () => {
  const m = relanceEmail({ email: 'z@x.org', nom: 'Zoé' });
  assert.equal(m.cta.url, 'https://enavant.org/membre');
  assert.ok(!/ninu|téléphone/i.test(m.paragraphs.join(' ')));
});

const post = (body) => new Promise((resolve) => {
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { resolve({ status: this.statusCode, body: p }); },
  };
  members({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, body }, res);
});

test('Formulaire unique : champs manquants refusés avant toute création de compte', async () => {
  const r = await post({ nom: 'A', email: 'pas-un-email', pseudo: 'x', password: 'court', consent: false });
  assert.equal(r.status, 422);
  for (const f of ['nom', 'email', 'pseudo', 'password', 'ninu', 'sexe', 'telephone', 'ville', 'consent']) {
    assert.ok(r.body.fields[f], `champ ${f} attendu en erreur`);
  }
});

test('Formulaire unique : honeypot rempli → réponse neutre', async () => {
  const r = await post({ website: 'spam' });
  assert.equal(r.status, 200);
});

test('Onglets Membres : classement selon statut, compte et première connexion', async () => {
  const { memberTab } = await import('../api/_admin/dashboard.js');
  const signIns = new Map([['u-actif', '2026-11-17T10:00:00Z'], ['u-jamais', null]]);
  assert.equal(memberTab({ status: 'pending', user_id: 'u-actif' }, signIns), 'en_attente');
  assert.equal(memberTab({ status: 'rejected', user_id: null }, signIns), 'rejetes');
  assert.equal(memberTab({ status: 'approved', user_id: null }, signIns), 'non_envoye');
  assert.equal(memberTab({ status: 'approved', user_id: 'u-jamais' }, signIns), 'attente_activation');
  assert.equal(memberTab({ status: 'approved', user_id: 'u-actif' }, signIns), 'actifs');
});

test('Relances : 1 par semaine, 5 maximum, puis « à supprimer » 7 jours après la 5e', async () => {
  const { isRelanceDue, isToDelete } = await import('../api/_lib/relances.js');
  const now = Date.parse('2026-12-01T12:00:00Z');
  const days = (n) => new Date(now - n * 86400000).toISOString();
  const base = { role: 'member', email: 'a@x.org' };
  assert.equal(isRelanceDue({ ...base, relance_count: 0, relance_adhesion_at: null }, now), true);
  assert.equal(isRelanceDue({ ...base, relance_count: 2, relance_adhesion_at: days(3) }, now), false);
  assert.equal(isRelanceDue({ ...base, relance_count: 2, relance_adhesion_at: days(7) }, now), true);
  assert.equal(isRelanceDue({ ...base, relance_count: 5, relance_adhesion_at: days(30) }, now), false);
  assert.equal(isRelanceDue({ ...base, role: 'pending', relance_count: 0 }, now), false);
  assert.equal(isToDelete({ relance_count: 5, relance_adhesion_at: days(6) }, now), false);
  assert.equal(isToDelete({ relance_count: 5, relance_adhesion_at: days(7) }, now), true);
  assert.equal(isToDelete({ relance_count: 4, relance_adhesion_at: days(40) }, now), false);
});

test('Email de suppression : jamais de donnée sensible, lien pour adhérer à nouveau', async () => {
  const { deletionEmail } = await import('../api/_lib/adhesion.js');
  const m = deletionEmail({ email: 'z@x.org', nom: 'Zoé', account: true });
  assert.match(m.subject, /compte/);
  assert.equal(m.cta.url, 'https://enavant.org/adherer');
  assert.ok(!/ninu|téléphone/i.test(m.paragraphs.join(' ')));
});

test('Notifications : visibilité par permission, doublon ignoré, jamais d’exception', async () => {
  const { createNotification, visibleTo } = await import('../api/_lib/notifications.js');
  const sa = { isSuperAdmin: true, permissions: [] };
  const ed = { isSuperAdmin: false, permissions: ['voir_membres'] };
  assert.equal(visibleTo(sa, { permission: null }), true);
  assert.equal(visibleTo(ed, { permission: null }), false, 'à supprimer : SuperAdmin seulement');
  assert.equal(visibleTo(ed, { permission: 'voir_membres' }), true);
  assert.equal(visibleTo(ed, { permission: 'voir_dons' }), false);

  const fake = (error) => ({
    from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error }) }) }) }),
  });
  assert.equal(await createNotification(fake({ code: '23505' }), { type: 'a_supprimer', title: 't' }), null);
  assert.equal(await createNotification(fake({ code: 'XX000', message: 'boom' }), { type: 'don', title: 't' }), null);
});

test('Push : charge utile courte, lien vers l’admin du site, sans NINU ni téléphone', async () => {
  const { pushPayload } = await import('../api/_lib/push.js');
  const p = JSON.parse(pushPayload({ type: 'adhesion', title: 'Nouvelle demande — Ana', body: 'Jacmel', link: 'members:en_attente' }));
  assert.equal(p.url, 'https://enavant.org/admin.html?n=members%3Aen_attente');
  assert.equal(p.tag, 'adhesion');
  assert.deepEqual(Object.keys(p).sort(), ['body', 'tag', 'title', 'url']);
});

test('Statistiques : série sur 30 jours et répartition regroupée', async () => {
  const { dailySeries, breakdown } = await import('../api/_admin/stats.js');
  const now = Date.parse('2026-11-18T18:00:00Z');
  const s = dailySeries([
    { d: '2026-11-18T15:00:00Z' }, { d: '2026-11-18T16:00:00Z' }, { d: '2026-11-01T15:00:00Z' }, { d: '2026-09-01T15:00:00Z' },
  ], 'd', now);
  assert.equal(s.days.length, 30);
  assert.equal(s.values[29], 2);
  assert.equal(s.total, 3, 'hors fenêtre ignoré');
  const b = breakdown(['a', 'a', 'B', 'b', 'c', 'd'].map((v) => ({ v })), (r) => r.v, { limit: 3 });
  assert.deepEqual(b.map((x) => x.value), [2, 2, 2]);
  assert.equal(b[2].label, 'Autres');
});

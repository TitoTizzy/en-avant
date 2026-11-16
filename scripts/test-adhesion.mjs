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

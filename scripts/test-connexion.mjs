#!/usr/bin/env node
/* ============================================================================
   EN AVANT — TEST DE CONNEXION SUPABASE (réel, sans dépendance)
   Usage :  node --env-file=.env scripts/test-connexion.mjs
   Vérifie : variables, Auth API, RLS (lecture publique + verrouillage members),
   accès service_role, SuperAdmin + PIN (RPC), et les 4 buckets Storage.
   ============================================================================ */

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const COOKIE_SECRET = process.env.ADMIN_PIN_COOKIE_SECRET || '';

const results = [];
const ok = (name, detail = '') => results.push({ name, pass: true, detail });
const ko = (name, detail = '') => results.push({ name, pass: false, detail });
const headers = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

async function main() {
  /* 0 · Variables d'environnement */
  if (!URL_) ko('SUPABASE_URL', 'absente — remplissez .env');
  else ok('SUPABASE_URL', URL_);

  if (!ANON) ko('SUPABASE_ANON_KEY', 'absente — remplissez .env');
  else ok('SUPABASE_ANON_KEY', `${ANON.slice(0, 12)}…`);

  if (!SERVICE) ko('SUPABASE_SERVICE_ROLE_KEY', 'absente (tests service ignorés)');
  else ok('SUPABASE_SERVICE_ROLE_KEY', 'présente — ne jamais exposer côté client');

  if (COOKIE_SECRET.length < 32) ko('ADMIN_PIN_COOKIE_SECRET', '32 caractères minimum requis');
  else ok('ADMIN_PIN_COOKIE_SECRET', 'présente');

  if (!URL_ || !ANON) return report();

  /* 1 · Auth API joignable */
  try {
    const r = await fetch(`${URL_}/auth/v1/health`, { headers: headers(ANON) });
    r.ok ? ok('Auth API joignable') : ko('Auth API joignable', `HTTP ${r.status}`);
  } catch (e) { ko('Auth API joignable', e.message); }

  /* 2 · Lecture publique via RLS (clé anon) */
  for (const table of ['trivia_questions', 'events']) {
    try {
      const r = await fetch(`${URL_}/rest/v1/${table}?select=id&limit=1`, { headers: headers(ANON) });
      r.ok ? ok(`Lecture anon ${table} (RLS publique)`) : ko(`Lecture anon ${table}`, `HTTP ${r.status}`);
    } catch (e) { ko(`Lecture anon ${table}`, e.message); }
  }

  /* 3 · Verrouillage : INSERT anon sur members DOIT échouer */
  try {
    const r = await fetch(`${URL_}/rest/v1/members`, {
      method: 'POST',
      headers: { ...headers(ANON), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        nom: 'Test Verrou RLS', sexe: 'autre', ninu: '0000000000',
        email: `verrou-${Date.now()}@test.local`, telephone: '00000000',
        ville: 'Test', consent: true,
      }),
    });
    if (r.status === 401 || r.status === 403) {
      ok('RLS : INSERT anon refusé sur members', `HTTP ${r.status} — conforme`);
    } else {
      ko('RLS : INSERT anon refusé sur members', `HTTP ${r.status} — la table accepte l'anon !`);
    }
  } catch (e) { ko('RLS members', e.message); }

  if (!SERVICE) return report();

  /* 4 · Accès service_role (celui des fonctions /api) */
  try {
    const r = await fetch(`${URL_}/rest/v1/members?select=id&limit=1`, {
      headers: { ...headers(SERVICE), Prefer: 'count=exact', Range: '0-0' },
    });
    const total = r.headers.get('content-range')?.split('/')[1];
    r.ok ? ok('Service role : accès members', `${total ?? '0'} adhésion(s) en base`)
         : ko('Service role : accès members', `HTTP ${r.status}`);
  } catch (e) { ko('Service role : accès members', e.message); }

  /* 5 · SuperAdmin configuré (username + email + pin_hash) */
  let adminId = null;
  try {
    const r = await fetch(
      `${URL_}/rest/v1/profiles?role=eq.superadmin&select=id,username,email,pin_hash&limit=1`,
      { headers: headers(SERVICE) }
    );
    const rows = r.ok ? await r.json() : [];
    const admin = rows[0];
    if (admin?.username && admin?.email && admin?.pin_hash) {
      adminId = admin.id;
      ok('SuperAdmin configuré', `@${admin.username} · PIN haché en base`);
    } else {
      ko('SuperAdmin configuré', 'profil incomplet — exécutez supabase/setup-superadmin.sql');
    }
  } catch (e) { ko('SuperAdmin configuré', e.message); }

  /* 6 · RPC du PIN opérationnelles (PIN volontairement faux → false attendu) */
  if (adminId) {
    try {
      const r = await fetch(`${URL_}/rest/v1/rpc/ea_verify_pin`, {
        method: 'POST',
        headers: { ...headers(SERVICE), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: adminId, candidate_pin: '0000' }),
      });
      if (r.status === 404) ko('RPC ea_verify_pin', 'absente — exécutez supabase/schema.sql');
      else if (!r.ok) ko('RPC ea_verify_pin', `HTTP ${r.status}`);
      else ok('RPC ea_verify_pin opérationnelle');
    } catch (e) { ko('RPC ea_verify_pin', e.message); }

    try {
      const r = await fetch(`${URL_}/rest/v1/rpc/ea_change_pin`, {
        method: 'POST',
        headers: { ...headers(SERVICE), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: adminId, current_pin: '0000', new_pin: '9999' }),
      });
      // Mauvais PIN courant → la fonction répond false sans rien changer.
      if (r.status === 404) ko('RPC ea_change_pin', 'absente — exécutez supabase/add-change-pin.sql');
      else if (!r.ok) ko('RPC ea_change_pin', `HTTP ${r.status}`);
      else ok('RPC ea_change_pin opérationnelle');
    } catch (e) { ko('RPC ea_change_pin', e.message); }
  }

  /* 7 · Les 4 buckets Storage */
  try {
    const r = await fetch(`${URL_}/storage/v1/bucket`, { headers: headers(SERVICE) });
    const buckets = r.ok ? (await r.json()).map((b) => b.id) : [];
    const attendus = ['assets', 'tts-articles', 'documents', 'uploads-admin'];
    const manquants = attendus.filter((b) => !buckets.includes(b));
    manquants.length === 0
      ? ok('Buckets Storage (4/4)', buckets.filter((b) => attendus.includes(b)).join(', '))
      : ko('Buckets Storage', `manquants : ${manquants.join(', ')}`);
  } catch (e) { ko('Buckets Storage', e.message); }

  report();
}

function report() {
  console.log('\n════════ EN AVANT — Test de connexion Supabase ════════\n');
  let failures = 0;
  for (const { name, pass, detail } of results) {
    if (!pass) failures += 1;
    console.log(` ${pass ? '✅' : '❌'}  ${name}${detail ? ` — ${detail}` : ''}`);
  }
  console.log(
    failures === 0
      ? '\n🎉 Connexion Supabase entièrement opérationnelle.\n'
      : `\n⚠️  ${failures} contrôle(s) en échec — voir ci-dessus.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Erreur inattendue :', error);
  process.exit(1);
});

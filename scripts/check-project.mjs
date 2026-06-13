#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

async function exists(path) {
  try {
    await access(resolve(root, path));
    return true;
  } catch {
    return false;
  }
}

const requiredFiles = [
  'index.html', 'admin.html', 'login.html', 'vercel.json', 'package.json',
  'api/_lib/supabase.js', 'api/auth/login.js', 'api/admin/dashboard.js',
  'supabase/schema.sql', 'supabase/verify.sql',
];

for (const file of requiredFiles) {
  check(`Fichier ${file}`, await exists(file));
}

for (const file of ['package.json', 'vercel.json', '.vscode/settings.json', '.vscode/tasks.json']) {
  try {
    JSON.parse(await readFile(resolve(root, file), 'utf8'));
    check(`JSON ${file}`, true);
  } catch (error) {
    check(`JSON ${file}`, false, error.message);
  }
}

const envText = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^"(.*)"$/, '$1')])
);

for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PIN_COOKIE_SECRET']) {
  check(`Variable ${name}`, Boolean(env[name]));
}

const siteUrlValid = /^https?:\/\/[^/]+/i.test(env.SITE_URL || '');
check('Variable SITE_URL', siteUrlValid, siteUrlValid ? '' : env.SITE_URL ? 'format invalide' : 'absente');
const cookieSecretValid = String(env.ADMIN_PIN_COOKIE_SECRET || '').length >= 32;
check('ADMIN_PIN_COOKIE_SECRET robuste', cookieSecretValid, cookieSecretValid ? '' : '32 caractères minimum');

for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']) {
  check(`Intégration ${name}`, Boolean(env[name]), env[name] ? '' : 'à configurer avant le test du service');
}

const publicFiles = [
  'js/env.js', 'js/app.js', 'js/admin.js', 'js/login.js',
  'index.html', 'admin.html', 'login.html',
];
const publicContent = (await Promise.all(
  publicFiles.map((file) => readFile(resolve(root, file), 'utf8').catch(() => ''))
)).join('\n');

for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'RESEND_API_KEY']) {
  const value = env[name];
  check(`Secret ${name} absent du frontend`, !value || !publicContent.includes(value));
}

let failures = 0;
console.log('\nEN AVANT - Contrôle du projet\n');
for (const item of results) {
  if (!item.pass) failures += 1;
  console.log(`${item.pass ? '[OK]' : '[À FAIRE]'} ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
console.log(`\n${failures ? `${failures} élément(s) à corriger.` : 'Projet prêt pour les tests de déploiement.'}\n`);
process.exitCode = failures ? 1 : 0;

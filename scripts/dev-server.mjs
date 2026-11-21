#!/usr/bin/env node
/* ============================================================================
   EN AVANT — SERVEUR DE DÉVELOPPEMENT LOCAL
   Statique + fonctions /api exécutées comme sur Vercel, sans CLI Vercel.
   Usage :  node scripts/dev-server.mjs     (charge .env automatiquement)
   ============================================================================ */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* .env → process.env (sans écraser les variables déjà définies) */
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const ROUTES = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).rewrites || [];
const PORT = Number(process.env.PORT) || 4886;
if (!process.env.SITE_URL) process.env.SITE_URL = `http://localhost:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* Dossiers jamais servis en statique (secrets / outils / interne) */
const BLOCKED = ['scripts', 'supabase', 'node_modules', 'audit', 'Claude outputs', 'api'];

const moduleCache = new Map();

async function loadApiModule(apiPath) {
  const safe = apiPath.replace(/\.+/g, '.').replace(/[^a-z0-9/_-]/gi, '');
  const file = join(ROOT, 'api', ...safe.split('/')) + '.js';
  if (!file.startsWith(join(ROOT, 'api')) || !existsSync(file)) return null;
  if (!moduleCache.has(file)) {
    moduleCache.set(file, await import(pathToFileURL(file).href));
  }
  return moduleCache.get(file);
}

/* Donne à req/res la même allure que sur Vercel (@vercel/node). */
function vercelify(req, res, searchParams) {
  req.query = Object.fromEntries(searchParams.entries());

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  const nativeSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    nativeSetHeader(name, value);
    return res;
  };
}

async function parseJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw Object.assign(new Error('Corps trop volumineux.'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
  }
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    /* ----- Fonctions /api ----- */
    if (url.pathname.startsWith('/api/')) {
      const route = ROUTES.find(route => route.source === url.pathname);
      const target = route ? new URL(route.destination, url.origin) : url;
      const params = new URLSearchParams(url.searchParams);
      target.searchParams.forEach((value, key) => params.set(key, value));
      const apiPath = target.pathname.slice(5).replace(/\/+$/, '');
      if (apiPath.split('/').some(part => part.startsWith('_'))) {
        res.writeHead(404); return res.end();
      }
      const mod = await loadApiModule(apiPath);
      if (!mod?.default) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end('{"error":"Endpoint introuvable."}');
      }

      vercelify(req, res, params);

      // Comme Vercel : corps parsé sauf si la fonction exporte bodyParser:false
      const parseBody = mod.config?.api?.bodyParser !== false;
      if (parseBody && req.method !== 'GET' && req.method !== 'HEAD') {
        req.body = await parseJsonBody(req);
      }

      await mod.default(req, res);
      console.log(`${req.method} ${url.pathname} → ${res.statusCode}`);
      return;
    }

    /* ----- Statique ----- */
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    if (!extname(pathname) && existsSync(join(ROOT, pathname + '.html'))) pathname += '.html';
    const file = normalize(join(ROOT, pathname));
    const relative = file.slice(ROOT.length + 1);
    const topFolder = relative.split(sep)[0];

    if (!file.startsWith(ROOT + sep) || relative.split(sep).some(part => part.startsWith('.')) || BLOCKED.includes(topFolder)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — Introuvable');
    }

    try {
      const info = await stat(file);
      const target = info.isDirectory() ? join(file, 'index.html') : file;
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store', // dev : jamais de cache périmé
      });
      return res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — Introuvable');
    }
  } catch (error) {
    console.error(`${req.method} ${url.pathname} → ERREUR`, error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end('{"error":"Erreur interne du serveur de dev."}');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const supabaseOk = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('────────────────────────────────────────────────');
  console.log(`▶ En Avant — dev sur http://localhost:${PORT}`);
  console.log(`  Statique : ${ROOT}`);
  console.log(`  API      : /api/* (style Vercel)`);
  console.log(`  Supabase : ${supabaseOk ? 'clés chargées depuis .env ✓' : '⚠ clés absentes — remplissez .env'}`);
  console.log('────────────────────────────────────────────────');
});

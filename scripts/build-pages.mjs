// Génère les sous-pages des rubriques (À propos, Historique, Organisation, 20 chantiers)
// et met à jour le menu, le fil d'Ariane et le pied de page de toutes les pages publiques.
//
//   node scripts/build-pages.mjs
//
// Sources : api/_lib/site-pages.js (structure), docs/livre-blanc.txt (contenu du Livre blanc),
// pages-src/_orig/* (sections reprises des anciennes pages), pages-src/*.html (textes propres aux sous-pages).
// Les pages générées portent la mention « généré par scripts/build-pages.mjs » : modifier les sources, puis relancer.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANTIERS } from '../api/_lib/chat.js';
import { RUBRIQUES, NAV, CHANTIER_PAGES, FAMILLES } from '../api/_lib/site-pages.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const write = (f, s) => { mkdirSync(dirname(join(ROOT, f)), { recursive: true }); writeFileSync(join(ROOT, f), s); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PDF = '/docs/livre-blanc.pdf';
const GENERATED = '<!-- Page générée par scripts/build-pages.mjs : modifier les sources puis relancer le script. -->';

/* ------------------------------------------------------------------ */
/* Livre blanc → blocs (titres, paragraphes, listes) avec leurs pages  */
/* ------------------------------------------------------------------ */
const CAPS = /^[A-ZÀ-ÖØ-Ý0-9’'«»“”().,:;&\-–\s]+$/;
const isCaps = (line) => line.length >= 4 && CAPS.test(line) && /[A-ZÀ-Ý]{3}/.test(line);
const SECTIONS = /^(État des lieux|Objectifs?\b|Dispositions à prendre|Le mot d[eu]|D[ée]partement d|Ile de la gonave|Conclusion|Annexes|Sigles)/i;
const sentenceCase = (text) => {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s*[:.]$/, '');
  return (lower.charAt(0).toUpperCase() + lower.slice(1))
    .replace(/\b(haïti|en avant)\b/g, (m) => m.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()))
    .replace(/(l’|l')état\b/g, '$1État')
    .replace(/\(([\p{L}]{2,8})\)/gu, (m, sigle) => `(${sigle.toUpperCase()})`)
    .replace(/^(Le mot d[eu]) (.+)$/, (m, a, nom) => `${a} ${nom.replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase())}`)
    .replace(/^Etat\b/, 'État');
};

export function livreBlancBlocks(text) {
  const out = [];
  let page = 0; let partie = ''; let chapitre = ''; let section = ''; let nextChantier = 1;
  let pendingTitle = null; let pendingCaps = [];
  let cur = null; let prev = '';
  const push = (type, txt) => { cur = { type, text: txt, page, partie, chapitre, section }; out.push(cur); };
  const add = (line) => {
    if (cur.text.endsWith('­')) cur.text = cur.text.slice(0, -1) + line;
    else cur.text += ` ${line}`;
  };
  const closeTitle = () => {
    if (!pendingTitle) return;
    chapitre = pendingTitle.kind === 'chantier' ? `Chantier ${pendingTitle.n} – ${CHANTIERS[pendingTitle.n - 1]}` : sentenceCase(pendingTitle.parts.join(' '));
    section = ''; pendingTitle = null; cur = null;
  };
  const closeCaps = () => {
    if (!pendingCaps.length) return;
    const titre = sentenceCase(pendingCaps.join(' '));
    if (SECTIONS.test(titre)) { section = titre; cur = null; } else if (titre.length >= 8 && !/^\(/.test(titre)) { push('h4', titre); cur = null; } else if (cur) add(pendingCaps.join(' ')); else push('p', pendingCaps.join(' '));
    pendingCaps = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const pm = /^=== Page (\d+) ===$/.exec(line);
    if (pm) { page = Number(pm[1]); continue; }
    if (!line || /^LIVRE BLANC\s*:/.test(line) || /^PAGE\s*\|\s*\d+$/.test(line)) continue;
    const pa = /^PARTIE\s+([IVX]+)\b/.exec(line);
    if (pa) { closeTitle(); pendingCaps = []; partie = `Partie ${pa[1]}`; chapitre = ''; section = ''; cur = null; continue; }
    const num = /^(\d{1,2})\s*[-–]\s*(.+)$/.exec(line);
    if (num && isCaps(num[2])) {
      closeTitle(); pendingCaps = [];
      const n = Number(num[1]);
      if (partie === 'Partie II' && n === nextChantier && n <= 20) { pendingTitle = { kind: 'chantier', n, parts: [num[2]] }; nextChantier += 1; } else pendingTitle = { kind: 'chapitre', n, parts: [num[2]] };
      continue;
    }
    if (isCaps(line) && !/^ACTION\s*\d/i.test(line)) {
      if (pendingTitle) { pendingTitle.parts.push(line); continue; }
      pendingCaps.push(line); continue;
    }
    closeTitle(); closeCaps();
    const action = /^ACTION\s*\d+\s*:?\s*(.*)$/i.exec(line);
    if (action) { push('h4', line.replace(/^ACTION\s*(\d+)\s*:?\s*/i, 'Action $1 : ')); prev = line; continue; }
    const bullet = /^[-•▪]\s*(.*)$/.exec(line);
    if (bullet) {
      if (!bullet[1]) { prev = line; continue; }
      push('li', bullet[1]); prev = line; continue;
    }
    const prevEnded = /[.!?:;»"”)]$/.test(prev) && prev.length < 70;
    if (cur && cur.type === 'h4' && prev.length >= 60 && /^[a-zà-ÿ]/.test(line)) add(line);
    else if (cur && cur.type !== 'h4' && !prevEnded) add(line);
    else push('p', line);
    prev = line;
  }
  closeTitle(); closeCaps();
  return out.map((b) => ({ ...b, text: b.text.replace(/­/g, '').replace(/\s+/g, ' ').trim() })).filter((b) => b.text);
}

const LB = livreBlancBlocks(read('docs/livre-blanc.txt'));
const lbWhere = (fn) => LB.filter(fn);
const pagesOf = (blocks) => {
  const ps = blocks.map((b) => b.page).filter(Boolean);
  return ps.length ? [Math.min(...ps), Math.max(...ps)] : [null, null];
};
const pagesLabel = ([a, b]) => (a ? (b && b !== a ? `p. ${a}-${b}` : `p. ${a}`) : '');

/** Blocs → HTML ; sections du Livre blanc en sous-titres (avec ancre). */
function blocksHtml(blocks, { sectionLevel = 'h2', skipSections = false } = {}) {
  let html = '';
  let section = null;
  let list = false;
  const toc = [];
  for (const b of blocks) {
    if (!skipSections && b.section !== section) {
      if (list) { html += '</ul>'; list = false; }
      section = b.section;
      if (section) {
        const id = `s-${toc.length + 1}`;
        toc.push({ id, titre: section, page: b.page });
        html += `<${sectionLevel} id="${id}" class="sp-lb-section">${esc(section)}</${sectionLevel}>`;
      }
    }
    if (b.type === 'li') {
      if (!list) { html += '<ul>'; list = true; }
      html += `<li>${esc(b.text)}</li>`;
      continue;
    }
    if (list) { html += '</ul>'; list = false; }
    html += b.type === 'h4' ? `<h3 class="sp-lb-sub">${esc(b.text)}</h3>` : `<p>${esc(b.text)}</p>`;
  }
  if (list) html += '</ul>';
  return { html, toc };
}

/** Section « Ce que dit le Livre blanc ». */
function lbSection({ kicker = 'Livre blanc', titre, intro = '', blocks, soft = false, skipSections = true }) {
  if (!blocks.length) throw new Error(`Livre blanc : aucun bloc pour « ${titre} »`);
  const [a, b] = pagesOf(blocks);
  const { html } = blocksHtml(blocks, { sectionLevel: 'h3', skipSections });
  return `
    <section class="section ${soft ? 'section-soft' : 'section-light'} sp-lb-block">
      <div class="container narrow-container">
        <div class="section-head reveal-up">
          <span class="section-kicker">${esc(kicker)}</span>
          <h2 class="section-title">${esc(titre)}</h2>
          ${intro ? `<p class="sp-lead">${intro}</p>` : ''}
        </div>
        <div class="about-rich-text sp-lb">
          ${html}
          <p class="sp-ref"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Source : <a href="${PDF}#page=${a}" target="_blank" rel="noopener">Livre blanc d’En Avant, ${pagesLabel([a, b])}</a></p>
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Menu, fil d'Ariane, gabarit                                         */
/* ------------------------------------------------------------------ */
const clean = (href) => href.replace(/\.html$/, '').replace(/^\/index$/, '/');

function navHtml(currentFile) {
  const items = NAV.map((item) => {
    const active = item.file === currentFile || item.pages?.some((p) => p.file === currentFile);
    const aria = item.file === currentFile ? ' aria-current="page"' : '';
    const cls = active ? ' class="active"' : '';
    if (!item.pages) return `        <a href="${item.href}"${cls}${aria}>${item.label}</a>`;
    const id = `dd-${item.key}`;
    let menu;
    if (item.key === 'chantiers') {
      menu = FAMILLES.map((f) => `<div class="u-dd-col"><p class="u-dd-head">${f}</p>${
        item.pages.filter((p) => p.famille === f).map((p) => `<a href="${p.href}"${p.file === currentFile ? ' aria-current="page"' : ''}><span class="u-dd-num">${String(p.n).padStart(2, '0')}</span>${esc(p.titre)}</a>`).join('')
      }</div>`).join('');
      menu = `<a class="u-dd-all" href="${item.href}">Voir les 20 chantiers</a><div class="u-dd-cols">${menu}</div>`;
    } else {
      menu = item.pages.map((p) => `<a href="${p.href}"${p.file === currentFile ? ' aria-current="page"' : ''}>${esc(p.titre)}</a>`).join('');
    }
    return `        <div class="u-dd${active ? ' is-current' : ''}" data-dd>
          <div class="u-dd-row"><a href="${item.href}"${cls}${aria}>${item.label}</a><button type="button" class="u-dd-toggle" aria-expanded="false" aria-controls="${id}" aria-label="Ouvrir le sous-menu ${esc(item.label)}"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></div>
          <div class="u-dd-menu${item.key === 'chantiers' ? ' u-dd-wide' : ''}" id="${id}">${menu}</div>
        </div>`;
  });
  return items.join('\n');
}

/** Remplace la partie « liens » du menu (avant .u-links-cta) dans une page. */
function applyNav(html, file) {
  const start = html.indexOf('<nav class="u-links" id="main-nav"');
  if (start < 0) return html;
  const open = html.indexOf('>', start) + 1;
  const cta = html.indexOf('<div class="u-links-cta">', open);
  if (cta < 0) throw new Error(`${file} : .u-links-cta introuvable`);
  return `${html.slice(0, open)}\n${navHtml(file)}\n\n        ${html.slice(cta)}`;
}

/** Pied de page : lien vers les candidats et la diaspora sous « Découvrir ». */
function applyFooter(html) {
  if (html.includes('href="/organisation/candidats"')) return html;
  return html.replace(/(<li><a href="\/organisation(?:\.html)?">[^<]*<\/a><\/li>)/, `$1\n          <li><a href="/organisation/candidats">Nos candidats</a></li>\n          <li><a href="/organisation/diaspora">Diaspora et branches extérieures</a></li>`);
}

const TEMPLATE = read('organisation.html');
const HEAD_END = TEMPLATE.indexOf('<main');
const FOOT_START = TEMPLATE.indexOf('</main>') + '</main>'.length;
const SCRIPTS_RE = /<script src="\/js\/organisation(?:-team)?\.js"><\/script>\s*/g;

function crumbsHtml(crumbs) {
  return `<nav class="sp-crumbs" aria-label="Fil d’Ariane"><ol>${crumbs.map((c, i) => (i === crumbs.length - 1
    ? `<li aria-current="page">${esc(c.label)}</li>` : `<li><a href="${c.href}">${esc(c.label)}</a></li>`)).join('')}</ol></nav>`;
}

function renderPage({ file, path, title, description, main, team = false }) {
  const url = `https://enavant.org${path}`;
  let head = TEMPLATE.slice(0, HEAD_END)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | En Avant</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)} | En Avant`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)} | En Avant`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace('<html lang="fr">', `<html lang="fr">\n${GENERATED}`);
  head = applyNav(head, file);
  let foot = TEMPLATE.slice(FOOT_START).replace(SCRIPTS_RE, '');
  if (team) foot = foot.replace('<script src="/js/premium.js"></script>', '<script src="/js/premium.js"></script>\n  <script src="/js/organisation-team.js"></script>');
  foot = applyFooter(foot);
  write(file, `${head}<main class="sp-page">\n${main}\n  </main>${foot}`);
}

function hero({ crumbs, kicker, titre, lead, img }) {
  return `
    <section class="sp-hero">
      ${img ? `<img class="sp-hero-img" src="${img}" alt="" aria-hidden="true" decoding="async">` : ''}
      <div class="sp-hero-overlay"></div>
      <div class="container sp-hero-content">
        ${crumbsHtml(crumbs)}
        <span class="eyebrow">${esc(kicker)}</span>
        <h1>${esc(titre)}</h1>
        ${lead ? `<p>${esc(lead)}</p>` : ''}
      </div>
    </section>`;
}

function cardsHtml(pages, { currentFile = null } = {}) {
  return `<div class="sp-cards">${pages.map((p) => `
          <a class="sp-card${p.file === currentFile ? ' is-current' : ''}" href="${p.href}"${p.file === currentFile ? ' aria-current="page"' : ''}>
            <span class="sp-card-icon" aria-hidden="true"><i class="${p.icon}"></i></span>
            <strong>${esc(p.titre)}</strong>
            <span>${esc(p.description)}</span>
            <span class="sp-card-more">${p.file === currentFile ? 'Vous êtes ici' : 'Découvrir'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
          </a>`).join('')}
        </div>`;
}

function siblingsSection(rubrique, file) {
  return `
    <section class="section section-soft sp-siblings">
      <div class="container">
        <div class="section-head reveal-up">
          <span class="section-kicker">${esc(rubrique.label)}</span>
          <h2 class="section-title">Dans la même rubrique</h2>
        </div>
        ${cardsHtml(rubrique.pages, { currentFile: file })}
      </div>
    </section>`;
}

const engageCta = `
    <section class="section section-dark sp-cta">
      <div class="container sp-cta-inner">
        <div>
          <h2>Ce projet vous parle ?</h2>
          <p>Rejoignez En Avant ou soutenez le parti pour porter ce programme partout en Haïti et dans la diaspora.</p>
        </div>
        <div class="sp-cta-actions">
          <a class="btn btn-primary" href="/adherer.html">Adhérer</a>
          <a class="btn btn-ghost" href="/don.html"><i class="fa-solid fa-heart" aria-hidden="true"></i> Faire un don</a>
        </div>
      </div>
    </section>`;

const orig = (hub, i) => read(`pages-src/_orig/${hub}/${i}.html`);
const src = (name) => read(`pages-src/${name}.html`);
const R = Object.fromEntries(RUBRIQUES.map((r) => [r.key, r]));
const pageOf = (key, slug) => R[key].pages.find((p) => p.slug === slug);
const home = { label: 'Accueil', href: '/' };

/* ------------------------------------------------------------------ */
/* Sous-pages                                                          */
/* ------------------------------------------------------------------ */
const chap = (prefix) => (b) => b.chapitre.startsWith(prefix);
const sect = (name) => (b) => b.section === name;

/** Blocs d'un passage : du premier bloc contenant `from` (inclus) au premier contenant `to` (exclu). */
function slice(blocks, from, to) {
  const i = from ? blocks.findIndex((b) => b.text.includes(from)) : 0;
  const j = to ? blocks.findIndex((b, k) => k > i && b.text.includes(to)) : -1;
  if (i < 0) throw new Error(`Livre blanc : passage introuvable « ${from} »`);
  return blocks.slice(i, j < 0 ? undefined : j);
}

const CONTENT = {
  apropos: {
    img: '/pictures/foule-Assise.webp',
    identite: () => [orig('Apropos', 1), orig('Apropos', 2), orig('Apropos', 3)],
    valeurs: () => [orig('Apropos', 4), lbSection({ titre: 'Nos valeurs dans le Livre blanc', blocks: slice(lbWhere(chap('Repère idéologique')), 'Nos valeurs sont celles', 'Le parti En Avant veut contribuer'), soft: true })],
    heritage: () => [orig('Apropos', 5), lbSection({ titre: 'Les héritiers d’un long combat', blocks: slice(lbWhere(chap('Repère idéologique')), 'Le parti En Avant veut contribuer', 'Notre idéal s’inscrit aussi'), soft: true })],
    'vision-2054': () => [
      orig('Apropos', 6),
      lbSection({ kicker: 'Vision 2054', titre: 'Objectif 2054 : mise à jour du plan stratégique de développement d’Haïti', blocks: lbWhere(chap('Objectif 2054')), soft: true }),
    ],
    'mot-du-coordonnateur': () => [
      lbSection({ kicker: 'Jerry Tardieu', titre: 'Le mot du coordonnateur national', blocks: lbWhere(sect('Le mot de Jerry Tardieu')) }),
    ],
  },
  historique: {
    img: '/pictures/home-galerie/galerie-3.webp',
    origines: () => [
      orig('historique', 1),
      lbSection({ kicker: 'Repères', titre: 'De mouvement à parti politique', blocks: slice(lbWhere(chap('Structure organisationnelle')), 'En 2020 nait', 'La structure organisationnelle du parti'), soft: true }),
      orig('historique', 2),
    ],
    engagement: () => [
      orig('historique', 3), orig('historique', 4), orig('historique', 5), orig('historique', 6), orig('historique', 7),
      lbSection({ kicker: 'Nancy Vilcé', titre: 'Le mot de la coordonnatrice nationale adjointe', intro: 'Responsable des branches nationales et des affaires féminines.', blocks: lbWhere(sect('Le mot de Nancy Vilcé')).slice(1) }),
    ],
    'remettre-de-l-ordre': () => [
      orig('historique', 8),
      lbSection({ kicker: 'Livre blanc', titre: 'Restaurer l’autorité de l’État', blocks: lbWhere(chap('Restaurer l’autorité de l’État')), soft: true }),
      lbSection({ kicker: 'Livre blanc', titre: 'Vingt chantiers et trois priorités', blocks: lbWhere(chap('Vingt chantiers et trois priorités')) }),
      `
    <section class="section section-soft">
      <div class="container">
        <div class="section-head reveal-up"><span class="section-kicker">Programme</span><h2 class="section-title">Les trois chantiers prioritaires</h2></div>
        ${cardsHtml(CHANTIER_PAGES.filter((c) => [1, 3, 4].includes(c.n)).map((c) => ({ ...c, description: c.resume })))}
      </div>
    </section>`,
    ],
  },
  organisation: {
    img: '/pictures/home-galerie/galerie-1.webp',
    organisme: () => [
      orig('organisation', 1).replace(/<div class="cta-row">[\s\S]*?<\/div>/, ''),
      lbSection({ kicker: 'Livre blanc', titre: 'La structure organisationnelle en détail', blocks: slice(lbWhere(chap('Structure organisationnelle')), 'La structure organisationnelle du parti'), soft: true }),
      orig('organisation', 2),
    ],
    candidats: () => [src('organisation-candidats')],
    diaspora: () => [
      src('organisation-diaspora'),
      orig('organisation', 2)
        .replace('<section id="structure" class="organisation-structure">', '<section id="structure" class="organisation-structure" data-team-only="branches-exterieures">')
        .replace('<h2>Architecture de la coordination</h2>', '<h2>Les coordinations des branches extérieures</h2>')
        .replace(/<div class="orga-section" data-section="(?!branches-exterieures)[\s\S]*?<div class="orga-divider"><\/div>\s*/g, ''),
      lbSection({ kicker: 'Saint-Jean Joseph', titre: 'Le mot du coordonnateur des branches extérieures', intro: 'Coordonnateur national adjoint en charge des branches extérieures du parti.', blocks: lbWhere(sect('Le mot de Saint-Jean Joseph')).slice(1), soft: true }),
    ],
  },
};

const HERO_LEAD = {
  identite: 'Un parti réformiste, centriste et social-démocrate qui entend dépasser les anciens clivages pour rassembler celles et ceux qui veulent rebâtir Haïti.',
};

for (const key of ['apropos', 'historique', 'organisation']) {
  const r = R[key];
  for (const p of r.pages) {
    const sections = CONTENT[key][p.slug]();
    const isTeam = key === 'organisation' && ['organisme', 'diaspora'].includes(p.slug);
    renderPage({
      file: p.file, path: p.href, title: p.titre, description: p.description, team: isTeam,
      main: [
        hero({ crumbs: [home, { label: r.label, href: r.href }, { label: p.titre }], kicker: r.label, titre: p.titre, lead: HERO_LEAD[p.slug] || p.description, img: CONTENT[key].img }),
        ...sections.map((s) => `\n    ${s.trim()}`),
        siblingsSection(r, p.file),
        engageCta,
      ].join('\n'),
    });
  }
}

/* 20 chantiers ------------------------------------------------------- */
for (const c of CHANTIER_PAGES) {
  const blocks = lbWhere((b) => b.chapitre === `Chantier ${c.n} – ${CHANTIERS[c.n - 1]}`);
  if (blocks.length < 5) throw new Error(`Chantier ${c.n} : contenu du Livre blanc introuvable`);
  const { html, toc } = blocksHtml(blocks);
  const [a, b] = pagesOf(blocks);
  const num = String(c.n).padStart(2, '0');
  const prev = CHANTIER_PAGES[c.n - 2];
  const next = CHANTIER_PAGES[c.n];
  const main = [
    hero({ crumbs: [home, { label: 'Vingt chantiers', href: '/vingt-chantiers' }, { label: c.titre }], kicker: `Chantier ${num} · ${c.famille}`, titre: c.titre, lead: c.resume, img: `/pictures/chantiers/chantier-${num}.webp` }),
    `
    <section class="section section-light">
      <div class="container sp-article-grid">
        <aside class="sp-aside">
          <div class="sp-aside-card">
            <p class="sp-aside-title">Dans cette page</p>
            <ol>${blocks[0].section ? '' : '<li><a href="#contenu">Présentation</a></li>'}${toc.map((t) => `<li><a href="#${t.id}">${esc(t.titre)}</a></li>`).join('')}</ol>
            <a class="sp-aside-pdf" href="${PDF}#page=${a}" target="_blank" rel="noopener"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Livre blanc, ${pagesLabel([a, b])}</a>
          </div>
        </aside>
        <article class="about-rich-text sp-lb sp-article" id="contenu">
          ${html}
          <p class="sp-ref"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Source : <a href="${PDF}#page=${a}" target="_blank" rel="noopener">Livre blanc d’En Avant, Partie II, Chantier ${c.n}, ${pagesLabel([a, b])}</a></p>
        </article>
      </div>
    </section>`,
    `
    <section class="section section-soft">
      <div class="container">
        <nav class="sp-pager" aria-label="Chantiers précédent et suivant">
          ${prev ? `<a class="sp-pager-prev" href="${prev.href}"><span>Chantier ${String(prev.n).padStart(2, '0')}</span><strong>${esc(prev.titre)}</strong></a>` : '<span></span>'}
          <a class="sp-pager-all" href="/vingt-chantiers">Les 20 chantiers</a>
          ${next ? `<a class="sp-pager-next" href="${next.href}"><span>Chantier ${String(next.n).padStart(2, '0')}</span><strong>${esc(next.titre)}</strong></a>` : '<span></span>'}
        </nav>
      </div>
    </section>`,
    engageCta,
  ].join('\n');
  renderPage({ file: c.file, path: c.href, title: `Chantier ${c.n} : ${c.titre}`, description: c.resume, main });
}

/* Pages principales des rubriques ----------------------------------- */
const HUB_INTRO = {
  apropos: ['Découvrir', 'Qui sommes-nous ?', 'Notre identité politique, nos valeurs, l’héritage dont nous nous réclamons et la vision qui guide notre action.'],
  historique: ['Découvrir', 'Notre histoire en trois temps', 'D’un mouvement citoyen lancé en 2020 au parti qui veut remettre de l’ordre dans la République.'],
  organisation: ['Découvrir', 'Comment le parti est organisé', 'Les instances du parti, ses candidats aux élections et ses coordinations dans la diaspora.'],
};
for (const key of ['apropos', 'historique', 'organisation']) {
  const r = R[key];
  const html = read(r.file);
  const [kicker, titre, intro] = HUB_INTRO[key];
  const main = `<main>
    ${orig(r.file.replace('.html', ''), 0).trim()}

    <section class="section section-light sp-hub">
      <div class="container">
        <div class="section-head reveal-up">
          <span class="section-kicker">${kicker}</span>
          <h2 class="section-title">${titre}</h2>
          <p class="sp-lead">${intro}</p>
        </div>
        ${cardsHtml(r.pages)}
      </div>
    </section>
${engageCta}
  </main>`;
  let out = html.slice(0, html.indexOf('<main')) + main + html.slice(html.indexOf('</main>') + '</main>'.length);
  if (key === 'organisation') out = out.replace(SCRIPTS_RE, '');
  write(r.file, out);
}

/* Page des 20 chantiers : chaque carte mène à sa page ---------------- */
{
  let html = read('vingt-chantiers.html');
  for (const c of CHANTIER_PAGES) {
    const num = String(c.n).padStart(2, '0');
    html = html.replace(new RegExp(`(<article class="chantier-card[^"]*" data-theme="\\w+" data-img="/pictures/chantiers/chantier-${num}\\.webp")(?: data-href="[^"]*")?>`), `$1 data-href="${c.href}">`);
    html = html.replace(new RegExp(`(<span class="card-index">${num}</span>[\\s\\S]*?<h3>)(?:<a class="card-link" href="[^"]*">)?([^<]+)(?:</a>)?(</h3>)`), `$1<a class="card-link" href="${c.href}">$2</a>$3`);
  }
  write('vingt-chantiers.html', html);
}

/* Menu et pied de page de toutes les pages publiques ---------------- */
for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
  const html = read(f);
  const next = applyFooter(applyNav(html, f));
  if (next !== html) write(f, next);
}

console.log(`Sous-pages : ${RUBRIQUES.reduce((n, r) => n + r.pages.length, 0)} ; blocs du Livre blanc : ${LB.length}`);

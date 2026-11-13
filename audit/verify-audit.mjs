// Audit local en lecture seule : aucun appel reseau, aucune donnee reelle.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const evidence = { date: '2026-11-12', scope: 'Local uniquement; services externes simules', readable: [], unreadable: [], html: [], missingLocalTargets: [], tests: [], syntax: [] };
const source = new Map();
async function walk(dir) {
  const out = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel', '.claude', '.vscode', 'audit'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p.replaceAll('\\', '/'));
  }
  return out;
}
const files = await walk('');
const candidates = files.filter(p => /\.(html|js|mjs|css|sql|md)$/.test(p) && !/^(results1|yt_search_results|C.)/.test(p));
for (const p of candidates) {
  try { const text = await readFile(join(root,p),'utf8'); source.set(p,text);evidence.readable.push(p); }
  catch(e) {evidence.unreadable.push({file:p,code:e.code});}
}
evidence.readable.sort(); evidence.unreadable.sort((a,b)=>a.file.localeCompare(b.file));
for (const [p, text] of source) {
  if (!p.endsWith('.html')) continue;
  const imgs = text.match(/<img\b[^>]*>/gi) || [];
  evidence.html.push({ file: p, title: text.match(/<title>(.*?)<\/title>/is)?.[1], h1: (text.match(/<h1\b/gi)||[]).length, canonical: /rel=["']canonical["']/i.test(text), noindex: /content=["'][^"']*noindex/i.test(text), images: imgs.length, imagesWithDimensions: imgs.filter(t=>/\bwidth=/.test(t)&&/\bheight=/.test(t)).length, responsiveImages: imgs.filter(t=>/\bsrcset=/.test(t)).length, placeholderLinks: (text.match(/href=["']#["']/g)||[]).length });
  for (const m of text.matchAll(/(?:href|src)=["'](\/[^"'#?]*)/g)) {
    if (!m[1] || m[1] === '/' || m[1].startsWith('/api/')) continue;
    try { await stat(join(root, decodeURIComponent(m[1]))); }
    catch { evidence.missingLocalTargets.push({ file: p, target: m[1] }); }
  }
}
const pictures = await Promise.all(files.filter(p=>p.startsWith('pictures/')).map(async p=>({file:p,bytes:(await stat(join(root,p))).size})));
evidence.assets = { pictureCount: pictures.length, totalPictureBytes: pictures.reduce((n,p)=>n+p.bytes,0), largest: pictures.sort((a,b)=>b.bytes-a.bytes).slice(0,10), pdfBytes: (await stat(join(root,'docs/livre-blanc.pdf'))).size };
for (const [p] of source) {
  if (!/\.(m?js)$/.test(p)) continue;
  const r = spawnSync(process.execPath, ['--check', join(root,p)], { encoding:'utf8', timeout:10000 });
  evidence.syntax.push({file:p,pass:r.status===0,error:r.status===0?undefined:(r.stderr||r.error?.message||'unknown').slice(0,1000)});
}
function load(p, globals={}) {
  const text = source.get(p);
  if (!text) throw Error('Fichier inaccessible : '+p);
  const transformed = text.replace(/^import\s+[\s\S]*?;\s*$/gm,'').replace(/export default async function handler/, 'async function handler').replace(/export (function|const)/g,'$1');
  const context = vm.createContext({console,Buffer,URLSearchParams,...globals});
  vm.runInContext(transformed+'\n;globalThis.auditExports = { '+(p.endsWith('http.js')?'enforceRateLimit, json, getBody, clean, handleError':'handler')+' };',context);
  return context.auditExports;
}
function response() {return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(p){this.payload=p;return this;}};}
const http = load('api/_lib/http.js');
async function test(name,fn) {try {await fn();evidence.tests.push({name,pass:true});}catch(e){evidence.tests.push({name,pass:false,error:e.message});}}
await test('Limiter: une nouvelle instance accepte de nouveau la meme IP',()=>{
  const req={headers:{'x-forwarded-for':'192.0.2.1'}};
  const a=load('api/_lib/http.js'),b=load('api/_lib/http.js');
  assert.equal(a.enforceRateLimit(req,response(),{limit:1}),true);
  assert.equal(a.enforceRateLimit(req,response(),{limit:1}),false);
  assert.equal(b.enforceRateLimit(req,response(),{limit:1}),true);
});
await test('Quiz: un score maximal declare par le client est accepte sans reponses',async()=>{
  let row;
  const {handler}=load('api/_trivia/score.js',{...http,getServiceClient:()=>({from:()=>({insert:async r=>{row=r;return {error:null};}})}),enforceRateLimit:()=>true});
  const res=response(); await handler({method:'POST',headers:{},body:{user_session:'audit-session',pseudo:'Audit fictif',score:50,total:50}},res);
  assert.equal(res.statusCode,201);assert.equal(row.score,50);
});
await test('Dashboard: acces_dashboard suffit pour exporter les NINU',async()=>{
  const permissions=[];let fields='';
  const query={select(v){fields=v;return this;},order(){return this;},range(){return Promise.resolve({data:[{ninu:'FICTIF'}],count:1,error:null});}};
  const {handler}=load('api/_admin/dashboard.js',{...http,requirePermission:async(_req,p)=>{permissions.push(p);return {user:{email:'audit@example.invalid'},role:'member'};},getServiceClient:()=>({from:()=>query})});
  const res=response();await handler({method:'GET',query:{dataset:'members',export:'1'}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(permissions,['acces_dashboard']);assert.match(fields,/ninu/);
});
await test('Inscription: email auto-confirme et erreur de mise a jour profil ignoree',async()=>{
  let options;
  const service={auth:{admin:{createUser:async o=>{options=o;return {data:{user:{id:'fictif'}},error:null};}}},from:()=>({update:()=>({eq:async()=>({error:{message:'Echec simule'}})})})};
  const {handler}=load('api/_auth/register.js',{...http,isEmail:()=>true,isText:()=>true,methodGuard:()=>true,enforceRateLimit:()=>true,getServiceClient:()=>service});
  const res=response();await handler({method:'POST',body:{email:'audit@example.invalid',nom:'Audit',pseudo:'Audit',password:'mot-de-passe-fictif'}},res);
  assert.equal(options.email_confirm,true);assert.equal(res.statusCode,201);
});
await test('Article: un slug absent de API affiche le communique de demonstration',async()=>{
  const elements=new Map();
  const element=()=>({textContent:'',innerHTML:'',hidden:false,classList:{remove(){},add(){}},appendChild(){},addEventListener(){}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
  const tasks=[];
  const context=vm.createContext({document,window:{location:{search:'?slug=inexistant-audit',href:'https://example.invalid/article-details?slug=inexistant-audit'}},URLSearchParams,AbortSignal,fetch:async()=>({ok:false,json:async()=>({error:'Article introuvable'})}),setTimeout:(f)=>tasks.push(f),navigator:{}});
  vm.runInContext(source.get('js/article.js'),context);
  await new Promise(r=>setTimeout(r,20));
  assert.match(elements.get('art-title').textContent,/20 chantiers/);
});
await test('Espace membre: un titre contenant du HTML est injecte sans echappement',()=>{
  const text=source.get('membre.html');const start=text.indexOf('function renderSubmissions(');const end=text.indexOf('async function loadMySubmissions',start);
  const list={innerHTML:''};const context=vm.createContext({document:{getElementById:()=>list},statusLabel:()=>({cls:'pending',txt:'En attente'}),fmtDate:()=>''});
  vm.runInContext(text.slice(start,end)+'\nrenderSubmissions([{titre:"<strong data-audit=1>TEST</strong>",excerpt:"",review_status:"pending"}]);',context);
  assert.match(list.innerHTML,/<strong data-audit=1>/);
});
await writeFile(join(root,'audit/evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({readable:evidence.readable.length,unreadable:evidence.unreadable.length,html:evidence.html,assets:evidence.assets,syntaxPassed:evidence.syntax.filter(t=>t.pass).length,syntaxFailed:evidence.syntax.filter(t=>!t.pass),tests:evidence.tests,missingLocalTargets:evidence.missingLocalTargets},null,2));
process.exit(evidence.tests.every(t=>t.pass)?0:1);

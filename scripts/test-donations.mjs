// Tests isoles du selecteur : aucune ouverture de lien ni transaction Stripe.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const code = await readFile(new URL('../js/don.js', import.meta.url), 'utf8');
const configCode = await readFile(new URL('../js/donation-links.js', import.meta.url), 'utf8');
const keys = ['10', '25', '50', '100', '250', '500', '1000', 'custom'];
function setup(config, search = '') {
  const element = () => ({ textContent: '', disabled: true, hidden: false, attrs: {}, events: {},
    setAttribute(k,v) {this.attrs[k]=v;}, addEventListener(k,fn) {this.events[k]=fn;},
    click() {if (!this.disabled) this.events.click?.();} });
  const buttons = keys.map(key => {
    const e = element(); e.disabled = false; e.dataset = {donation:key};
    const small = element(); e.querySelector = () => small; return e;
  });
  const submit = element(), selection = element(), notice = element(), redirected = [];
  const nodes = {'don-payment-submit':submit,'don-payment-selection':selection,'don-payment-notice':notice};
  const window = {EA_DONATION_LINKS:config,location:{search,assign:url=>redirected.push(url)}};
  vm.runInNewContext(code,{window,URL,URLSearchParams,document:{querySelectorAll:()=>buttons,getElementById:id=>nodes[id]}});
  return {buttons,submit,selection,notice,redirected};
}
test('Sans configuration : tous les montants restent sans paiement',()=>{
  const s=setup(undefined);
  for(const b of s.buttons){b.click();assert.equal(s.submit.disabled,true);s.submit.click();}
  assert.equal(s.notice.hidden,false);assert.deepEqual(s.redirected,[]);
});
test('Chaque montant active redirige exclusivement vers son propre lien',()=>{
  const config=Object.fromEntries(keys.map(k=>[k,`https://buy.stripe.com/test_audit_${k}`]));
  const s=setup(config);
  keys.forEach((key,i)=>{s.buttons[i].click();assert.equal(s.submit.disabled,false);s.submit.click();assert.equal(s.redirected.at(-1),config[key]);assert.equal(s.buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);});
  assert.equal(s.notice.hidden,true);
});
test('Un montant manquant ne reutilise jamais le lien du montant precedent',()=>{
  const s=setup({'10':'https://buy.stripe.com/test_audit_10'});
  s.buttons[0].click();s.submit.click();s.buttons[1].click();s.submit.click();
  assert.equal(s.submit.disabled,true);assert.equal(s.redirected.length,1);
  assert.match(s.selection.textContent,/25/);assert.equal(s.notice.hidden,false);
});
test('Liens non Stripe, HTTP, secrets et URL trompeuses restent indisponibles',()=>{
  for(const url of ['sk_test_fictif','javascript:alert(1)','http://buy.stripe.com/test','https://buy.stripe.com.evil.invalid/test','https://buy.stripe.com@evil.invalid/test','https://evil.invalid@buy.stripe.com/test','https://buy.stripe.com:444/test','https://buy.stripe.com/']){
    const s=setup({'10':url});s.buttons[0].click();s.submit.click();assert.equal(s.submit.disabled,true,url);assert.equal(s.redirected.length,0);
  }
});
test('Le montant libre est choisi sur sa propre page Stripe',()=>{
  const s=setup({custom:'https://buy.stripe.com/test_audit_custom'});
  s.buttons[7].click();assert.match(s.selection.textContent,/directement sur Stripe/);s.submit.click();assert.equal(s.redirected[0],'https://buy.stripe.com/test_audit_custom');
});
test('Le retour succes ne pretend pas confirmer un paiement',()=>{
  const s=setup({},'?statut=succes');assert.match(s.selection.textContent,/connaître le statut/);assert.doesNotMatch(s.selection.textContent,/bien été enregistré/);assert.equal(s.submit.disabled,true);
});
test('La configuration livree laisse tous les liens vides',()=>{
  const context={window:{}};vm.runInNewContext(configCode,context);
  assert.deepEqual(Object.keys(context.window.EA_DONATION_LINKS).sort(),keys.slice().sort());
  assert.equal(Object.values(context.window.EA_DONATION_LINKS).every(v=>v===''),true);
});

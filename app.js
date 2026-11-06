// Szabad Föld-korpusz – böngésző és javító felület
// Az adatok a Supabase-ben vannak; olvasni csak a munkatárslistán szereplő, bejelentkezett felhasználók tudnak.
// Javítani a szerkesztők és az admin tud, kizárólag ellenőrzött adatbázis-függvényeken keresztül;
// minden változás naplózódik, a felülírt érték megmarad és visszaállítható.
'use strict';

const SUPABASE_URL = 'https://sddljxcdqmizcourewuk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xbjE5gq891wkOCgl03pThQ_xFi3qE2v';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const EVEK = [1958, ...Array.from({ length: 15 }, (_, i) => 1960 + i), 1976, ...Array.from({ length: 9 }, (_, i) => 1981 + i)];
const PAGE = 50;
const MEZOK = [
  // [kulcs, címke, zárt?, hosszú szöveg?]
  ['mufaj', 'Műfaj', true], ['rovat', 'Rovat'],
  ['osszefoglalas', 'Rövid összefoglalás', false, true], ['kulcsidezet', 'Kulcsidézet', false, true],
  ['szemely', 'Személy(ek)'], ['helyszin', 'Helyszín(ek)'], ['szervezet', 'Egyéb szervezetek'],
  ['alairas_telepules', 'Aláírás települése'], ['alairas_szervezet', 'Aláírás szervezete'],
  ['munka', 'MUNKA', true], ['tarsadalombiztositas', 'TÁRSADALOMBIZTOSÍTÁS', true], ['eletmod', 'ÉLETMÓD', true],
  ['szarmazas', 'SZÁRMAZÁS', true], ['generaciok', 'GENERÁCIÓK', true], ['szerepek', 'SZEREPEK', true],
  ['noszervezetek', 'NŐSZERVEZETEK', true], ['kodolasi_megjegyzes', 'Kódolási megjegyzés', false, true],
];
const MEZO = Object.fromEntries(MEZOK.map(m => [m[0], { cimke: m[1], zart: !!m[2], hosszu: !!m[3] }]));
const CSOPORTOK = [
  ['Alapadatok', ['mufaj', 'rovat', 'osszefoglalas', 'kulcsidezet']],
  ['Szereplők, helyek, szervezetek', ['szemely', 'helyszin', 'szervezet', 'alairas_telepules', 'alairas_szervezet']],
  ['Értelmező oszlopok', ['munka', 'tarsadalombiztositas', 'eletmod', 'szarmazas', 'generaciok', 'szerepek', 'noszervezetek']],
  ['Megjegyzés', ['kodolasi_megjegyzes']],
];
const FORRAS = { kutato_1958: '1958 kézi', kutato_1975: '1975 kézi', gepi_2026: 'gépi', szigno_szkript: 'szignóból', javitas: 'javítás' };
const KATALOGUS = [
  ['azonosito', 'Azonosító', false], ['datum', 'Dátum', true], ['oldal', 'Oldal', true], ['nyomtatott_oldal', 'Nyomtatott oldal', true],
  ['cim', 'Cím', true], ['cim_a_lapon', 'Cím a lapon', true], ['alcim', 'Alcím', true], ['szerzo', 'Szerző', true],
  ['szerzo_a_lapon', 'Szerző (a lapon)', true], ['illusztracio', 'Illusztráció', true], ['megbizhatosag', 'Kinyerés megbízhatósága', true],
  ['kinyeresi_megjegyzes', 'Kinyerési megjegyzés', false], ['kutatoi_megjegyzes', 'Kutatói megjegyzés', true],
  ['forras_pdf', 'Forrás PDF', false], ['eleres', 'Elérés', false], ['karakterszam', 'Karakterszám', false],
];

const S = {
  user: null, nev: null, szerep: null, szerk: false, admin: false, szotar: {},
  tab: 'bongeszo',
  k: { evek: [], szoveg: '', cim: '', mezo: '', ertek: '', megbiz: '', allapot: '', oldal: 0 },
  lista: [], osszes: 0,
};
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ---------- segédfüggvények ----------
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const dash = v => (v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v));
function msg(el, text, kind = 'info') { el.innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : ''; }
async function q(p) {
  const r = await p;
  if (r.error) throw new Error(r.error.message || String(r.error));
  return r;
}
function hiba(e, hol) { alert((hol ? hol + ': ' : '') + (e && e.message ? e.message : e)); }
const forrasBadge = f => `<span class="badge f-${esc(f)}" title="Forrás">${esc(FORRAS[f] || f)}</span>`;
const fmtIdo = t => t ? new Date(t).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '';
function ugras(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

// ---------- belépés ----------
async function init() {
  $('#loginform').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email').value.trim().toLowerCase(), password = $('#jelszo').value;
    if (!password) { msg($('#loginmsg'), 'Add meg a jelszót, vagy kérj belépési linket e-mailben.', 'err'); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) msg($('#loginmsg'), /confirm/i.test(error.message) ? 'Az e-mail-címed még nincs megerősítve. Kérd meg a korpusz gazdáját, hogy erősítse meg a fiókodat.' : 'Sikertelen belépés: hibás e-mail-cím vagy jelszó.', 'err');
  });
  $('#linkbtn').addEventListener('click', async () => {
    const email = $('#email').value.trim().toLowerCase();
    if (!email) { msg($('#loginmsg'), 'Előbb add meg az e-mail-címedet.', 'err'); return; }
    // a fiók az első linkkéréskor jön létre; a hozzáférést a munkatárslista adja, nem a fiók
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    if (error) msg($('#loginmsg'), /after \d+ seconds/.test(error.message) ? 'Biztonsági okból egy percet várni kell két linkkérés között. Próbáld újra kicsit később, vagy lépj be jelszóval.' : 'Nem sikerült linket küldeni (' + error.message + '). Lépj be jelszóval.', 'err');
    else msg($('#loginmsg'), 'Elküldtük a belépési linket. Nyisd meg ugyanebben a böngészőben.', 'ok');
  });
  $('#pwbtn').addEventListener('click', async () => {
    const uj = prompt('Új jelszó (legalább 10 karakter):');
    if (!uj) return;
    if (uj.length < 10) { alert('A jelszó legalább 10 karakter legyen.'); return; }
    const { error } = await sb.auth.updateUser({ password: uj });
    alert(error ? 'Nem sikerült: ' + error.message : 'A jelszó beállítva. Legközelebb e-mail-címmel és jelszóval is beléphetsz.');
  });
  for (const id of ['#logout', '#logout2']) $(id).addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); });
  $('#tabs').addEventListener('click', e => { const t = e.target.dataset.tab; if (t) ugras('#' + t); });
  window.addEventListener('hashchange', () => { if (S.user && S.szerep) route(); });
  sb.auth.onAuthStateChange((_ev, session) => { if (session && !S.user) belepve(session); });
  const { data: { session } } = await sb.auth.getSession();
  if (session) belepve(session); else $('#login').classList.remove('hidden');
}

async function belepve(session) {
  S.user = session.user;
  $('#login').classList.add('hidden');
  if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
  try {
    const { data: m } = await q(sb.from('sf_munkatarsak').select('nev,szerep,aktiv').eq('email', S.user.email.toLowerCase()).maybeSingle());
    if (!m || !m.aktiv) { $('#noaccess-email').textContent = S.user.email; $('#noaccess').classList.remove('hidden'); return; }
    S.nev = m.nev; S.szerep = m.szerep; S.szerk = ['szerkeszto', 'admin'].includes(m.szerep); S.admin = m.szerep === 'admin';
    const { data: sz } = await q(sb.from('sf_szotar').select('mezo,ertek,leiras,sorrend').eq('aktiv', true).order('sorrend'));
    S.szotar = {};
    for (const r of sz) (S.szotar[r.mezo] ||= []).push(r);
    $('#userinfo').textContent = (m.nev || S.user.email) + ' · ' + ({ olvaso: 'olvasó', szerkeszto: 'szerkesztő', admin: 'admin' }[m.szerep]);
    document.querySelector('#tabs [data-tab=munkatarsak]').classList.toggle('hidden', !S.admin);
    $('#top').classList.remove('hidden'); app.classList.remove('hidden');
    route();
  } catch (e) { hiba(e, 'Belépés után'); }
}

function route() {
  const h = location.hash.replace(/^#/, '') || 'bongeszo';
  const [tab, arg] = h.split('/');
  S.tab = tab === 'cikk' ? 'bongeszo' : tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  window.scrollTo(0, 0);
  if (tab === 'cikk') return cikklap(Number(arg));
  if (tab === 'ellenorzendo') return ellenorzendoLap();
  if (tab === 'naplo') return naploLap();
  if (tab === 'statisztika') return statisztikaLap();
  if (tab === 'munkatarsak' && S.admin) return munkatarsLap();
  return bongeszo();
}

// ---------- böngésző ----------
function keresParams(k = S.k, oldal = k.oldal, limit = PAGE) {
  return {
    p_evek: k.evek.length ? k.evek : null, p_szoveg: k.szoveg || null, p_cim: k.cim || null,
    p_mezo: k.ertek ? (k.mezo || null) : null, p_ertek: k.ertek || null,
    p_megbiz: k.megbiz || null, p_allapot: k.allapot || null, p_limit: limit, p_offset: oldal * limit,
  };
}

function bongeszo() {
  const k = S.k;
  app.innerHTML = `
  <div class="card">
    <form id="kf">
      <div class="toolbar">
        <input type="search" id="k-szoveg" placeholder="Keresés a cikkszövegben (pl. nőtanács, &quot;családi pótlék&quot;, gyes -gyed)" value="${esc(k.szoveg)}">
        <input type="search" id="k-cim" placeholder="Cím vagy azonosító" value="${esc(k.cim)}" style="max-width:260px">
        <button class="btn primary" type="submit">Keresés</button>
        <button class="btn" type="button" id="k-torol">Szűrők törlése</button>
      </div>
      <div class="toolbar">
        <select id="k-mezo">${[['', 'bármely mezőben'], ...MEZOK.map(m => [m[0], m[1]])].map(([v, c]) => `<option value="${v}" ${k.mezo === v ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input type="search" id="k-ertek" list="k-ertek-lista" placeholder="…érték (részlet is lehet), pl. Tóth Gyuláné, MNOT" value="${esc(k.ertek)}" style="flex:1;min-width:200px">
        <datalist id="k-ertek-lista"></datalist>
        <select id="k-megbiz">${[['', 'minden kinyerés'], ['biztos', 'biztos kinyerés'], ['bizonytalan', 'bizonytalan kinyerés'], ['atvett_txt', 'átvett szöveg'], ['nincs_oldal_pdf', 'nincs oldal-PDF'], ['nem_talalhato', 'nem található']].map(([v, c]) => `<option value="${v}" ${k.megbiz === v ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select id="k-allapot">${[['', 'minden állapot'], ['nyitott', 'van nyitott ellenőrzendő'], ['javitott', 'javított']].map(([v, c]) => `<option value="${v}" ${k.allapot === v ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="toolbar small">
        <span class="muted">Évfolyam:</span>
        ${EVEK.map(e => `<label class="nowrap"><input type="checkbox" class="k-ev" value="${e}" ${k.evek.includes(e) ? 'checked' : ''}> ${e}</label>`).join(' ')}
      </div>
    </form>
  </div>
  <div style="margin-top:12px" id="talalatok"><div class="empty">Keresés…</div></div>`;
  const tolt = () => {
    k.szoveg = $('#k-szoveg').value.trim(); k.cim = $('#k-cim').value.trim();
    k.mezo = $('#k-mezo').value; k.ertek = $('#k-ertek').value.trim();
    k.megbiz = $('#k-megbiz').value; k.allapot = $('#k-allapot').value;
    k.evek = [...document.querySelectorAll('.k-ev:checked')].map(x => Number(x.value));
  };
  $('#kf').addEventListener('submit', e => { e.preventDefault(); tolt(); k.oldal = 0; listaz(); });
  $('#k-torol').addEventListener('click', () => { Object.assign(k, { evek: [], szoveg: '', cim: '', mezo: '', ertek: '', megbiz: '', allapot: '', oldal: 0 }); bongeszo(); });
  document.querySelectorAll('.k-ev, #k-megbiz, #k-allapot').forEach(el => el.addEventListener('change', () => { tolt(); k.oldal = 0; listaz(); }));
  $('#k-mezo').addEventListener('change', ertekLista);
  ertekLista();
  listaz();
}

async function ertekLista() {
  const m = $('#k-mezo')?.value;
  const dl = $('#k-ertek-lista');
  if (!dl) return;
  if (!m || !(MEZO[m].zart || m === 'rovat')) { dl.innerHTML = ''; return; }
  try {
    const { data } = await q(sb.rpc('sf_mezo_ertekek', { p_mezo: m }));
    dl.innerHTML = data.map(r => `<option value="${esc(r.ertek)}">${esc(r.ertek)} (${r.db})</option>`).join('');
  } catch (e) { /* a lista csak kényelmi funkció */ }
}

// Oszlopok: a katalógus és minden kódolt mező; a választás a böngészőben megmarad
const OSZLOPOK = [
  ['k:azonosito', 'Azonosító'], ['k:datum', 'Dátum'], ['k:oldal', 'Oldal'], ['k:cim', 'Cím'], ['k:szerzo', 'Szerző'],
  ['k:cim_a_lapon', 'Cím a lapon'], ['k:alcim', 'Alcím'], ['k:szerzo_a_lapon', 'Szerző (a lapon)'],
  ...MEZOK.map(m => ['e:' + m[0], m[1]]),
  ['k:illusztracio', 'Illusztráció'], ['k:kutatoi_megjegyzes', 'Kutatói megjegyzés'], ['k:eleres', 'Elérés'],
  ['k:megbizhatosag', 'Kinyerés megbízhatósága'], ['k:kinyeresi_megjegyzes', 'Kinyerési megjegyzés'],
  ['k:karakterszam', 'Karakterszám'], ['k:szoszam', 'Szószám'], ['k:forras_pdf', 'Forrás PDF'],
];
const ROVID_OSZLOPOK = ['k:datum', 'k:oldal', 'k:cim', 'k:szerzo', 'e:mufaj', 'e:rovat', 'e:szemely', 'e:helyszin', 'e:szervezet', 'e:osszefoglalas'];
function oszlopok() {
  try { const v = JSON.parse(localStorage.getItem('sf_oszlopok2') || 'null'); if (Array.isArray(v) && v.length) return v.filter(k => OSZLOPOK.some(o => o[0] === k)); } catch (e) { /* nincs tárolás */ }
  return OSZLOPOK.map(o => o[0]);   // alapállapot: minden oszlop látszik
}
function oszlopMent(v) { try { localStorage.setItem('sf_oszlopok2', JSON.stringify(v)); } catch (e) { /* nincs tárolás */ } }
const KAT_MEZOK = 'cikk_id,azonosito,datum,oldal,cim,szerzo,cim_a_lapon,alcim,szerzo_a_lapon,illusztracio,kutatoi_megjegyzes,eleres,megbizhatosag,kinyeresi_megjegyzes,karakterszam,szoszam,forras_pdf';
async function sorAdatok(ids) {
  const kat = {}, ert = {};
  for (let i = 0; i < ids.length; i += 200) {
    const resz = ids.slice(i, i + 200);
    const { data: c } = await q(sb.from('sf_cikk').select(KAT_MEZOK).in('cikk_id', resz));
    const e = [];   // a szerver legfeljebb 1000 sort ad egyszerre, ezért lapozunk
    for (let o = 0; ; o += 1000) {
      const { data } = await q(sb.from('sf_ertek').select('cikk_id,mezo,ertek,sorszam').in('cikk_id', resz).eq('allapot', 'aktiv')
        .order('cikk_id').order('mezo').order('sorszam').order('ertek_id').range(o, o + 999));
      e.push(...data);
      if (data.length < 1000) break;
    }
    for (const r of c) kat[r.cikk_id] = r;
    for (const r of e) ((ert[r.cikk_id] ||= {})[r.mezo] ||= []).push(r.ertek);
  }
  return { kat, ert };
}
const cellaErtek = (kulcs, kat, ert) => kulcs.startsWith('k:') ? kat?.[kulcs.slice(2)] : (ert?.[kulcs.slice(2)] || []).join(', ');

async function listaz() {
  const box = $('#talalatok');
  if (!box) return;
  box.innerHTML = '<div class="empty">Keresés…</div>';
  try {
    const { data } = await q(sb.rpc('sf_keres', keresParams()));
    S.lista = data.map(r => r.cikk_id);
    S.osszes = data.length ? Number(data[0].osszes) : 0;
    const k = S.k, tol = k.oldal * PAGE;
    if (!data.length) { box.innerHTML = '<div class="card empty">Nincs találat.</div>'; return; }
    const { kat, ert } = await sorAdatok(S.lista);
    const osz = oszlopok();
    const kiem = t => esc(t).replace(/«/g, '<mark>').replace(/»/g, '</mark>');
    const hosszu = new Set(['e:osszefoglalas', 'e:kulcsidezet', 'e:kodolasi_megjegyzes', 'k:kinyeresi_megjegyzes', 'k:kutatoi_megjegyzes']);
    const cella = (kulcs, r) => {
      let v = cellaErtek(kulcs, kat[r.cikk_id], ert[r.cikk_id]);
      if (kulcs === 'k:eleres' && v) return `<a href="${esc(v)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Arcanum</a>`;
      if (kulcs === 'k:cim') return `<b>${dash(v)}</b>`;
      return hosszu.has(kulcs) && v ? `<div class="clamp">${esc(v)}</div>` : dash(v);
    };
    box.innerHTML = `
      <div class="toolbar"><span class="muted">${S.osszes.toLocaleString('hu-HU')} cikk · ${tol + 1}–${tol + data.length}.</span>
        <span style="flex:1"></span>
        <details class="oszlopvalaszto"><summary class="btn small">Oszlopok (${osz.length}/${OSZLOPOK.length})</summary>
          <div class="card osz-panel">
            <div class="toolbar"><button class="btn small" data-osz="mind">mind</button><button class="btn small" data-osz="alap">rövid nézet</button><button class="btn small" data-osz="ertelmezo">+ értelmező oszlopok</button></div>
            <div class="osz-racs">${OSZLOPOK.map(([kk, c]) => `<label><input type="checkbox" value="${kk}" ${osz.includes(kk) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>
          </div></details>
        <button class="btn small" id="export">Találatok letöltése (CSV, minden oszlop)</button></div>
      <div class="tbl-wrap"><table class="lista">
        <thead><tr>${osz.map(kk => `<th>${esc(OSZLOPOK.find(o => o[0] === kk)[1])}</th>`).join('')}<th></th></tr></thead>
        <tbody>${data.map(r => `
          <tr class="click" data-id="${r.cikk_id}">${osz.map(kk => `<td class="${kk === 'k:datum' || kk === 'k:azonosito' ? 'nowrap' : ''}">${cella(kk, r)}${kk === 'e:osszefoglalas' && r.talalat ? `<div class="talalat">…${kiem(r.talalat)}…</div>` : ''}</td>`).join('')}
            <td class="nowrap">${r.javitott ? '<span class="badge f-javitas">javított</span> ' : ''}${r.nyitott_ellenorzes > 0 ? `<span class="badge b-warn">${r.nyitott_ellenorzes} ellenőrzendő</span>` : ''}
              ${r.megbizhatosag && r.megbizhatosag !== 'biztos' ? `<span class="badge b-gray">${esc(r.megbizhatosag)}</span>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>
      ${!osz.includes('e:osszefoglalas') && data.some(r => r.talalat) ? '<div class="muted small">A szövegtalálatok részletei az Összefoglalás oszlopban látszanak.</div>' : ''}
      <div class="pager">
        <button class="btn" id="elozo" ${k.oldal === 0 ? 'disabled' : ''}>‹ Előző</button>
        <span class="muted">${k.oldal + 1}. / ${Math.ceil(S.osszes / PAGE)} oldal</span>
        <button class="btn" id="kov" ${tol + data.length >= S.osszes ? 'disabled' : ''}>Következő ›</button>
      </div>`;
    box.querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => ugras('#cikk/' + tr.dataset.id)));
    $('#elozo').addEventListener('click', () => { k.oldal--; listaz(); window.scrollTo(0, 0); });
    $('#kov').addEventListener('click', () => { k.oldal++; listaz(); window.scrollTo(0, 0); });
    $('#export').addEventListener('click', exportCsv);
    const panel = box.querySelector('.oszlopvalaszto');
    panel.querySelectorAll('.osz-racs input').forEach(cb => cb.addEventListener('change', () => {
      oszlopMent([...panel.querySelectorAll('.osz-racs input:checked')].map(x => x.value)); listaz();
    }));
    panel.querySelectorAll('[data-osz]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.osz;
      oszlopMent(m === 'mind' ? OSZLOPOK.map(o => o[0]) : m === 'alap' ? ROVID_OSZLOPOK
        : [...new Set([...oszlopok(), ...['munka', 'tarsadalombiztositas', 'eletmod', 'szarmazas', 'generaciok', 'szerepek', 'noszervezetek'].map(x => 'e:' + x)])]);
      listaz();
    }));
  } catch (e) { box.innerHTML = `<div class="msg err">Hiba a keresésben: ${esc(e.message)}</div>`; }
}

async function exportCsv() {
  const btn = $('#export'); btn.disabled = true; btn.textContent = 'Letöltés…';
  try {
    const sorok = [];
    for (let o = 0; o * 500 < S.osszes; o++) {
      const { data } = await q(sb.rpc('sf_keres', keresParams(S.k, o, 500)));
      sorok.push(...data);
    }
    const { kat, ert } = await sorAdatok(sorok.map(r => r.cikk_id));
    const cella = v => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [OSZLOPOK.map(o => o[1]), ...sorok.map(r => OSZLOPOK.map(([kk]) => cellaErtek(kk, kat[r.cikk_id], ert[r.cikk_id])))]
      .map(s => s.map(cella).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `szabadfold_talalatok_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  } catch (e) { hiba(e, 'Letöltés'); }
  btn.disabled = false; btn.textContent = 'Találatok letöltése (CSV, minden oszlop)';
}

// ---------- cikklap ----------
async function cikklap(id) {
  app.innerHTML = '<div class="empty">Betöltés…</div>';
  try {
    const [{ data: c }, { data: ert }, { data: sz }, { data: ell }] = await Promise.all([
      q(sb.from('sf_cikk').select('*').eq('cikk_id', id).maybeSingle()),
      q(sb.from('sf_ertek').select('*').eq('cikk_id', id).order('sorszam').order('ertek_id')),
      q(sb.from('sf_szoveg').select('tiszta,nyers').eq('cikk_id', id).maybeSingle()),
      q(sb.from('sf_ellenorzendo').select('*').eq('cikk_id', id).order('rogzitve')),
    ]);
    if (!c) { app.innerHTML = '<div class="card empty">Nincs ilyen cikk.</div>'; return; }
    rajzolCikk(c, ert || [], sz || {}, ell || []);
  } catch (e) { app.innerHTML = `<div class="msg err">Hiba: ${esc(e.message)}</div>`; }
}

function rajzolCikk(c, ert, sz, ell) {
  const aktiv = m => ert.filter(e => e.mezo === m && e.allapot === 'aktiv');
  const regi = m => ert.filter(e => e.mezo === m && e.allapot === 'felulirt');
  const pos = S.lista.indexOf(c.cikk_id);
  const elozo = pos > 0 ? S.lista[pos - 1] : null, kov = pos >= 0 && pos < S.lista.length - 1 ? S.lista[pos + 1] : null;
  let nezet = 'tiszta';

  const mezoHtml = m => {
    const a = aktiv(m), r = regi(m), d = MEZO[m];
    const ertekek = a.length
      ? a.map(e => `<span class="ertek ${d.hosszu ? 'hosszu' : ''}">${esc(e.ertek)} ${forrasBadge(e.forras)}</span>`).join('')
      : '<span class="muted">—</span>';
    const elozmeny = r.length ? `<details class="regi"><summary>Korábbi értékek (${r.length})</summary>${r.map(e =>
      `<div><s>${esc(e.ertek)}</s> ${forrasBadge(e.forras)} <span class="muted">· felülírta ${esc(e.felulirta || '')}, ${fmtIdo(e.felulirva)}</span></div>`).join('')}</details>` : '';
    const utolso = a.find(e => e.forras === 'javitas' && e.megjegyzes);
    return `<div class="mezo" data-mezo="${m}">
      <div class="mezo-fej"><span class="mezo-nev">${esc(d.cimke)}</span>
        ${S.szerk ? `<span>${r.length ? `<button class="btn small link" data-vissza="${m}" title="Az utolsó javítás visszavonása">visszavonás</button>` : ''}<button class="btn small" data-szerk="${m}">javítás</button></span>` : ''}</div>
      <div class="ertekek">${ertekek}</div>
      ${utolso ? `<div class="regi">Javítási megjegyzés: ${esc(utolso.megjegyzes)}</div>` : ''}
      ${elozmeny}<div class="szerk-hely"></div></div>`;
  };

  app.innerHTML = `
  <div class="cikkfej">
    <div>
      <div class="muted small"><a href="#bongeszo">‹ vissza a találatokhoz</a> · ${esc(c.azonosito)} · ${dash(c.datum)}, ${esc(c.oldal || '?')}. oldal</div>
      <h2>${dash(c.cim)}</h2>
      ${c.szerzo ? `<div class="muted">${esc(c.szerzo)}</div>` : ''}
    </div>
    <div class="toolbar" style="margin:0">
      <button class="btn" id="c-elozo" ${elozo ? '' : 'disabled'}>‹ Előző</button>
      <button class="btn" id="c-kov" ${kov ? '' : 'disabled'}>Következő ›</button>
    </div>
  </div>
  <div class="cikk">
    <div>
      <div class="card szakasz">
        <div class="mezo-fej"><h3>Ellenőrzendő</h3><button class="btn small" id="ell-uj">+ új tétel</button></div>
        <div id="ell-lista">${ell.length ? ell.map(l => `
          <div class="mezo"><span class="badge ${l.allapot === 'nyitott' ? 'b-warn' : 'b-ok'}">${l.allapot === 'nyitott' ? 'nyitott' : 'lezárt'}</span>
            <span class="badge b-gray">${esc(l.tipus)}</span> ${esc(l.leiras)}
            ${l.allapot === 'lezart' ? `<div class="regi">Lezárta ${esc(l.lezarta)}, ${fmtIdo(l.lezarva)}${l.valasz ? ': ' + esc(l.valasz) : ''}</div>` :
              S.szerk ? `<div><button class="btn small" data-lezar="${l.ellenorzes_id}">lezárás</button></div>` : ''}</div>`).join('') : '<span class="muted small">Nincs ellenőrzendő tétel.</span>'}</div>
      </div>
      ${CSOPORTOK.map(([cim, mk]) => `<div class="card szakasz"><h3>${esc(cim)}</h3>${mk.map(mezoHtml).join('')}</div>`).join('')}
      <div class="card szakasz">
        <div class="mezo-fej"><h3>Katalógus</h3>${S.szerk ? '<button class="btn small" id="kat-szerk">javítás</button>' : ''}</div>
        <div class="kv" id="kat">${KATALOGUS.map(([k, cim]) => `<div>${esc(cim)}</div><div>${k === 'eleres' && c[k] ? `<a href="${esc(c[k])}" target="_blank" rel="noopener">Arcanum</a>` : dash(c[k])}</div>`).join('')}</div>
      </div>
      <div class="jelmagyarazat">Forrás: ${Object.keys(FORRAS).filter(f => f !== 'kutato_1975').map(forrasBadge).join(' ')}</div>
    </div>
    <div class="sticky">
      <div class="card">
        <div class="mezo-fej" style="margin-bottom:8px">
          <h3>Cikkszöveg</h3>
          <span class="toolbar" style="margin:0">
            <label class="small"><input type="checkbox" id="kiemel" checked> kiemelés</label>
            <button class="btn small" id="sz-valt">nyers OCR</button>
            ${S.szerk ? '<button class="btn small" id="sz-szerk">szöveg javítása</button>' : ''}
          </span>
        </div>
        <div class="szoveg" id="szoveg"></div>
      </div>
    </div>
  </div>`;

  // --- szöveg kiemeléssel ---
  const szovegRajz = () => {
    const t = (nezet === 'tiszta' ? sz.tiszta : sz.nyers) || '';
    if (!t) { $('#szoveg').innerHTML = '<span class="muted">Ehhez a cikkhez nincs szöveg.</span>'; return; }
    let h = esc(t);
    if ($('#kiemel').checked) {
      const ide = aktiv('kulcsidezet').map(e => e.ertek.replace(/^[„"]+|[”"]+$/g, '').trim()).filter(x => x.length > 8);
      for (const i of ide) { const x = esc(i); if (h.includes(x)) h = h.split(x).join(`<mark class="idezet">${x}</mark>`); }
      const nevek = ['szemely', 'helyszin', 'szervezet'].flatMap(m => aktiv(m).map(e => e.ertek.replace(/\([^)]*\)/g, '').trim()))
        .filter(x => x.length > 3).sort((a, b) => b.length - a.length);
      if (nevek.length) {
        const re = new RegExp('(' + nevek.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
        h = h.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : p.replace(re, '<mark>$1</mark>')).join('');
      }
    }
    $('#szoveg').innerHTML = h;
    $('#sz-valt').textContent = nezet === 'tiszta' ? 'nyers OCR' : 'tisztított szöveg';
  };
  szovegRajz();
  $('#kiemel').addEventListener('change', szovegRajz);
  $('#sz-valt').addEventListener('click', () => { nezet = nezet === 'tiszta' ? 'nyers' : 'tiszta'; szovegRajz(); });
  $('#c-elozo').addEventListener('click', () => elozo && ugras('#cikk/' + elozo));
  $('#c-kov').addEventListener('click', () => kov && ugras('#cikk/' + kov));
  const ujra = () => cikklap(c.cikk_id);

  // --- mezőjavítás ---
  app.querySelectorAll('[data-szerk]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.szerk, d = MEZO[m], hely = b.closest('.mezo').querySelector('.szerk-hely');
    if (hely.innerHTML) { hely.innerHTML = ''; return; }
    const most = aktiv(m).map(e => e.ertek);
    const szot = S.szotar[m] || [];
    const bemenet = d.zart
      ? `<div class="zart">${szot.map(s => `<label title="${esc(s.leiras || '')}"><input type="checkbox" value="${esc(s.ertek)}" ${most.includes(s.ertek) ? 'checked' : ''}> ${esc(s.ertek)}</label>`).join('')}</div>`
      : d.hosszu
        ? `<textarea class="sz-be" rows="4">${esc(most.join('\n'))}</textarea>`
        : `<textarea class="sz-be" rows="${Math.max(3, most.length + 1)}" placeholder="soronként egy érték">${esc(most.join('\n'))}</textarea>
           ${m === 'rovat' ? `<datalist id="rovat-dl">${szot.map(s => `<option value="${esc(s.ertek)}">`).join('')}</datalist><input list="rovat-dl" class="rovat-valaszt" placeholder="választás az ismert rovatcímek közül…">` : ''}
           <div class="muted small">Soronként egy érték.${m === 'rovat' ? ' Új rovatcím is beírható; a lapon álló alakban add meg.' : ''}</div>`;
    hely.innerHTML = `<div class="szerk">${bemenet}
      <input class="sz-mj" placeholder="megjegyzés a javításhoz (nem kötelező)">
      <div class="toolbar" style="margin:0"><button class="btn primary sz-ment">Mentés</button><button class="btn sz-megse">Mégse</button></div><div class="sz-msg"></div></div>`;
    const rv = hely.querySelector('.rovat-valaszt');
    if (rv) rv.addEventListener('change', () => { hely.querySelector('.sz-be').value = rv.value; });
    hely.querySelector('.sz-megse').addEventListener('click', () => { hely.innerHTML = ''; });
    hely.querySelector('.sz-ment').addEventListener('click', async () => {
      const uj = d.zart ? [...hely.querySelectorAll('.zart input:checked')].map(x => x.value)
        : d.hosszu ? [hely.querySelector('.sz-be').value.trim()].filter(Boolean)
          : hely.querySelector('.sz-be').value.split('\n').map(x => x.trim()).filter(Boolean);
      try {
        await q(sb.rpc('ertek_javit', { p_cikk_id: c.cikk_id, p_mezo: m, p_ertekek: uj, p_megjegyzes: hely.querySelector('.sz-mj').value || null }));
        ujra();
      } catch (e) { msg(hely.querySelector('.sz-msg'), e.message, 'err'); }
    });
  }));
  app.querySelectorAll('[data-vissza]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Visszaállítod a mező előző állapotát? (Ez is naplózódik, és újra visszavonható.)')) return;
    try { await q(sb.rpc('ertek_visszavon', { p_cikk_id: c.cikk_id, p_mezo: b.dataset.vissza })); ujra(); } catch (e) { hiba(e, 'Visszavonás'); }
  }));

  // --- katalógus javítása ---
  $('#kat-szerk')?.addEventListener('click', () => {
    const kat = $('#kat');
    kat.innerHTML = KATALOGUS.map(([k, cim, szerk]) => `<div>${esc(cim)}</div><div>${szerk
      ? (k === 'kutatoi_megjegyzes' ? `<textarea data-k="${k}">${esc(c[k] || '')}</textarea>` : `<input data-k="${k}" ${k === 'datum' ? 'type="date"' : ''} value="${esc(c[k] || '')}" style="width:100%">`)
      : dash(c[k])}</div>`).join('') + `<div></div><div class="toolbar"><button class="btn primary" id="kat-ment">Mentés</button><button class="btn" id="kat-megse">Mégse</button></div><div></div><div id="kat-msg"></div>`;
    $('#kat-megse').addEventListener('click', ujra);
    $('#kat-ment').addEventListener('click', async () => {
      try {
        for (const el of kat.querySelectorAll('[data-k]')) {
          const k = el.dataset.k, v = el.value.trim();
          if ((c[k] || '') !== v) await q(sb.rpc('cikk_javit', { p_cikk_id: c.cikk_id, p_mezo: k, p_ertek: v }));
        }
        ujra();
      } catch (e) { msg($('#kat-msg'), e.message, 'err'); }
    });
  });

  // --- szöveg javítása ---
  $('#sz-szerk')?.addEventListener('click', () => {
    const box = $('#szoveg');
    box.innerHTML = `<textarea id="sz-t" style="min-height:60vh;font-family:inherit">${esc(sz.tiszta || '')}</textarea>
      <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="sz-t-ment">Szöveg mentése</button><button class="btn" id="sz-t-megse">Mégse</button></div>
      <div class="muted small">A javított szöveg felülírja a tisztított változatot; a korábbi szöveg a naplóban megmarad. A nyers OCR nem változik.</div><div id="sz-t-msg"></div>`;
    $('#sz-t-megse').addEventListener('click', ujra);
    $('#sz-t-ment').addEventListener('click', async () => {
      try { await q(sb.rpc('szoveg_javit', { p_cikk_id: c.cikk_id, p_tiszta: $('#sz-t').value })); ujra(); }
      catch (e) { msg($('#sz-t-msg'), e.message, 'err'); }
    });
  });

  // --- ellenőrzendők ---
  $('#ell-uj').addEventListener('click', async () => {
    const leiras = prompt('Mit kell ellenőrizni ennél a cikknél?');
    if (!leiras) return;
    try { await q(sb.rpc('ellenorzendo_uj', { p_cikk_id: c.cikk_id, p_leiras: leiras })); ujra(); } catch (e) { hiba(e, 'Új tétel'); }
  });
  app.querySelectorAll('[data-lezar]').forEach(b => b.addEventListener('click', async () => {
    const valasz = prompt('Lezárás – mi lett a döntés? (nem kötelező)', '');
    if (valasz === null) return;
    try { await q(sb.rpc('ellenorzendo_lezar', { p_id: Number(b.dataset.lezar), p_valasz: valasz })); ujra(); } catch (e) { hiba(e, 'Lezárás'); }
  }));
}

// ---------- leíró statisztika ----------
const hu = n => Number(n || 0).toLocaleString('hu-HU');
const szaz = (a, b) => b ? Math.round(100 * a / b) : 0;
// hőtérkép-cella: egyetlen színárnyalat, a telítettség az arányt kódolja; a szám mindig kiírva
const hoCella = (n, osszes, cim) => {
  const p = szaz(n, osszes);
  return `<td class="ho" style="background:color-mix(in srgb, var(--accent) ${Math.round(p * 0.55)}%, transparent)" title="${esc(cim)}: ${hu(n)} / ${hu(osszes)} (${p}%)">${n ? p + '%' : '<span class="muted">–</span>'}</td>`;
};
function savLista(lista, mezo, max) {
  if (!lista || !lista.length) return '<div class="muted small">Nincs adat.</div>';
  const m = max || Math.max(...lista.map(x => x.n));
  return `<div class="savlista">${lista.map(x => `
    <button class="sav-sor" data-mezo="${esc(mezo)}" data-ertek="${esc(x.ertek)}" title="${esc(x.ertek)}: ${hu(x.n)} cikk – kattints a cikkek listájáért">
      <span class="sav-nev">${esc(x.ertek)}</span><span class="sav"><span style="width:${Math.max(1, 100 * x.n / m)}%"></span></span><span class="sav-n">${hu(x.n)}</span>
    </button>`).join('')}</div>`;
}

async function statisztikaLap() {
  app.innerHTML = '<div class="empty">Számolás…</div>';
  try {
    const { data: d } = await q(sb.rpc('sf_statisztika'));
    const o = d.osszes, evek = d.evek || [], top = d.top || {};
    const maxCikk = Math.max(...evek.map(e => e.cikk));
    const kitMezok = [['mufaj', 'Műfaj'], ['rovat', 'Rovat'], ['szemely', 'Személy'], ['helyszin', 'Helyszín'], ['szervezet', 'Szervezet'],
      ['osszefoglalas', 'Összefogl.'], ['kulcsidezet', 'Kulcsidézet'], ['alairas_telepules', 'Aláír. tel.'],
      ['munka', 'MUNKA'], ['tarsadalombiztositas', 'TB'], ['eletmod', 'ÉLETMÓD'], ['szarmazas', 'SZÁRM.'], ['generaciok', 'GENER.'], ['szerepek', 'SZEREPEK'], ['noszervezetek', 'NŐSZERV.']];
    const mufajok = (top.mufaj || []).map(x => x.ertek);
    const mev = {};
    for (const r of d.mufaj_ev || []) (mev[r.ev] ||= {})[r.mufaj] = r.n;
    const csempe = (cim, ertek, al) => `<div class="csempe"><div class="muted small">${esc(cim)}</div><div class="csempe-szam">${ertek}</div>${al ? `<div class="muted small">${al}</div>` : ''}</div>`;
    const W = 860, H = 220, PAD = 34, bw = (W - PAD) / evek.length;
    const oszlop = `<svg viewBox="0 0 ${W} ${H + 40}" class="oszlopdiagram" role="img" aria-label="Cikkek száma évfolyamonként">
      ${[0, 0.5, 1].map(f => `<line x1="${PAD}" x2="${W}" y1="${H - f * (H - 10)}" y2="${H - f * (H - 10)}" class="racs"/><text x="${PAD - 6}" y="${H - f * (H - 10) + 4}" class="tengely" text-anchor="end">${hu(Math.round(f * maxCikk))}</text>`).join('')}
      ${evek.map((e, i) => {
        const h = (H - 10) * e.cikk / maxCikk, x = PAD + i * bw + 2;
        return `<g class="oszlop"><title>${e.ev}: ${hu(e.cikk)} cikk, ebből ${hu(e.szoveggel)} szöveggel</title>
          <rect x="${x - 2}" y="0" width="${bw}" height="${H}" fill="transparent"/>
          <path d="M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 12} q4,0 4,4 v${h - 4} z" class="oszlop-test"/>
          <text x="${x + (bw - 4) / 2}" y="${H + 16}" class="tengely" text-anchor="middle">${String(e.ev).slice(2)}</text></g>`;
      }).join('')}
    </svg>`;
    app.innerHTML = `
      <div class="csempek">
        ${csempe('Cikkek', hu(o.cikk), `${o.evfolyam} évfolyam`)}
        ${csempe('Szöveggel', hu(o.szoveggel), szaz(o.szoveggel, o.cikk) + '%')}
        ${csempe('Szavak', hu(o.szo), hu(o.karakter) + ' karakter')}
        ${csempe('Kódolt értékek', hu(o.ertek), 'aktív')}
        ${csempe('Javítások', hu(o.javitas), hu(o.javitott_cikk) + ' cikkben')}
        ${csempe('Ellenőrzendő', hu(o.nyitott), hu(o.lezart) + ' lezárva')}
      </div>
      <div class="card szakasz"><h3>Cikkek évfolyamonként</h3>${oszlop}
        <div class="muted small">A korpuszban nem szereplő évek (1959, 1975, 1977–1980) kimaradnak; az 1958-as évfolyam csak az első félév. Az oszlopra mutatva a pontos szám látszik.</div></div>
      <div class="card szakasz"><h3>Kitöltöttség évfolyamonként</h3>
        <div class="muted small" style="margin-bottom:6px">A cikkek hány százalékában van legalább egy érték az adott mezőben. Minél sötétebb a cella, annál nagyobb az arány.</div>
        <div class="tbl-wrap"><table class="ho-tabla"><thead><tr><th>Év</th><th>Cikk</th><th>Szöveg</th><th>Átl. szó</th>${kitMezok.map(([, c]) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${evek.map(e => `<tr><td><b>${e.ev}</b></td><td>${hu(e.cikk)}</td>${hoCella(e.szoveggel, e.cikk, 'Szöveggel')}<td>${hu(e.szo_atlag)}</td>
          ${kitMezok.map(([m, c]) => hoCella((e.kitoltes || {})[m] || 0, e.cikk, c)).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="card szakasz"><h3>Műfajok évfolyamonként</h3>
        <div class="muted small" style="margin-bottom:6px">A cikkek száma műfajonként; a cella árnyalata az évfolyamon belüli arányt mutatja.</div>
        <div class="tbl-wrap"><table class="ho-tabla"><thead><tr><th>Év</th>${mufajok.map(m => `<th>${esc(m)}</th>`).join('')}</tr></thead>
        <tbody>${evek.map(e => `<tr><td><b>${e.ev}</b></td>${mufajok.map(m => {
          const n = (mev[e.ev] || {})[m] || 0, p = szaz(n, e.cikk);
          return `<td class="ho" style="background:color-mix(in srgb, var(--accent) ${Math.round(p * 1.1)}%, transparent)" title="${e.ev}, ${esc(m)}: ${hu(n)} cikk (${p}%)">${n ? hu(n) : '<span class="muted">–</span>'}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="stat-racs">
        ${[['rovat', 'Leggyakoribb rovatok'], ['szemely', 'Leggyakrabban említett személyek'], ['helyszin', 'Leggyakoribb helyszínek'],
           ['szervezet', 'Leggyakoribb szervezetek'], ['alairas_telepules', 'Levélírók települései (aláírásból)'], ['mufaj', 'Műfajok']]
          .map(([m, c]) => `<div class="card"><h3>${esc(c)}</h3><div class="muted small" style="margin-bottom:6px">cikkek száma · első 30</div>${savLista(top[m], m)}</div>`).join('')}
      </div>
      <div class="card szakasz" style="margin-top:14px"><h3>Értelmező oszlopok (jelenleg csak az 1958-as kézi kódolás)</h3>
        <div class="stat-racs">${['munka', 'tarsadalombiztositas', 'eletmod', 'szarmazas', 'generaciok', 'szerepek', 'noszervezetek']
          .map(m => `<div><div class="mezo-nev" style="margin-bottom:4px">${esc(MEZO[m].cimke)}</div>${savLista(top[m], m)}</div>`).join('')}</div></div>
      <div class="stat-racs" style="margin-top:14px">
        <div class="card"><h3>Kódolt értékek forrás szerint</h3>${savLista(Object.entries(d.forras || {}).map(([k, n]) => ({ ertek: FORRAS[k] || k, n })).sort((a, b) => b.n - a.n), '')}</div>
        <div class="card"><h3>A szövegkinyerés megbízhatósága</h3>${savLista(Object.entries(d.megbiz || {}).map(([k, n]) => ({ ertek: k, n })).sort((a, b) => b.n - a.n), '')}</div>
      </div>
      <div class="muted small" style="margin-top:10px">A számok az aktuális adatbázisból készülnek, a javításokkal együtt; minden megnyitáskor újraszámolódnak.</div>`;
    app.querySelectorAll('.sav-sor').forEach(b => b.addEventListener('click', () => {
      if (!b.dataset.mezo) return;
      Object.assign(S.k, { evek: [], szoveg: '', cim: '', mezo: b.dataset.mezo, ertek: b.dataset.ertek, megbiz: '', allapot: '', oldal: 0 });
      ugras('#bongeszo');
    }));
  } catch (e) { app.innerHTML = `<div class="msg err">Hiba: ${esc(e.message)}</div>`; }
}

// ---------- ellenőrzendő tételek ----------
async function ellenorzendoLap(tipus = '', allapot = 'nyitott') {
  app.innerHTML = '<div class="empty">Betöltés…</div>';
  try {
    let lek = sb.from('sf_ellenorzendo').select('*, sf_cikk(azonosito,cim,datum)').order('rogzitve', { ascending: false }).limit(500);
    if (allapot) lek = lek.eq('allapot', allapot);
    if (tipus) lek = lek.eq('tipus', tipus);
    const { data } = await q(lek);
    const { data: osszes } = await q(sb.from('sf_ellenorzendo').select('tipus').eq('allapot', 'nyitott'));
    const tip = {};
    for (const r of osszes) tip[r.tipus] = (tip[r.tipus] || 0) + 1;
    app.innerHTML = `
      <div class="toolbar">
        <select id="e-tipus"><option value="">minden típus (${osszes.length} nyitott)</option>${Object.entries(tip).map(([t, n]) => `<option value="${esc(t)}" ${t === tipus ? 'selected' : ''}>${esc(t)} (${n})</option>`).join('')}</select>
        <select id="e-allapot">${[['nyitott', 'nyitott'], ['lezart', 'lezárt'], ['', 'mind']].map(([v, c]) => `<option value="${v}" ${v === allapot ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      ${data.length ? `<div class="tbl-wrap"><table><thead><tr><th>Típus</th><th>Cikk</th><th>Leírás</th><th>Állapot</th></tr></thead><tbody>
        ${data.map(l => `<tr class="click" data-id="${l.cikk_id}"><td><span class="badge b-gray">${esc(l.tipus)}</span></td>
          <td><b>${dash(l.sf_cikk?.cim)}</b><div class="muted small">${esc(l.sf_cikk?.azonosito || '')} · ${dash(l.sf_cikk?.datum)}</div></td>
          <td>${esc(l.leiras)}${l.valasz ? `<div class="regi">Döntés: ${esc(l.valasz)}</div>` : ''}</td>
          <td class="nowrap">${l.allapot === 'nyitott' ? '<span class="badge b-warn">nyitott</span>' : `<span class="badge b-ok">lezárt</span><div class="muted small">${esc(l.lezarta || '')}</div>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty">Nincs ilyen tétel.</div>'}`;
    $('#e-tipus').addEventListener('change', e => ellenorzendoLap(e.target.value, $('#e-allapot').value));
    $('#e-allapot').addEventListener('change', e => ellenorzendoLap($('#e-tipus').value, e.target.value));
    app.querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => {
      S.lista = data.map(l => l.cikk_id).filter((v, i, a) => a.indexOf(v) === i);
      ugras('#cikk/' + tr.dataset.id);
    }));
  } catch (e) { app.innerHTML = `<div class="msg err">Hiba: ${esc(e.message)}</div>`; }
}

// ---------- napló ----------
async function naploLap(oldal = 0) {
  app.innerHTML = '<div class="empty">Betöltés…</div>';
  try {
    const { data } = await q(sb.from('sf_naplo').select('*').order('idopont', { ascending: false }).range(oldal * 100, oldal * 100 + 99));
    const leir = n => {
      const r = n.regi || {}, u = n.uj || {};
      if (n.tabla === 'sf_ertek') {
        if (n.muvelet === 'INSERT') return `új érték – ${esc(MEZO[u.mezo]?.cimke || u.mezo)}: <b>${esc(u.ertek)}</b>`;
        if (n.muvelet === 'UPDATE' && r.allapot !== u.allapot) return `${u.allapot === 'aktiv' ? 'visszaállítva' : 'felülírva'} – ${esc(MEZO[u.mezo]?.cimke || u.mezo)}: ${u.allapot === 'aktiv' ? '<b>' + esc(u.ertek) + '</b>' : '<s>' + esc(u.ertek) + '</s>'}`;
      }
      if (n.tabla === 'sf_cikk' && n.muvelet === 'UPDATE') {
        const v = Object.keys(u).filter(k => JSON.stringify(u[k]) !== JSON.stringify(r[k]));
        return 'katalógus: ' + v.map(k => `${esc(k)}: <s>${esc(r[k] ?? '')}</s> → <b>${esc(u[k] ?? '')}</b>`).join('; ');
      }
      if (n.tabla === 'sf_szoveg') return 'cikkszöveg javítva';
      if (n.tabla === 'sf_ellenorzendo') return n.muvelet === 'INSERT' ? `új ellenőrzendő: ${esc(u.leiras)}` : `ellenőrzendő lezárva${u.valasz ? ': ' + esc(u.valasz) : ''}`;
      if (n.tabla === 'sf_munkatarsak') return `munkatárs: ${esc(u.email || r.email)} (${esc(u.szerep || '')}${u.aktiv === false ? ', inaktív' : ''})`;
      if (n.tabla === 'belepesi_fiok') return `belépési fiók – ${esc(u.email)}: ${n.muvelet === 'LETREHOZAS' ? 'létrehozva' : 'új ideiglenes jelszó'}`;
      if (n.tabla === 'sf_szotar') return `értékkészlet: ${esc(u.mezo)} → ${esc(u.ertek)}`;
      return esc(n.tabla + ' ' + n.muvelet);
    };
    const cid = n => (n.uj || n.regi || {}).cikk_id;
    app.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Időpont</th><th>Ki</th><th>Mi történt</th><th>Cikk</th></tr></thead><tbody>
      ${data.map(n => `<tr><td class="nowrap">${fmtIdo(n.idopont)}</td><td>${esc(n.felhasznalo)}</td><td>${leir(n)}</td>
        <td>${cid(n) ? `<a href="#cikk/${cid(n)}">megnyitás</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Még nincs bejegyzés.</td></tr>'}
      </tbody></table></div>
      <div class="pager"><button class="btn" id="n-elozo" ${oldal ? '' : 'disabled'}>‹ Újabbak</button><button class="btn" id="n-kov" ${data.length < 100 ? 'disabled' : ''}>Régebbiek ›</button></div>`;
    $('#n-elozo').addEventListener('click', () => naploLap(oldal - 1));
    $('#n-kov').addEventListener('click', () => naploLap(oldal + 1));
  } catch (e) { app.innerHTML = `<div class="msg err">Hiba: ${esc(e.message)}</div>`; }
}

// ---------- munkatársak (admin) ----------
async function munkatarsLap() {
  app.innerHTML = '<div class="empty">Betöltés…</div>';
  try {
    const { data } = await q(sb.from('sf_munkatarsak').select('*').order('rogzitve'));
    const szerepSel = (v, id) => `<select ${id ? `id="${id}"` : 'class="m-szerep"'}>${[['olvaso', 'olvasó'], ['szerkeszto', 'szerkesztő'], ['admin', 'admin']].map(([k, c]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    app.innerHTML = `
      <div class="card szakasz">
        <h3>Új munkatárs</h3>
        <div class="toolbar"><input id="m-email" type="email" placeholder="e-mail-cím" style="min-width:240px"><input id="m-nev" placeholder="név">
          ${szerepSel('szerkeszto', 'm-szerep')}<button class="btn primary" id="m-felvesz">Felvétel</button></div>
        <div class="muted small">A Felvétel a belépési fiókot is létrehozza, és kiír egy ideiglenes jelszót. Ezt add át a kollégának; az első belépés után a fejléc „Jelszó” gombjával cserélje le. Elfelejtett jelszó esetén a listában az „Új jelszó” gomb ad újat.</div>
        <div id="m-msg"></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>E-mail</th><th>Név</th><th>Szerep</th><th>Aktív</th><th></th></tr></thead><tbody>
        ${data.map(m => `<tr data-email="${esc(m.email)}"><td>${esc(m.email)}</td><td><input class="m-nev" value="${esc(m.nev || '')}"></td>
          <td>${szerepSel(m.szerep)}</td><td><input type="checkbox" class="m-aktiv" ${m.aktiv ? 'checked' : ''}></td>
          <td class="nowrap"><button class="btn small m-ment">Mentés</button> <button class="btn small m-jelszo">Új jelszó</button></td></tr>`).join('')}
      </tbody></table></div>`;
    const jelszoKiad = async (email) => {
      const { data, error } = await sb.functions.invoke('munkatars-fiok', { body: { email } });
      if (error) {
        let szoveg = error.message;
        try { szoveg = (await error.context.json()).hiba || szoveg; } catch (e) { /* nincs részletes hiba */ }
        throw new Error(szoveg);
      }
      if (data.hiba) throw new Error(data.hiba);
      return data;
    };
    const jelszoMutat = d => {
      $('#m-msg').innerHTML = `<div class="msg ok">${d.uj_fiok ? 'Belépési fiók létrehozva' : 'Új ideiglenes jelszó beállítva'}: <b>${esc(d.email)}</b><br>
        Ideiglenes jelszó: <code id="m-jsz" style="font-size:1.05rem">${esc(d.jelszo)}</code> <button class="btn small" id="m-masol">másolás</button><br>
        <span class="small">Add át a kollégának (lehetőleg ne ugyanabban az e-mailben, mint a címet); az első belépés után a „Jelszó” gombbal cserélje le. Ez a jelszó később nem jeleníthető meg újra.</span></div>`;
      $('#m-masol').addEventListener('click', () => navigator.clipboard?.writeText(d.jelszo).then(() => { $('#m-masol').textContent = 'másolva ✓'; }));
    };
    $('#m-felvesz').addEventListener('click', async () => {
      try {
        const email = $('#m-email').value.trim().toLowerCase();
        await q(sb.rpc('munkatars_beallit', { p_email: email, p_nev: $('#m-nev').value || null, p_szerep: $('#m-szerep').value, p_aktiv: true }));
        const d = await jelszoKiad(email);
        await munkatarsLap();
        jelszoMutat(d);
      } catch (e) { msg($('#m-msg'), e.message, 'err'); }
    });
    app.querySelectorAll('.m-jelszo').forEach(b => b.addEventListener('click', async () => {
      const email = b.closest('tr').dataset.email;
      if (!confirm(`Új ideiglenes jelszót adsz neki: ${email}? A régi jelszava ezzel érvényét veszti.`)) return;
      try { jelszoMutat(await jelszoKiad(email)); window.scrollTo(0, 0); } catch (e) { msg($('#m-msg'), e.message, 'err'); }
    }));
    app.querySelectorAll('.m-ment').forEach(b => b.addEventListener('click', async () => {
      const tr = b.closest('tr');
      try {
        await q(sb.rpc('munkatars_beallit', { p_email: tr.dataset.email, p_nev: tr.querySelector('.m-nev').value || null,
          p_szerep: tr.querySelector('.m-szerep').value, p_aktiv: tr.querySelector('.m-aktiv').checked }));
        b.textContent = 'Mentve ✓';
      } catch (e) { hiba(e, 'Mentés'); }
    }));
  } catch (e) { app.innerHTML = `<div class="msg err">Hiba: ${esc(e.message)}</div>`; }
}

init();

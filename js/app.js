(function(){
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = msg => { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2400); };
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/* ---------- Routing ---------- */
let view = null;
function route(){
  const portal = location.hash.startsWith("#/onboarding");
  const next = portal ? "portal" : "landing";
  $("#landing").hidden = portal;
  $("#portal").hidden = !portal;
  if (next !== view){
    if (portal){ initPortal(); window.scrollTo(0,0); }
    else if (view === "portal"){ window.scrollTo(0,0); }
    view = next;
  }
}
window.addEventListener("hashchange", route);

/* ---------- Landing ---------- */
document.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", () => {
  $("#c_piano").value = b.dataset.plan;
  document.getElementById("contatti").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  setTimeout(()=>$("#c_nome").focus({preventScroll:true}), 500);
}));

$("#leadForm").addEventListener("submit", e => {
  e.preventDefault();
  let first = null;
  const checks = [
    ["#c_nome", v => v ? "" : "Inserisci nome e cognome."],
    ["#c_email", v => !v ? "Inserisci l'e-mail." : emailOk(v) ? "" : "Controlla l'indirizzo e-mail, ad esempio nome@dominio.ch."],
    ["#c_tel", v => v.replace(/\D/g,"").length >= 7 ? "" : "Inserisci un numero di telefono valido."],
    ["#c_loc", v => v ? "" : "Indica dove si trova l'alloggio."],
    ["#c_piano", v => v ? "" : "Scegli un piano, oppure \"Non lo so ancora\"."],
  ];
  checks.forEach(([sel, fn]) => {
    const el = $(sel), f = el.closest(".field"), msg = fn(el.value.trim()), er = f.querySelector(".err");
    f.classList.toggle("invalid", !!msg); er.hidden = !msg; er.textContent = msg;
    if (msg && !first) first = el;
  });
  const pv = $("#c_priv"), pf = pv.closest(".field"), per = pf.querySelector(".err");
  per.hidden = pv.checked; per.textContent = "Serve il tuo consenso per poterti ricontattare.";
  if (!pv.checked && !first) first = pv;
  if (first){ first.focus(); return; }
  $("#leadForm").hidden = true; $("#leadDone").hidden = false;
});

/* ---------- Hero slideshow ---------- */
(function(){
  const root = $("#slides"); if (!root) return;
  const slides = [...root.querySelectorAll(".slide")], msgs = [...root.querySelectorAll(".msg")];
  const DURATA = 7000;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let cur = 0, timer = null, hover = false;
  function show(i){
    cur = (i + slides.length) % slides.length;
    slides.forEach((s,k) => s.classList.toggle("is-active", k === cur));
    msgs.forEach((m,k) => { m.classList.toggle("is-active", k === cur); m.setAttribute("aria-hidden", k === cur ? "false" : "true"); });
  }
  function stop(){ clearInterval(timer); timer = null; }
  function play(){ stop(); if (!hover && !document.hidden) timer = setInterval(() => show(cur + 1), DURATA); }
  root.addEventListener("mouseenter", () => { hover = true; stop(); });
  root.addEventListener("mouseleave", () => { hover = false; play(); });
  document.addEventListener("visibilitychange", play);
  play();
})();

/* ---------- Earnings calculator ----------
   VALORI DI ESEMPIO: sostituirli con dati reali di mercato.
   prezzoNotte: prezzo medio per notte in CHF, per numero di camere (0 = monolocale)
   zone: moltiplicatore per zona; "comuni" elenca i comuni (in minuscolo) che appartengono alla zona
   nottiOccupate: notti prenotate all'anno [minimo, massimo] */
const STIMA = {
  prezzoNotte: {0:95, 1:130, 2:175, 3:230, 4:300},
  zone: {
    locarno:    {nome:"Locarno e Ascona", fattore:1.15, comuni:["locarno","ascona","muralto","minusio","losone","brissago","ronco sopra ascona","orselina","tenero-contra","gordola","terre di pedemonte"]},
    lugano:     {nome:"Lugano e dintorni", fattore:1.10, comuni:["lugano","paradiso","melide","morcote","bissone","caslano","collina d'oro","sorengo","massagno","porza","savosa","vico morcote"]},
    valli:      {nome:"Valli del Ticino", fattore:0.95, comuni:["maggia","cevio","lavizzara","avegno gordevio","verzasca","onsernone","centovalli","bosco/gurin","campo (vallemaggia)","linescio","cerentino"]},
    bellinzona: {nome:"Bellinzona e Riviera", fattore:0.85, comuni:["bellinzona","arbedo-castione","riviera","lumino","sant'antonino","cadenazzo"]},
    ticino:     {nome:"Altra località in Ticino", fattore:0.95, comuni:[]},
    altra:      {nome:"Altra località in Svizzera", fattore:1.00, comuni:[]}
  },
  nottiOccupate: {anno:[140,190], stagione:[90,130]},
  commissionePremium: 0.10
};
const num = n => Math.round(n).toLocaleString("de-CH");
const chf = n => "CHF " + num(n);
const range = (a,b) => `CHF ${num(a)}–${num(b)}`;
const round500 = n => Math.round(n/500)*500;
const round50 = n => Math.round(n/50)*50;
let ultimaStima = null;

/* ----- Indirizzi: suggerimenti dal servizio federale geo.admin.ch (gratuito, solo Svizzera) ----- */
const GEO_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address&limit=6&searchText=";
let indirizzo = null;          // {testo, comune, cantone, zonaKey}
let acItems = [], acActive = -1, acTimer = null, acCtrl = null, geoKo = false;

function zonaDaComune(comune, cantone){
  const c = (comune || "").toLowerCase();
  for (const [key, z] of Object.entries(STIMA.zone)) if (z.comuni.includes(c)) return key;
  return cantone === "ti" ? "ticino" : "altra";
}
function leggiRisultato(r){
  const a = r.attrs || {};
  const testo = String(a.label || "").replace(/\s*<b>/, ", ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const d = String(a.detail || "").trim().toLowerCase();
  const m = d.match(/\b\d{4} .+? \d{1,5} (.+?) ch ([a-z]{2})$/);
  const comune = m ? m[1] : "", cantone = m ? m[2] : (d.match(/ ch ([a-z]{2})$/) || [])[1] || "";
  return {testo, comune, cantone, zonaKey: zonaDaComune(comune, cantone)};
}
function mostraFallback(){
  geoKo = true;
  $("#k_fallback").hidden = false;
  chiudiLista();
}
function apriLista(){ $("#k_list").hidden = false; $("#k_addr").setAttribute("aria-expanded","true"); }
function chiudiLista(){
  $("#k_list").hidden = true; $("#k_addr").setAttribute("aria-expanded","false");
  $("#k_addr").removeAttribute("aria-activedescendant"); acActive = -1;
}
function disegnaLista(){
  const ul = $("#k_list");
  if (!acItems.length){
    ul.innerHTML = `<li class="ac-empty" role="option" aria-disabled="true">Nessun indirizzo trovato. Prova ad aggiungere il numero civico o il CAP.</li>`;
  } else {
    ul.innerHTML = acItems.map((it,i) => {
      const [via, ...resto] = it.testo.split(", ");
      return `<li id="ac_${i}" role="option" aria-selected="${i===acActive}" data-i="${i}">${esc(via)}${resto.length?`<small>${esc(resto.join(", "))}</small>`:""}</li>`;
    }).join("");
  }
  if (acActive >= 0) $("#k_addr").setAttribute("aria-activedescendant", "ac_"+acActive); else $("#k_addr").removeAttribute("aria-activedescendant");
  apriLista();
}
async function cerca(q){
  if (acCtrl) acCtrl.abort();
  acCtrl = new AbortController();
  try {
    const res = await fetch(GEO_URL + encodeURIComponent(q), {signal: acCtrl.signal});
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    acItems = (data.results || []).map(leggiRisultato).filter(x => x.testo);
    acActive = -1;
    if (document.activeElement === $("#k_addr")) disegnaLista();
  } catch(err){
    if (err.name !== "AbortError") mostraFallback();
  }
}
function scegli(i){
  indirizzo = acItems[i];
  $("#k_addr").value = indirizzo.testo;
  chiudiLista();
  const z = STIMA.zone[indirizzo.zonaKey];
  const zl = $("#k_zone"); zl.hidden = false;
  zl.innerHTML = `Zona usata per la stima: <strong>${esc(z.nome)}</strong>`;
  $("#k_err").hidden = true;
  if (!$("#k_result").hidden) calcola();
}
$("#k_addr").addEventListener("input", e => {
  indirizzo = null; $("#k_zone").hidden = true;
  const q = e.target.value.trim();
  clearTimeout(acTimer);
  if (geoKo || q.length < 3){ chiudiLista(); return; }
  acTimer = setTimeout(() => cerca(q), 250);
});
$("#k_addr").addEventListener("keydown", e => {
  const open = !$("#k_list").hidden && acItems.length;
  if (e.key === "ArrowDown" && open){ e.preventDefault(); acActive = (acActive + 1) % acItems.length; disegnaLista(); }
  else if (e.key === "ArrowUp" && open){ e.preventDefault(); acActive = (acActive - 1 + acItems.length) % acItems.length; disegnaLista(); }
  else if (e.key === "Enter" && open && acActive >= 0){ e.preventDefault(); scegli(acActive); }
  else if (e.key === "Escape"){ chiudiLista(); }
});
$("#k_addr").addEventListener("blur", () => setTimeout(chiudiLista, 150));
$("#k_list").addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-i]"); if (!li) return;
  e.preventDefault(); scegli(+li.dataset.i);
});

/* ----- Calcolo ----- */
function zonaScelta(){
  if (indirizzo) return indirizzo.zonaKey;
  if (!$("#k_fallback").hidden && $("#k_zona").value) return $("#k_zona").value;
  return "";
}
function calcola(){
  const zona = zonaScelta(), camereVal = $("#k_camere").value, periodo = $("#k_periodo").value;
  if (!zona || camereVal === "") return false;
  const camere = +camereVal;
  const notte = STIMA.prezzoNotte[camere] * STIMA.zone[zona].fattore;
  const [nMin, nMax] = STIMA.nottiOccupate[periodo];
  const min = round500(notte*nMin), max = round500(notte*nMax);
  const out = $("#k_out");
  out.textContent = range(min, max);
  out.classList.remove("flash"); void out.offsetWidth; out.classList.add("flash");
  $("#k_sub").innerHTML = `Con <strong>Basic</strong> e <strong>Support</strong> resta tutto a te, senza commissioni. Con <strong>Premium</strong> (10%) circa ${range(round50(min*STIMA.commissionePremium), round50(max*STIMA.commissionePremium))} all'anno.`;
  ultimaStima = {
    luogo: indirizzo ? indirizzo.testo : STIMA.zone[zona].nome,
    indirizzo: indirizzo ? indirizzo.testo : "",
    camere: $("#k_camere").selectedOptions[0].textContent.toLowerCase(),
    periodo: periodo === "anno" ? "tutto l'anno" : "da aprile a ottobre",
    min, max
  };
  return true;
}
$("#calcForm").addEventListener("submit", e => {
  e.preventDefault();
  const ok = calcola(), err = $("#k_err");
  err.hidden = ok;
  if (!ok){
    if (!zonaScelta()){
      err.textContent = $("#k_fallback").hidden ? "Scrivi l'indirizzo e sceglilo dall'elenco dei suggerimenti." : "Scegli la zona in cui si trova l'alloggio.";
      ($("#k_fallback").hidden ? $("#k_addr") : $("#k_zona")).focus();
    } else { err.textContent = "Indica quante camere da letto ha l'alloggio."; $("#k_camere").focus(); }
    return;
  }
  const res = $("#k_result"); res.hidden = false;
  const r = res.getBoundingClientRect();
  if (r.bottom > window.innerHeight) res.scrollIntoView({block:"nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
});
["#k_zona","#k_camere","#k_periodo"].forEach(sel => $(sel).addEventListener("change", () => {
  if (!$("#k_result").hidden) calcola();
  if (zonaScelta() && $("#k_camere").value !== "") $("#k_err").hidden = true;
}));
$("#k_cta").addEventListener("click", () => {
  if (ultimaStima){
    if (!$("#c_loc").value) $("#c_loc").value = ultimaStima.luogo;
    if (!$("#c_msg").value) $("#c_msg").value = `Ho usato il calcolatore: ${ultimaStima.camere}, ${ultimaStima.luogo}, ${ultimaStima.periodo}. Stima: ${range(ultimaStima.min, ultimaStima.max)} all'anno. Vorrei una stima personalizzata.`;
  }
  document.getElementById("contatti").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  setTimeout(()=>$("#c_nome").focus({preventScroll:true}), 500);
});

/* ---------- Portal config ---------- */
const AMENITIES = ["Wi-Fi","Cucina","Aria condizionata","Riscaldamento","TV","Parcheggio","Piscina","Balcone o terrazza","Ascensore","Lavatrice","Lavastoviglie","Spazio di lavoro","Culla","Animali ammessi","Asciugacapelli","Ferro da stiro","Macchina del caffè","Spazio esterno"];
const PHOTO_CATS = ["Esterno","Soggiorno","Camere da letto","Bagni","Cucina","Spazi esterni","Vista","Dotazioni e dettagli","Altro"];
const MIN_PHOTOS = 5;

const STEPS = [
 {id:"cliente", title:"I tuoi dati", intro:"Usiamo questi dati per preparare l'annuncio e per contattarti.", fields:[
   {k:"piano", l:"Piano scelto", t:"select", o:["Basic","Support","Premium"], req:1, h:"In produzione sarà già compilato in base al tuo accordo."},
   {k:"nome", l:"Nome e cognome, come da documento", req:1},
   {k:"email", l:"E-mail", t:"email", req:1, w:"half"},
   {k:"tel", l:"Telefono / WhatsApp", t:"tel", req:1, w:"half"},
   {k:"contatto", l:"Come preferisci essere contattato?", t:"radio", o:["E-mail","Telefono","WhatsApp"], req:1}
 ]},
 {id:"alloggio", title:"L'alloggio", intro:"Le informazioni di base che compaiono in testa all'annuncio.", fields:[
   {k:"nomeAlloggio", l:"Nome dell'alloggio", p:"Es. Casa Glicine", req:1},
   {k:"indirizzo", l:"Indirizzo completo", req:1, h:"Non viene mostrato agli ospiti prima della prenotazione."},
   {k:"citta", l:"Località", req:1, w:"half"},
   {k:"paese", l:"Paese", req:1, w:"half", def:"Svizzera"},
   {k:"tipo", l:"Tipo di alloggio", t:"select", o:["Appartamento","Casa","Villa","Chalet","Camera","Altro"], req:1, w:"half"},
   {k:"mq", l:"Superficie", t:"number", unit:"m²", w:"half"},
   {k:"ospiti", l:"Ospiti massimi", t:"number", req:1, w:"half"},
   {k:"camere", l:"Camere da letto", t:"number", req:1, w:"half"},
   {k:"letti", l:"Letti", t:"number", req:1, w:"half"},
   {k:"bagni", l:"Bagni", t:"number", req:1, w:"half"}
 ]},
 {id:"dotazioni", title:"Servizi e dotazioni", intro:"Seleziona tutto quello che gli ospiti trovano nell'alloggio.", fields:[
   {k:"dotazioni", l:"Dotazioni", t:"chips", o:AMENITIES},
   {k:"altreDotazioni", l:"Altre dotazioni", t:"textarea", rows:2, p:"Es. sauna, barbecue, deposito bici"}
 ]},
 {id:"descrizione", title:"Descrizione", intro:"Scrivi con parole tue, anche in modo semplice. Al testo finale pensiamo noi.", fields:[
   {k:"puntiForza", l:"Punti di forza dell'alloggio", t:"textarea", req:1},
   {k:"spazi", l:"Descrizione degli spazi e delle stanze", t:"textarea", req:1},
   {k:"unicita", l:"Cosa lo rende unico", t:"textarea"},
   {k:"quartiere", l:"Il quartiere o la zona", t:"textarea"},
   {k:"attrazioni", l:"Attrazioni nei dintorni", t:"textarea"},
   {k:"trasporti", l:"Trasporti e come arrivare", t:"textarea"}
 ]},
 {id:"regole", title:"Regole della casa", fields:[
   {k:"fumo", l:"Fumo", t:"radio", o:["Non consentito","Solo all'esterno","Consentito"], req:1},
   {k:"animali", l:"Animali", t:"radio", o:["Non ammessi","Ammessi","Su richiesta"], req:1},
   {k:"feste", l:"Feste ed eventi", t:"radio", o:["Non consentiti","Consentiti"], req:1},
   {k:"bambini", l:"Bambini", t:"radio", o:["Benvenuti","Alloggio non adatto ai bambini"], req:1},
   {k:"silenzio", l:"Orari di silenzio", p:"Es. dalle 22:00 alle 8:00", w:"half"},
   {k:"altreRegole", l:"Altre regole", t:"textarea", rows:2}
 ]},
 {id:"checkin", title:"Check-in e check-out", fields:[
   {k:"oraIn", l:"Check-in dalle", t:"time", req:1, w:"half"},
   {k:"oraOut", l:"Check-out entro le", t:"time", req:1, w:"half"},
   {k:"selfCheckin", l:"Self check-in possibile?", t:"radio", o:["Sì","No"], req:1},
   {k:"consegna", l:"Consegna delle chiavi", t:"select", o:["Di persona","Cassetta di sicurezza","Serratura a codice","Altro"], req:1, w:"half"},
   {k:"codice", l:"Codice della cassetta o della serratura", w:"half", h:"Serve solo con il piano Premium. Puoi lasciarlo vuoto e comunicarcelo più avanti."},
   {k:"arrivo", l:"Istruzioni dettagliate per l'arrivo", t:"textarea", req:1},
   {k:"partenza", l:"Istruzioni per la partenza", t:"textarea", req:1}
 ]},
 {id:"prezzi", title:"Prezzi e prenotazioni", intro:"Sono le tue preferenze di partenza. Puoi cambiarle in ogni momento.", fields:[
   {k:"prezzoNotte", l:"Prezzo per notte desiderato", t:"number", unit:"CHF", req:1, w:"half"},
   {k:"pulizia", l:"Costo delle pulizie", t:"number", unit:"CHF", w:"half"},
   {k:"minNotti", l:"Soggiorno minimo", t:"number", unit:"notti", req:1, w:"half"},
   {k:"maxNotti", l:"Soggiorno massimo", t:"number", unit:"notti", w:"half"},
   {k:"cauzione", l:"Cauzione", t:"select", o:["Nessuna","Deposito tramite la piattaforma","Da valutare insieme"], w:"half"},
   {k:"cancellazione", l:"Condizioni di cancellazione", t:"select", o:["Flessibili","Moderate","Rigide","Consigliatemi voi"], req:1, w:"half"},
   {k:"sconti", l:"Sconti", t:"textarea", rows:2, p:"Es. 10% per soggiorni di 7 notti o più"},
   {k:"stagioni", l:"Note sui prezzi stagionali", t:"textarea", rows:2},
   {k:"altroPrezzi", l:"Altre indicazioni sui prezzi", t:"textarea", rows:2}
 ]},
 {id:"gestione", title:"Gestione sul posto", intro:"Non siamo presenti sul territorio: ci serve sapere chi interviene.", fields:[
   {k:"pulizieContatto", l:"Chi si occupa delle pulizie", p:"Nome e telefono, oppure \"io\"", req:1},
   {k:"lavanderia", l:"Biancheria e lavanderia"},
   {k:"manutenzione", l:"Contatto per la manutenzione"},
   {k:"responsabile", l:"Persona di riferimento per problemi sul posto", req:1, h:"La contattiamo noi o gli ospiti in caso di emergenza."},
   {k:"emergenza", l:"Telefono per le emergenze", t:"tel", req:1, w:"half"},
   {k:"noteOp", l:"Altre note", t:"textarea", rows:2}
 ]},
 {id:"ospiti", title:"Comunicazione con gli ospiti", intro:"Ci aiuta a scrivere i messaggi automatici con la tua voce.", fields:[
   {k:"tono", l:"Tono dei messaggi", t:"radio", o:["Formale","Cordiale","Informale"], req:1},
   {k:"benvenuto", l:"Informazioni di benvenuto", t:"textarea"},
   {k:"wifi", l:"Istruzioni per il Wi-Fi", t:"textarea", rows:2, p:"Nome della rete e password"},
   {k:"consigli", l:"I tuoi consigli per gli ospiti", t:"textarea", p:"Ristoranti, passeggiate, negozi"},
   {k:"importante", l:"Cose importanti da sapere sull'alloggio", t:"textarea"}
 ]},
 {id:"foto", title:"Foto", special:"photos"},
 {id:"account", title:"Account e documenti", intro:"L'annuncio sarà sul tuo account. Noi lavoriamo come collaboratori.", fields:[
   {t:"note", html:`<h3>Come ci dai accesso</h3><ol><li>Crea il tuo account su Airbnb e su Booking.com, se non li hai già. Ti inviamo una guida passo passo.</li><li>Aggiungi Lollidays come co-host su Airbnb e come utente nell'extranet di Booking.com.</li><li>Con il piano Basic ci rimuovi dopo la pubblicazione. Con Support e Premium restiamo collaboratori finché lo desideri.</li></ol><p style="margin-top:10px">Non ti chiederemo mai la password.</p>`},
   {k:"annuncioEsistente", l:"Link a un annuncio già esistente", t:"url", p:"https://", h:"Facoltativo. Utile se l'alloggio è già online."},
   {k:"filePlanimetria", l:"Planimetria", t:"files"},
   {k:"fileManuale", l:"Manuale della casa", t:"files"},
   {k:"fileAltro", l:"Altre informazioni sull'annuncio", t:"files"},
   {k:"okAccount", l:"Ho capito: creerò io gli account e inviterò Lollidays come collaboratore.", t:"check", req:1}
 ]},
 {id:"riepilogo", title:"Riepilogo", special:"review"}
];

/* ---------- Portal state ---------- */
const DRAFT_KEY = "lollidays-onboarding-draft";
let data = {}, photos = {}, files = {}, step = 0, maxVisited = 0, started = false, submitted = false;
PHOTO_CATS.forEach(c => photos[c] = []);

function initPortal(){
  if (started) { renderStep(); return; }
  started = true;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw){
      const d = JSON.parse(raw);
      data = d.data || {}; step = Math.min(d.step || 0, STEPS.length-1); maxVisited = Math.max(d.maxVisited || 0, step);
      setTimeout(()=>toast("Abbiamo ripreso la tua bozza salvata"), 300);
    }
  } catch(e){}
  renderStep();
}

function saveDraft(silent){
  collect();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({data, step, maxVisited}));
    if (!silent) toast("Bozza salvata. Le foto vanno ricaricate se chiudi la pagina.");
  } catch(e){ if (!silent) toast("Non è stato possibile salvare la bozza in questo browser."); }
}

/* ---------- Field rendering ---------- */
function fieldHTML(f){
  const v = data[f.k] ?? (f.def || "");
  const id = "f_" + f.k;
  const req = f.req ? ' <span class="req" aria-hidden="true">*</span>' : "";
  const hint = f.h ? `<p class="hint">${f.h}</p>` : "";
  const err = `<p class="err" hidden></p>`;
  const wrap = (inner, group) => group
    ? `<fieldset class="field ${f.w||""}" data-k="${f.k}"><legend>${f.l}${req}</legend>${hint}${inner}${err}</fieldset>`
    : `<div class="field ${f.w||""}" data-k="${f.k}"><label for="${id}">${f.l}${req}</label>${hint}${inner}${err}</div>`;
  switch (f.t){
    case "note": return `<div class="note-block">${f.html}</div>`;
    case "textarea": return wrap(`<textarea id="${id}" name="${f.k}" rows="${f.rows||3}" placeholder="${esc(f.p||"")}">${esc(v)}</textarea>`);
    case "select": return wrap(`<select id="${id}" name="${f.k}"><option value="">Seleziona</option>${f.o.map(o=>`<option value="${esc(o)}"${o===v?" selected":""}>${esc(o)}</option>`).join("")}</select>`);
    case "radio": return wrap(`<div class="opts">${f.o.map(o=>`<label class="opt"><input type="radio" name="${f.k}" value="${esc(o)}"${o===v?" checked":""}><span>${esc(o)}</span></label>`).join("")}</div>`, true);
    case "chips": { const a = Array.isArray(v) ? v : []; return wrap(`<div class="chips">${f.o.map(o=>`<label class="chip"><input type="checkbox" name="${f.k}" value="${esc(o)}"${a.includes(o)?" checked":""}><span>${esc(o)}</span></label>`).join("")}</div>`, true); }
    case "check": return `<div class="field" data-k="${f.k}"><label class="checkline"><input type="checkbox" name="${f.k}"${v?" checked":""}><span>${f.l}${req}</span></label>${err}</div>`;
    case "files": {
      const list = files[f.k] || [];
      return wrap(`<label class="drop" style="min-height:64px;flex-direction:row;gap:10px"><svg><use href="#i-upload"/></svg><span><b>Scegli un file</b> o trascinalo qui</span><input id="${id}" type="file" multiple data-files="${f.k}"></label><ul class="file-list">${list.map((x,i)=>`<li><span>${esc(x.name)}</span><button type="button" data-rmfile="${f.k}" data-i="${i}">Rimuovi</button></li>`).join("")}</ul>`);
    }
    default: {
      const t = f.t || "text";
      const extra = t==="number" ? ' min="0" inputmode="numeric"' : t==="email" ? ' autocomplete="email"' : t==="tel" ? ' autocomplete="tel"' : "";
      const input = `<input id="${id}" name="${f.k}" type="${t}" value="${esc(v)}" placeholder="${esc(f.p||"")}"${extra}>`;
      return wrap(f.unit ? `<div class="unit">${input}<span>${f.unit}</span></div>` : input);
    }
  }
}

/* ---------- Step rendering ---------- */
function renderNav(){
  $("#stepList").innerHTML = STEPS.map((s,i)=>`<li class="${i<maxVisited||submitted?"done":""}"><button type="button" data-go="${i}" ${i>maxVisited?"disabled":""} ${i===step?'aria-current="step"':""}><span class="dot"><b>${i+1}</b></span>${s.title}</button></li>`).join("");
  $("#mpLabel").textContent = `Passo ${step+1} di ${STEPS.length}: ${STEPS[step].title}`;
  $("#mpBar").style.width = ((step+1)/STEPS.length*100) + "%";
}

function renderStep(){
  if (submitted) return;
  const s = STEPS[step];
  const head = `<div class="step-head"><div class="step-count">Passo ${step+1} di ${STEPS.length}</div><h2>${s.title}</h2>${s.intro?`<p>${s.intro}</p>`:""}</div>`;
  let body = "";
  if (s.special === "photos") body = photosHTML();
  else if (s.special === "review") body = reviewHTML();
  else body = `<form class="step-form" id="stepForm" novalidate onsubmit="return false">${s.fields.map(fieldHTML).join("")}</form>`;
  $("#stepArea").innerHTML = head + body;
  $("#prevBtn").style.visibility = step === 0 ? "hidden" : "visible";
  $("#nextBtn").textContent = s.special === "review" ? "Invia i dati" : (step === STEPS.length-2 ? "Vai al riepilogo" : "Continua");
  $("#saveBtn").hidden = s.special === "review";
  renderNav();
  bindStep();
}

/* ---------- Collect & validate ---------- */
function collect(){
  const s = STEPS[step]; if (!s.fields) return;
  const form = $("#stepForm"); if (!form) return;
  s.fields.forEach(f => {
    if (!f.k || f.t === "files") return;
    const els = form.querySelectorAll(`[name="${f.k}"]`); if (!els.length) return;
    if (f.t === "chips") data[f.k] = [...els].filter(e=>e.checked).map(e=>e.value);
    else if (f.t === "radio") data[f.k] = ([...els].find(e=>e.checked) || {}).value || "";
    else if (f.t === "check") data[f.k] = els[0].checked;
    else data[f.k] = els[0].value.trim();
  });
}

function validate(){
  const s = STEPS[step];
  if (s.special === "photos"){
    const n = Object.values(photos).reduce((a,b)=>a+b.length,0);
    const er = $("#photoErr");
    if (n < MIN_PHOTOS){ er.hidden = false; er.textContent = `Carica almeno ${MIN_PHOTOS} foto: finora ne hai caricate ${n}.`; er.scrollIntoView({block:"center"}); return false; }
    er.hidden = true; return true;
  }
  if (s.special === "review"){
    const c = $("#consent"), er = $("#consentErr");
    er.hidden = c.checked; if (!c.checked){ c.focus(); return false; } return true;
  }
  let first = null;
  s.fields.forEach(f => {
    if (!f.k || f.t === "note" || f.t === "files") return;
    const box = document.querySelector(`#stepForm [data-k="${f.k}"]`); if (!box) return;
    const v = data[f.k]; let msg = "";
    if (f.req && (v === "" || v === false || v == null || (Array.isArray(v) && !v.length))){
      msg = f.t === "radio" || f.t === "select" ? "Scegli un'opzione." : f.t === "check" ? "Conferma per continuare." : "Questo campo è obbligatorio.";
    } else if (v && f.t === "email" && !emailOk(v)) msg = "Controlla l'indirizzo e-mail, ad esempio nome@dominio.ch.";
    else if (v && f.t === "number" && (isNaN(+v) || +v < 0)) msg = "Inserisci un numero uguale o maggiore di zero.";
    else if (v && f.t === "url" && !/^https?:\/\/\S+\.\S+/.test(v)) msg = "Inserisci un link completo, che inizi con https://";
    else if (f.k === "maxNotti" && v && data.minNotti && +v < +data.minNotti) msg = "Il soggiorno massimo non può essere inferiore al minimo.";
    box.classList.toggle("invalid", !!msg);
    const er = box.querySelector(".err"); er.hidden = !msg; er.textContent = msg;
    if (msg && !first) first = box.querySelector("input,select,textarea");
  });
  if (first){ first.focus(); first.scrollIntoView({block:"center"}); return false; }
  return true;
}

function go(i){
  collect();
  step = Math.max(0, Math.min(i, STEPS.length-1));
  maxVisited = Math.max(maxVisited, step);
  renderStep(); window.scrollTo(0,0);
}

$("#prevBtn").addEventListener("click", () => go(step-1));
$("#nextBtn").addEventListener("click", () => {
  collect();
  if (!validate()) return;
  if (STEPS[step].special === "review") return submit();
  go(step+1); saveDraft(true);
});
$("#saveBtn").addEventListener("click", () => saveDraft(false));
$("#stepList").addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b && !b.disabled) go(+b.dataset.go); });

/* ---------- Photos ---------- */
function photosHTML(){
  const n = Object.values(photos).reduce((a,b)=>a+b.length,0);
  return `<div class="guide"><strong>Come scattare buone foto</strong><ul>
    <li>Scatta di giorno, con luci accese e tende aperte.</li>
    <li>Riordina e togli gli oggetti personali prima di fotografare.</li>
    <li>Tieni il telefono dritto e scatta sia in orizzontale sia in verticale.</li>
    <li>Fotografa ogni ambiente, anche bagni e spazi esterni, e la vista se c'è.</li>
    <li>Carica le foto alla massima risoluzione, senza filtri.</li></ul></div>
    <p class="photo-total" id="photoTotal">${n} foto caricate, minimo ${MIN_PHOTOS}</p>
    <p class="err" id="photoErr" hidden></p>
    <div class="photo-cats">${PHOTO_CATS.map((c,ci)=>`<section class="pcat"><div class="pcat-head"><strong>${c}</strong><span>${photos[c].length} foto</span></div>
      <label class="drop" data-cat="${ci}"><svg><use href="#i-upload"/></svg><span><b>Aggiungi foto</b><br>o trascinale qui</span><input type="file" accept="image/*" multiple data-photocat="${ci}"></label>
      <div class="thumbs">${photos[c].map((p,i)=>`<div class="thumb"><img src="${p.url}" alt="${esc(c)}, foto ${i+1}"><button type="button" aria-label="Rimuovi foto ${i+1} da ${esc(c)}" data-rmphoto="${ci}" data-i="${i}">×</button></div>`).join("")}</div></section>`).join("")}</div>`;
}
function addPhotos(ci, list){
  const c = PHOTO_CATS[ci];
  [...list].filter(f => f.type.startsWith("image/")).forEach(f => photos[c].push({name:f.name, url:URL.createObjectURL(f)}));
  renderStep();
}
function addFiles(k, list){ files[k] = (files[k] || []).concat([...list].map(f=>({name:f.name}))); collect(); renderStep(); }

function bindStep(){
  const area = $("#stepArea");
  area.querySelectorAll("[data-photocat]").forEach(inp => inp.addEventListener("change", e => addPhotos(+inp.dataset.photocat, e.target.files)));
  area.querySelectorAll("[data-files]").forEach(inp => inp.addEventListener("change", e => addFiles(inp.dataset.files, e.target.files)));
  area.querySelectorAll(".drop").forEach(z => {
    z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", e => {
      e.preventDefault(); z.classList.remove("over");
      const inp = z.querySelector("input");
      if (inp.dataset.photocat !== undefined) addPhotos(+inp.dataset.photocat, e.dataTransfer.files);
      else addFiles(inp.dataset.files, e.dataTransfer.files);
    });
  });
  area.querySelectorAll("[data-rmphoto]").forEach(b => b.addEventListener("click", () => {
    const c = PHOTO_CATS[+b.dataset.rmphoto]; const [p] = photos[c].splice(+b.dataset.i,1); URL.revokeObjectURL(p.url); renderStep();
  }));
  area.querySelectorAll("[data-rmfile]").forEach(b => b.addEventListener("click", () => { collect(); files[b.dataset.rmfile].splice(+b.dataset.i,1); renderStep(); }));
  area.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => go(+b.dataset.edit)));
}

/* ---------- Review ---------- */
function fmt(f, v){
  if (Array.isArray(v)) return v.join(", ");
  if (f.t === "check") return v ? "Sì" : "";
  if (f.unit && v !== "") return f.unit === "CHF" ? `CHF ${v}` : `${v} ${f.unit}`;
  return v;
}
function reviewHTML(){
  const secs = STEPS.slice(0,-1).map((s,i) => {
    let rows = "";
    if (s.special === "photos"){
      rows = PHOTO_CATS.filter(c=>photos[c].length).map(c=>`<dt>${c}</dt><dd><div class="rthumbs">${photos[c].map(p=>`<img src="${p.url}" alt="">`).join("")}</div></dd>`).join("");
    } else {
      rows = s.fields.filter(f=>f.k).map(f => {
        if (f.t === "files"){ const l = files[f.k]||[]; return l.length ? `<dt>${f.l}</dt><dd>${l.map(x=>esc(x.name)).join(", ")}</dd>` : ""; }
        const v = fmt(f, data[f.k] ?? "");
        return v === "" ? "" : `<dt>${f.l}</dt><dd>${esc(v)}</dd>`;
      }).join("");
    }
    return `<section class="rsec"><div class="rsec-head"><h3>${s.title}</h3><button class="btn btn-ghost btn-sm" type="button" data-edit="${i}">Modifica</button></div>${rows?`<dl>${rows}</dl>`:`<p class="empty">Nessuna informazione inserita.</p>`}</section>`;
  }).join("");
  return `<div class="review">${secs}
    <div class="rsec"><label class="checkline"><input type="checkbox" id="consent"><span>Confermo che le informazioni sono corrette e accetto che Lollidays le tratti per creare e gestire l'annuncio, come descritto nell'informativa sulla privacy.</span></label><p class="err" id="consentErr" hidden style="margin-top:8px">Serve la tua conferma per inviare i dati.</p></div></div>`;
}

function submit(){
  submitted = true;
  try { localStorage.removeItem(DRAFT_KEY); } catch(e){}
  renderNav();
  $("#actionbar").hidden = true;
  const nome = (data.nome || "").split(" ")[0];
  $("#mpLabel").textContent = "Onboarding completato"; $("#mpBar").style.width = "100%";
  $("#stepArea").innerHTML = `<div class="done-panel"><div class="done-icon"><svg><use href="#i-check"/></svg></div>
    <p class="big">Dati inviati${nome?`, grazie ${esc(nome)}`:""}</p>
    <p>Ora prepariamo il tuo annuncio. Entro [da definire] giorni lavorativi ti inviamo la bozza da approvare, insieme alla guida per creare gli account e aggiungerci come collaboratori.</p>
    <p style="margin-top:14px">Nel prototipo nessun dato lascia il tuo browser.</p>
    <a href="#top" class="btn btn-primary" style="margin-top:26px">Torna al sito</a></div>`;
  window.scrollTo(0,0);
}

route();
})();

(function(){
const SH=["M","P","D","N"], SHN={M:"Mattina",P:"Pomeriggio",D:"Guardia domenica",N:"Notte"};
const DT=[["fer","Lun–Ven"],["sab","Sabato"],["fes","Dom/festivi"]];
const DOW=["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
const MESI=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
function defPosts(){ const p=[], MP={fer:["M","P"],sab:["M","P"],fes:[]};
  ["TC1","TC2","TC3","TC4"].forEach(n=>p.push({id:n,name:n,cover:"TC",on:clone(MP)}));
  ["RM1","RM2","RM3","RM4","RM5"].forEach(n=>p.push({id:n,name:n,cover:"RM",on:clone(MP)}));
  p.push({id:"DEAMP",name:"DEA",cover:"DEA",all:["N","D"],on:{fer:["M","P","N"],sab:["M","P","N"],fes:["D","N"]}});
  ["ANGIO1","ANGIO2"].forEach((id,i)=>p.push({id,name:"Angio "+(i+1),cover:"ANGIO",on:{fer:["M","P"],sab:["M"],fes:[]}}));
  return p; }
const DEFAULT={
  residents:[],
  rotations:[{id:"TC",name:"TC",jolly:false},{id:"RM",name:"RM",jolly:false},{id:"ANGIO",name:"Angiografia",jolly:true},{id:"DEA",name:"DEA",jolly:true}],
  externals:[{id:"BG",name:"Bambin Gesù"},{id:"BS",name:"Brescia"}],
  posts:defPosts(),
  hours:{M:"08–14",P:"14–20",D:"08–20",N:"20–08"},
  managers:[],
  maxWeek:6, targetWeek:5, maxNightsWeek:2, minPresence:66,
  _v3:true, _v4:true,
  months:{}
};
let S=null, db=null, docRef=null, downloads=null, OWNER=false;
/* rappresentanti: specializzandi scelti dal proprietario che possono usare tutte le funzioni di gestione */
/* modalità specializzando: un rappresentante (o il proprietario) può vedere l'app come uno specializzando; resta solo Impostazioni per tornare */
let REALOWNER=false;
/* ogni anno ha i suoi rappresentanti; ogni rappresentante può modificare turni e bozze di tutti gli anni */
function mgrCohort(){ const pid=myAnyPid(); if(!pid) return null; const y=MULTI?yearOfPid(pid):CURY; const st=y===CURY?S:yState(y); return st&&(st.managers||[]).includes(pid)?y:null; }
function canMgr(y){ if(OWNER) return true; return mgrCohort()!==null; }
function realAdmin(){ return REALOWNER||(!!S&&(S.managers||[]).includes(myPid()))||(!!S&&MULTI&&mgrCohort()!==null); }
function ADMIN(){ if(UI.userMode) return false; return OWNER||(!!S&&(S.managers||[]).includes(myPid()))||(!!S&&MULTI&&mgrCohort()!==null); }
function setUserMode(on){ UI.userMode=!!on; OWNER=on?false:REALOWNER; try{ localStorage.setItem("turni.usermode",on?"1":""); }catch(e){} recomputeUnav(); }
const SW={}, SWALL={}, CLAIMS={}; let CLAIMDOCS=[]; let ALLOW=[], lastRoles="", REQS=[];
/* ---------- più anni (opzionale e reversibile) ----------
   l'anno 2 usa i documenti di sempre (config/main, planner/state); gli altri config/yN e planner/yN.
   Si attiva con S.multiYear nel config dell'anno 2: spento, l'app è identica a prima. */
/* coorti: ogni documento yN è un gruppo di specializzandi (N = anno di corso nel 2026/27); in ogni mese si vedono le 4 coorti
   che in quel mese sono al 1°–4° anno (YRS). Es. ottobre 2026: y2…y5 (y5 = 4° anno uscente), novembre 2026: y1…y4. */
const LEVELS=[1,2,3,4], RAW={};
function YRS(mk){ const sh=yShift(mk||UI.mk); return LEVELS.map(l=>l-sh); }
function ALLY(){ const set=new Set(); try{ const [y,m]=todayMk().split("-").map(Number); for(let k=-KEEP_MONTHS;k<=KEEP_MONTHS;k++) YRS(mkOf(y,m+k)).forEach(c=>set.add(c)); }catch(e){ LEVELS.forEach(c=>set.add(c)); } return [...set].sort((a,b)=>a-b); } let CURY=2, MULTI=false, RAWV=0, REBUILD=null, YAUTO=false;
function yDocs(y){ return y===2?{cfg:"config/main",mon:"planner/state"}:{cfg:"config/y"+y,mon:"planner/y"+y}; }
/* ---------- mesi salvati uno per documento: planner/<anno>_<mese> (es. planner/state_2026-11, planner/y3_2026-11) ----------
   Il vecchio documento (planner/state, planner/yN) resta come copia; quando un rappresentante apre l'app i mesi vengono copiati
   nei documenti per mese e il vecchio documento viene segnato con split:true. Da lì si leggono e si scrivono solo i mesi.
   Se le regole del database non lo permettono ancora, si continua con il vecchio documento (niente si perde). */
function monPath(y,mk){ return "planner/"+(y===2?"state":"y"+y)+"_"+mk; }
const MS={}, MSPLIT={}, MIGR={};
function monWindow(){ const [y0,m0]=todayMk().split("-").map(Number); const out=[]; for(let k=-KEEP_MONTHS;k<=KEEP_MONTHS;k++) out.push(mkOf(y0,m0+k)); return out; }
/* stringa {months} come prima (undefined = non ancora arrivato, null = niente salvato) */
function assembleMon(y){ const st=MS[y]; if(!st||st.legacy===undefined) return undefined; const win=monWindow(); if(win.some(mk=>st.m[mk]===undefined)) return undefined;
  const anyM=win.some(mk=>st.m[mk]); const split=!!(st.legacy&&st.legacy.split)||(!st.legacy&&anyM); MSPLIT[y]=split;
  if(!split){ if(!st.legacy) return {raw:null,split:false};
    /* un mese salvato da solo più di recente del vecchio documento (es. scritto prima che un'app vecchia riscrivesse il documento) vince */
    let obj=null; try{ obj=st.legacy.raw?JSON.parse(st.legacy.raw):null; }catch(e){}
    const newer=win.filter(mk=>st.m[mk]&&(st.mu[mk]||"")>(st.legacy.at||""));
    if(!obj||!newer.length) return {raw:st.legacy.raw,split:false};
    obj.months=obj.months||{}; newer.forEach(mk=>{ try{ obj.months[mk]=JSON.parse(st.m[mk]); }catch(e){} }); return {raw:JSON.stringify(obj),split:false}; }
  let legacy={}; try{ legacy=(st.legacy&&st.legacy.raw?JSON.parse(st.legacy.raw).months:null)||{}; }catch(e){}
  const months={}; for(const mk of win){ const r=st.m[mk]; if(r){ try{ months[mk]=JSON.parse(r); }catch(e){} } else if(legacy[mk]) months[mk]=legacy[mk]; }
  return {raw:JSON.stringify({months}),split:true}; }
/* salva i mesi di un anno: per mese se già diviso, altrimenti nel vecchio documento */
function saveYearMonths(y,months,mks){ if(!db) return Promise.resolve(); const at=new Date().toISOString();
  if(MSPLIT[y]) return Promise.all((mks||Object.keys(months)).filter(mk=>months[mk]).map(mk=>db.doc(monPath(y,mk)).set({state:JSON.stringify(months[mk]),updated:at})));
  return db.doc(yDocs(y).mon).set({state:JSON.stringify({months}),updated:at}); }
/* copia dei mesi dal vecchio documento ai documenti per mese (una volta, da un rappresentante di quell'anno) */
/* attivo per tutti (le regole del database sono aggiornate) */
function splitEnabled(){ return true; }
async function splitMonths(y){ const st=MS[y]; if(MIGR[y]||!db||!st||!st.legacy||st.legacy.split||!canMgr(y)||!splitEnabled()) return; MIGR[y]=true;
  let months={}; try{ months=(st.legacy.raw?JSON.parse(st.legacy.raw).months:null)||{}; }catch(e){ return; }
  try{ const at=new Date().toISOString(); for(const mk of Object.keys(months)){ if(st.m[mk]&&(st.mu[mk]||"")>(st.legacy.at||"")) continue; await db.doc(monPath(y,mk)).set({state:JSON.stringify(months[mk]),updated:at}); }
    const now=MS[y].legacy; await db.doc(yDocs(y).mon).set({state:(now&&now.raw)||st.legacy.raw,updated:at,split:true}); }
  catch(e){ MIGR[y]="ko"; if(y===CURY&&OWNER) toast("Per salvare i mesi separatamente (più veloce) aggiorna le regole del database: per ora si continua come prima"); } }
const PARSED={};
/* anni che coprono ogni sala: elenco unico per tutti (config/years), lo modificano proprietario e rappresentanti di qualsiasi anno.
   chiave = nome sala normalizzato; senza indicazione la sala è di tutti gli anni */
let COVY={}, CLOSEDG={}, YCOL={}, HOLEY={}; /* colori degli anni (livello 1–4 → colore) e turni scoperti assegnati a un anno: mk → {giorno|sala|turno: livello} (config/years) */
const YCOL_DEF={1:"#0d9488",2:"#db2777",3:"#b45309",4:"#4f46e5"}, ROMAN={1:"I",2:"II",3:"III",4:"IV"};
function ycol(l){ return YCOL[l]||YCOL_DEF[l]||"#666"; }
/* anni assegnati alle persone mancanti di una casella (anche più di una): valore = elenco di livelli (vecchi dati: un numero) */
function hkOf(d,key){ const [pid,sh]=key.split("|"), p=postOf(pid); return p?d+"|"+normRoom(p.name)+"|"+sh:null; }
/* ogni persona mancante: {l: anno, b: quante persone di quell'anno c'erano già quando è stata segnata} → si considera coperta quando ne arriva una in più */
function normTags(v){ return v==null?[]:[].concat(v).map(x=>typeof x==="object"&&x?{l:+x.l,b:+x.b||0}:{l:+x,b:0}); }
function holeTags(mk,d,key){ const k=hkOf(d,key); return normTags(k&&HOLEY[mk]?HOLEY[mk][k]:null); }
function holeTag(mk,d,key){ const t=holeTags(mk,d,key)[0]; return t?t.l:null; }
function yearCounts(mo,d,key,arr){ const cnt={}; [...(arr||[]).filter(x=>x).map(resName),...(EXT(mo)[d+"|"+key]||[]),...(lowerOnly(mo,d,key)||[])].forEach(n=>{ const m=/^\(\s*(\d)\s*\)/.exec(n); if(m) cnt[+m[1]]=(cnt[+m[1]]||0)+1; }); return cnt; }
/* anni assegnati non ancora coperti: ogni anno è soddisfatto da una persona di quell'anno presente nella casella; sala piena = tutti soddisfatti */
function unsatTags(mo,d,key,arr){ const tags=holeTags(mo.mk,d,key); if(!tags.length) return []; const [pid,s]=key.split("|"), p=postOf(pid);
  if(p&&(arr||[]).filter(x=>x).length+othersIn(mo,d,key)>=capOf(p,s).max) return [];
  const cnt=yearCounts(mo,d,key,arr); return tags.filter(t=>(cnt[t.l]||0)<=t.b).map(t=>t.l); }
function tagSatisfied(mo,d,key,arr,L){ return !unsatTags(mo,d,key,arr).includes(L); }
const chipY=(l,txt)=>`<span class="hole" style="display:inline-block;margin:2px 2px 0 0;color:#fff;background:${ycol(l)}">${txt} · ${ROMAN[l]} anno</span>`;
function holeLabel(d,key){ const mo=M(UI.mk); if(!holeTags(UI.mk,d,key).length) return `<span class="hole">scoperto</span>`; const arr=(((workSched(mo)||{})[d]||{})[key])||[], tags=unsatTags(mo,d,key,arr); return tags.length?tags.map(l=>chipY(l,"scoperto")).join(""):`<span class="hole">scoperto</span>`; }
/* etichetta per caselle con persone ma non complete: "manca 1" o "manca · II anno" (una per ogni persona mancante assegnata a un anno) */
function partialLabel(mo,d,key,arr){ const oc=(arr||[]).filter(x=>x).length; if(!oc||isClosed(mo,d,key)) return ""; const n=needOf(mo,d,key)-oc, un=unsatTags(mo,d,key,arr);
  const rest=n-un.length; return `<span style="display:block">${un.map(l=>chipY(l,"manca")).join("")}${rest>0?`<span class="hole" style="display:inline-block;margin-top:2px">manca ${rest}</span>`:""}</span>`.replace('<span style="display:block"></span>',""); }
function setHoleTag(mk,keys,lev){ const m={...(HOLEY[mk]||{})}, mo=M(mk), sc=viewSched(mk)||{}; let n=0; keys.forEach(dk=>{ const [d,pid,sh]=dk.split("|"), key=pid+"|"+sh, k=hkOf(d,key); if(!k) return;
    if(lev){ m[k]=[{l:lev,b:yearCounts(mo,d,key,(sc[d]||{})[key]||[])[lev]||0}]; n++; } else if(m[k]){ delete m[k]; n++; } });
  HOLEY={...HOLEY,[mk]:m}; if(n&&db) saveYearsDoc().catch(()=>toast("Non riesco a salvare: le regole del database vanno aggiornate")); return n; }
function addHoleTag(mk,dk,L){ const mo=M(mk), [d0,p0,s0]=dk.split("|"), key=p0+"|"+s0, arr0=((editSched(mo)||{})[d0]||{})[key]||[], have=yearCounts(mo,d0,key,arr0)[L]||0;
  editHoleTags(mk,dk,t=>{ const unsat=t.filter(x=>x.l===L&&have<=x.b).length; return [...t,{l:L,b:have+unsat}].sort((a,b)=>a.l-b.l); }); }
function editHoleTags(mk,dk,fn){ const [d,pid,sh]=dk.split("|"), k=hkOf(d,pid+"|"+sh); if(!k) return; const m={...(HOLEY[mk]||{})}; const cur=holeTags(mk,d,pid+"|"+sh), nx=fn([...cur]);
  if(nx.length) m[k]=nx; else delete m[k]; HOLEY={...HOLEY,[mk]:m}; if(db) saveYearsDoc().catch(()=>toast("Non riesco a salvare: le regole del database vanno aggiornate")); }
const COV_DEF={diagsen:[1],radsen1:[1],radsen2:[1],ecocolumbus:[1],eco:[1],rxtorace:[1],rxscheletro:[1],tccolumbus:[3],tccemi0:[1],sala8:[1]};
function yearsFor(p){ const k=normRoom(p.name), v=COVY[k]; return Array.isArray(v)?v:(COV_DEF[k]||LEVELS); }
/* gli anni dell'elenco sono gli anni di corso effettivi del mese (es. in ottobre il vostro gruppo è 1° anno) */
function postActive(p){ return yearsFor(p).includes(yLab(CURY)); }
function yState(y){ if(y===CURY&&S) return S; const r=RAW[y]; if(!r||r.cfg===undefined||r.mon===undefined) return null;
  const key=(r.cfg||"")+"\u0001"+(r.mon||""); if(PARSED[y]&&PARSED[y].key===key) return PARSED[y].st;
  let st=null; try{ const c=r.cfg?JSON.parse(r.cfg):null, m=r.mon?JSON.parse(r.mon):null; if(c) st={...c,months:(m&&m.months)||{}}; }catch(e){}
  PARSED[y]={key,st}; return st; }
function yearOfPid(pid){ for(const y of ALLY()){ const st=yState(y); if(st&&(st.residents||[]).some(r=>r.id===pid)) return y; } return null; }
function myAnyPid(){ if(!MYUID) return null; for(const pid in CLAIMS) if(CLAIMS[pid]===MYUID&&(MULTI?yearOfPid(pid):S&&S.residents.some(r=>r.id===pid))) return pid; return null; }
/* cambi: si mostrano solo quelli dell'anno che si sta guardando */
function filterSW(){ for(const k in SW) delete SW[k]; const ids=new Set(S?S.residents.map(r=>r.id):[]);
  for(const k in SWALL){ const x=SWALL[k]; if(!MULTI||ids.has(x.from)||ids.has(x.to)) SW[k]=x; } }
/* cascata: i turni degli anni superiori (4 → 3 → 2 → 1) contano come "coperti da altri anni" per l'anno che si guarda */
const EXTC={key:null,map:{}};
/* bozza condivisa: i rappresentanti (di qualsiasi anno) vedono e usano le bozze degli altri anni al posto del loro pubblicato */
function anyMgr(){ return !UI.userMode&&(OWNER||(typeof mgrCohort==="function"&&mgrCohort()!==null)); }
/* modifiche in bozza (non pubblicate) degli altri anni: nomi aggiunti e caselle cambiate, per segnalarle */
const DRX={u:{names:new Set(),cells:new Set()},l:{names:new Set(),cells:new Set()}};
function drxSync(){ if(!MULTI||!S||!UI.mk) return; const mo=M(UI.mk); EXT(mo); LOWER(mo); DRX.u=EXTC.dx||DRX.u; DRX.l=LOWC.dx||DRX.l; }
function drxName(d,k,v){ const kk=d+"|"+k+"|"+nameKey(v); return DRX.u.names.has(kk)||DRX.l.names.has(kk); }
function drxCell(d,k){ const kk=d+"|"+k; return DRX.u.cells.has(kk)||DRX.l.cells.has(kk); }
function xNames(d,k,arr){ return arr.map(v=>drxName(d,k,v)?`<span class="xd" title="In bozza, non ancora pubblicato">${esc(v)}</span>`:esc(v)).join("<br>"); }
function autoExt(mk,lower){ const out={}, am=anyMgr(), dx=DRX[lower?"l":"u"]={names:new Set(),cells:new Set()};
  for(const y of YRS(mk)){ if(lower?y>=CURY:y<=CURY) continue; const st=yState(y); const m0=st&&st.months&&st.months[mk]; if(!m0) continue;
    const sc=am&&m0.draft&&m0.draft.sched?{...(m0.sched||{}),...m0.draft.sched}:m0.sched; if(!sc) continue; const m2={sched:sc};
    const mine={}; S.posts.forEach(p=>mine[normRoom(p.name)]=p); const pmap={}; (st.posts||[]).forEach(p=>pmap[p.id]=mine[normRoom(p.name)]);
    const nm={}; (st.residents||[]).forEach(r=>nm[r.id]=`(${yLab(r.year||st.groupYear||y)}) ${r.name}`);
    const dr=am&&m0.draft&&m0.draft.sched||null, pub=m0.sched||{};
    for(const d in m2.sched) for(const k in m2.sched[d]){ const [pid,sh]=k.split("|"), my=pmap[pid]; if(!my||!((my.on||{})[dayType(d)]||[]).includes(sh)) continue;
      const kk=d+"|"+my.id+"|"+sh, inDr=dr&&dr[d], pa=((pub[d]||{})[k]||[]);
      if(inDr&&!sameCell(dr[d][k],pa)) dx.cells.add(kk);
      (m2.sched[d][k]||[]).forEach(x=>{ if(!x||!nm[x]) return; (out[kk]=out[kk]||[]).push(nm[x]); if(inDr&&!pa.includes(x)) dx.names.add(kk+"|"+nameKey(nm[x])); }); }
    /* tolti nella bozza: la casella resta segnalata anche se nella bozza è vuota */
    if(dr) for(const d in dr){ const pd=pub[d]||{}; for(const k in pd){ const [pid,sh]=k.split("|"), my=pmap[pid]; if(!my) continue; if(!sameCell(dr[d][k],pd[k])) dx.cells.add(d+"|"+my.id+"|"+sh); } } }
  return out; }
const SEXC={key:null,map:{}};
function sheetExtCached(mk){ const sh=sheetLatest(mk); const key=mk+"|"+CURY+"|"+(sh?sh.at:"")+"|"+S.residents.length+"|"+S.posts.length+"|"+JSON.stringify((S.months[mk]||{}).extReset||{}).length; if(SEXC.key!==key){ SEXC.key=key; SEXC.map=sh?sheetExt(mk):{}; } return SEXC.map; }
/* anni sotto (generati dopo nella cascata): solo da vedere, non cambiano la generazione */
const LOWC={key:null,map:{}};
const PSIG={t:-1,v:""}; function postSig(){ if(PSIG.t!==TICK||!PSIG.v){ PSIG.t=TICK; PSIG.v=S.posts.map(p=>p.id+":"+p.name).join(","); } return PSIG.v; }
function LOWER(mo){ if(!MULTI||!S) return {}; const key=mo.mk+"|"+CURY+"|"+RAWV+"|"+anyMgr()+"|"+postSig();
  if(LOWC.key!==key){ LOWC.key=key; LOWC.map=autoExt(mo.mk,true); LOWC.dx=DRX.l; } return LOWC.map; }
/* EXT è chiamato per ogni casella: il risultato si ricalcola solo quando cambia qualcosa (TICK sale a ogni render, generazione e salvataggio) */
let TICK=0; const EXTMEMO={};
function EXT(mo){ const own=mo.ext||{}, k=TICK+"|"+anyMgr()+"|"+mo.mk+"|"+CURY+"|"+RAWV+"|"+(S?S.posts.length+"|"+S.residents.length:"")+"|"+Object.keys(own).length;
  if(EXTMEMO.mo===mo&&EXTMEMO.own===own&&EXTMEMO.k===k) return EXTMEMO.v;
  const v=EXT0(mo); EXTMEMO.mo=mo; EXTMEMO.own=own; EXTMEMO.k=k; EXTMEMO.v=v; return v; }
/* se un altro anno ha caricato un foglio più recente, le voci prese da un foglio più vecchio da quest'anno non valgono più
   (restano quelle segnate a mano e, se il foglio nuovo non ha notti/guardie, le notti/guardie importate prima) */
function extOwn(mo){ const own=mo.ext||{}, sh=S&&mo.mk?sheetLatest(mo.mk):null; if(!sh||(mo.sheet&&mo.sheet.at>=sh.at)) return own;
  const rooms=sh.rooms||[], hasN=rooms.includes("N"), hasD=rooms.some(x=>x.endsWith("|D")), out={};
  for(const k in own){ const v=own[k]||[], sft=k.split("|")[2];
    if(v.includes(EXT_MAN)) out[k]=[EXT_MAN];
    else if((sft==="N"&&!hasN)||(sft==="D"&&!hasD)) out[k]=v; }
  return out; }
function EXT0(mo){ let own=extOwn(mo); if(S&&mo.mk){ const se=sheetExtCached(mo.mk); if(Object.keys(se).length){ const m={...se}; for(const k in own) m[k]=dedupNames([...(m[k]||[]),...own[k]]); own=m; } } if(!MULTI||!S) return own;
  const key=mo.mk+"|"+CURY+"|"+RAWV+"|"+anyMgr()+"|"+postSig();
  if(EXTC.key!==key){ EXTC.key=key; EXTC.map=autoExt(mo.mk); EXTC.dx=DRX.u; }
  const auto=EXTC.map; if(!Object.keys(auto).length) return own;
  const out={...auto}; for(const k in own) out[k]=dedupNames([...(auto[k]||[]),...own[k]]); return out; }
/* stesso nome da più fonti (foglio + orario pubblicato di un altro anno): si tiene una volta sola */
function nameKey(v){ return String(v).replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase(); }
function dedupNames(a){ const seen=new Set(); return a.filter(v=>{ const k=nameKey(v); if(!k||v===EXT_MAN) return true; if(seen.has(k)) return false; seen.add(k); return true; }); }
function lowerOnly(mo,d,key){ const lw=LOWER(mo)[d+"|"+key]; if(!lw) return null; const ex=new Set((EXT(mo)[d+"|"+key]||[]).map(nameKey)); const r=lw.filter(v=>!ex.has(nameKey(v))); return r.length?r:null; }
function syncRoles(){ if(!OWNER||!db||!S) return; const uidsOf=st=>[...new Set(((st&&st.managers)||[]).map(p=>CLAIMS[p]).filter(Boolean))].sort();
  const st2=yState(2); if(!st2) return; const doc={uids:uidsOf(st2)};
  if(MULTI){ for(const y of ALLY()){ if(y===2) continue; const st=yState(y); if(!st){ if(RAW[y]&&RAW[y].cfg===null) continue; return; } doc["y"+y]=uidsOf(st); } }
  const k=JSON.stringify(doc); if(k===lastRoles) return; lastRoles=k; db.doc("roles/managers").set(doc).catch(()=>{lastRoles="";}); } let MYUID=null, USER=null;
const UNAV={}; /* mk → pid → {data: codice} — un documento per specializzando e mese */
/* preferenze di turno (3° e 4° anno), nello stesso documento delle indisponibilità: mk → pid → {data: "M" | "TC1|M" …} */
const PREF={}; function PR(mk){return PREF[mk]||(PREF[mk]={});}
/* privacy: se attivo (config/privacy.hideUnav), gli specializzandi vedono solo le proprie indisponibilità, ferie, congressi e preferenze */
let HIDEUNAV=false, HIDESWAPS=false;
function swInvolves(x,pid){ return !!pid&&(x.from===pid||x.to===pid||(x.needs||[]).includes(pid)||(x.extra||[]).some(e=>e.giver===pid||e.taker===pid)); }
function canPref(pid){ const r=resOf(pid); return !!r&&yearOfRes(r)>=3; }
function UN(mk){return UNAV[mk]||(UNAV[mk]={});}
const now=new Date();
const UI={tab:"turni", mk:mkOf(now.getFullYear(), now.getMonth()+1), sel:null, view:null, confirm:null};
try{const t=localStorage.getItem("turni.tab"); if(t) UI.tab=t; if(UI.tab==="modturni") UI.view="giorni"; const me=localStorage.getItem("turni.me"); if(me) UI.sel=me;}catch(e){}
try{ UI.mk=todayMk(); }catch(e){}

/* ---------- date ---------- */
function mkOf(y,m){ while(m>12){y++;m-=12} while(m<1){y--;m+=12} return y+"-"+String(m).padStart(2,"0"); }
function D(s){const [y,m,d]=s.split("-").map(Number);return new Date(Date.UTC(y,m-1,d));}
function ymd(d){return d.toISOString().slice(0,10);}
function add(s,n){const d=D(s);d.setUTCDate(d.getUTCDate()+n);return ymd(d);}
function isoDow(s){return (D(s).getUTCDay()+6)%7;}
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return ymd(new Date(Date.UTC(y,mo-1,da)));}
const festCache={};
function festivi(y){ if(festCache[y]) return festCache[y];
  const f=["01-01","01-06","04-25","05-01","06-02","06-29","08-15","11-01","12-08","12-25","12-26"].map(x=>y+"-"+x);
  f.push(add(easter(y),1)); return festCache[y]=new Set(f); }
function dayType(s){ if(festivi(+s.slice(0,4)).has(s)||isoDow(s)===6) return "fes"; if(isoDow(s)===5) return "sab"; return "fer"; }
/* calcoli ripetuti migliaia di volte per disegnare la tabella: si memorizzano */
const PERC=new Map();
function period(mk){ let v=PERC.get(mk); if(!v){ v=period0(mk); PERC.set(mk,v); } return v; }
function period0(mk){ const [y,m]=mk.split("-").map(Number);
  let first=y+"-"+String(m).padStart(2,"0")+"-01"; while(isoDow(first)!==0) first=add(first,1);
  let last=ymd(new Date(Date.UTC(y,m,0))); while(isoDow(last)!==6) last=add(last,1);
  const days=[]; for(let d=first; d<=last; d=add(d,1)) days.push(d); return {first,last,days}; }
function fmt(s,long){const d=D(s);const g=d.getUTCDate(), mm=d.getUTCMonth()+1; return long?`${DOW[isoDow(s)]} ${g} ${MESI[mm-1]}`:`${DOW[isoDow(s)]} ${String(g).padStart(2,"0")}/${String(mm).padStart(2,"0")}`;}
function monthName(mk){const [y,m]=mk.split("-").map(Number);return MESI[m-1]+" "+y;}

/* ---------- state ---------- */
function esc(t){return String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function sortRes(list){ return list.sort((a,b)=>a.name.localeCompare(b.name,"it",{sensitivity:"base"})); }
function uid(){return Math.random().toString(36).slice(2,9);}
function clone(x){return JSON.parse(JSON.stringify(x));}
function M(mk){ if(!S.months[mk]) S.months[mk]={rot:{},sched:null};
  const mo=S.months[mk]; mo.rot=mo.rot||{};
  if(Object.prototype.propertyIsEnumerable.call(mo,"unav")){ const old=mo.unav||{}; delete mo.unav; for(const pid in old) if(!UN(mk)[pid]) UN(mk)[pid]=old[pid]; }
  Object.defineProperty(mo,"unav",{value:UN(mk),enumerable:false,configurable:true,writable:true});
  Object.defineProperty(mo,"mk",{value:mk,enumerable:false,configurable:true,writable:true});
  if(!mo._init){ const [y,m]=mk.split("-").map(Number), prev=S.months[mkOf(y,m-1)];
    if(prev&&prev.rot) for(const r of S.residents) if(!mo.rot[r.id]&&prev.rot[r.id]) mo.rot[r.id]=prev.rot[r.id];
    mo._init=true; }
  return mo; }
function rotName(id){ if(id==="ALL") return "Tutti"; const r=[...S.rotations,...S.externals].find(x=>x.id===id);return r?r.name:"—";}
function resName(id){ if(id===null||id==="") return "nessuno (scoperto)";
  return resName0(id); }
function resName0(id){const r=S.residents.find(x=>x.id===id);return r?rName(r):"?";}
/* nome mostrato con l'anno di specializzazione davanti, come nel foglio: "(2) Cognome" */
/* passaggio d'anno automatico: l'anno accademico inizia a novembre. Gli anni salvati (r.year, groupYear, documenti yN)
   valgono per l'anno accademico AY_BASE (2026/27, da novembre 2026); per i mesi di altri anni accademici si spostano.
   Es.: il vostro gruppo è 2° anno da novembre 2026, quindi in ottobre 2026 risulta 1° anno. */
function ayOf(mk){ const [y,m]=mk.split("-").map(Number); return m>=11?y:y-1; }
function ayBase(){ const st=yState(2)||S; return +((st&&st.ayBase)||2026); }
function yShift(mk){ return ayOf(mk||UI.mk)-ayBase(); }
function yLab(n){ return (+n)+yShift(); }
function rName(r){ const y=yLab(r.year||S.groupYear||2); return `(${y}) ${r.name}`; }
function postOf(id){return S.posts.find(p=>p.id===id);}
function isExt(rot){return !rot||S.externals.some(x=>x.id===rot);}
/* chi è fuori sede (es. Bambin Gesù) può essere inserito nei turni dal rappresentante: conta come jolly */
function incl(mo,pid){ return false; }
/* chi è al Bambin Gesù non entra mai nei turni generati, ma un rappresentante può assegnarlo a mano */
function isBG(rot){ return rot==="BG"; }
function inGem(mo,pid){ return !isExt(mo.rot[pid])||incl(mo,pid); }
function roomRot(name){ const k=normRoom(name); if(/^tc/.test(k)) return "TC"; if(/^rm/.test(k)) return "RM"; if(/^(diagsen|radsen)/.test(k)) return "SENO";
  if(/^(rxtorace|rxscheletro|sala8)$/.test(k)) return "RX"; if(/^(eco|ecocolumbus)$/.test(k)) return "ECO"; if(k==="dea") return "DEA"; return null; }
/* rotazioni ibride: chi è in RX/Eco copre sia le sale RX sia quelle di Ecografia (circa metà e metà, con precedenza a RX) */
const HYB={RXECO:["RX","ECO"]};
function rotCovers(rot,cov){ return rot===cov||(HYB[rot]||[]).includes(cov); }
function isJolly(rot){const r=S.rotations.find(x=>x.id===rot);return !!(r&&r.jolly);}
function unavOf(mo,pid,d){return (mo.unav[pid]||{})[d]||"";}
const FULL={G:"Indisponibile",F:"Ferie",C:"Congresso"};
function blocked(u,s){ if(FULL[u]) return true; return u.includes(s); }
/* presenza minima per rotazione (ferie e congresso riducono i presenti) */
function presence(mk,onlyRot){ const mo=M(mk), {days}=period(mk), out=[];
  for(const d of days){ if(dayType(d)==="fes") continue;
    for(const rot of S.rotations){ if(onlyRot&&rot.id!==onlyRot) continue;
      const mem=S.residents.filter(r=>mo.rot[r.id]===rot.id); if(!mem.length) continue;
      const away=mem.filter(r=>{const u=unavOf(mo,r.id,d);return u==="F"||u==="C";});
      const need=Math.ceil(mem.length*S.minPresence/100-1e-9), pres=mem.length-away.length;
      if(pres<need) out.push({d,rot,pres,n:mem.length,need,away}); } }
  return out; }
function presenceBox(list){ if(!list.length) return "";
  return `<div class="alerts bad"><strong>Presenza sotto il ${S.minPresence}% in ${list.length} ${list.length===1?"giorno":"casi"}</strong><ul>${list.slice(0,12).map(x=>`<li>${fmt(x.d)} · ${esc(x.rot.name)}: presenti ${x.pres} su ${x.n} (minimo ${x.need}). Assenti: ${x.away.map(r=>esc(rName(r))).join(", ")}</li>`).join("")}${list.length>12?`<li>… e altri ${list.length-12}</li>`:""}</ul></div>`; }
function shiftsOfDay(d){ const set=new Set(slotsOfDay(d).map(x=>x.s)); return SH.filter(s=>set.has(s)); }
function slotsOfDay(d){ const t=dayType(d), out=[]; S.posts.forEach(p=>{ if(!postActive(p)) return; SH.forEach(s=>{ if((p.on[t]||[]).includes(s)) out.push({post:p,s,key:p.id+"|"+s}); }); }); return out; }
/* turni in sale non dell'anno (es. dal foglio): contano comunque per la persona (turni, monto/smonto, settimana, conteggi) */
function slotsWith(d,day){ const base=slotsOfDay(d), have=new Set(base.map(x=>x.key)), out=[...base];
  for(const k in (day||{})){ if(have.has(k)||!(day[k]||[]).some(x=>x)) continue; const [pid,s]=k.split("|"), post=postOf(pid); if(post&&SH.includes(s)) out.push({post,s,key:k,extra:true}); }
  return out; }
/* chi può coprire una postazione: primari, poi jolly */
/* DEA (mattina e pomeriggio), notti e guardie: le può fare chiunque, senza guardare la rotazione */
function covOf(post,s){ return (post.all||[]).includes(s)||post.cover==="DEA"||s==="N"||s==="D"?"ALL":post.cover; }
function pools(mo,post,s){ const inG=S.residents.filter(r=>inGem(mo,r.id)), cov=covOf(post,s);
  if(cov==="ALL") return {pri:inG,jol:[]};
  /* i jolly (Angiografia, DEA) coprono solo TC e RM: le altre sale solo chi è nella loro rotazione */
  return {pri:inG.filter(r=>rotCovers(mo.rot[r.id],cov)), jol:(isJolly(cov)||!(cov==="TC"||cov==="RM"))?[]:inG.filter(r=>!rotCovers(mo.rot[r.id],cov)&&(isJolly(mo.rot[r.id])||incl(mo,r.id)))}; }

let saveT=null, saving=false, pending=false, lastJSON="";
function setSync(t){document.getElementById("sync").textContent=t;}
const uT={}, uBusy={};
/* ognuno scrive solo nel proprio spazio unav/<suo account>; il rappresentante scrive anche in unav/staff per chi non ha ancora collegato il nome */
function unavRef(mk,pid){ const u=CLAIMS[pid]; return db.collection(u?`unav/${u}/m`:"unav/staff/m").doc(mk+"_"+pid); }
/* scadenza: indisponibilità, ferie e congressi di un mese si modificano fino a 2 giorni prima del suo primo lunedì; dopo solo il proprietario */
function unavDeadline(mk){ return add(period(mk).first,-2); }
function todayIso(){ const t=new Date(); return ymd(new Date(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()))); }
function unavLocked(mk){ return !ADMIN()&&todayIso()>unavDeadline(mk); }
function canEditUnav(pid,mk){ return ADMIN()||(!!pid&&pid===myPid()&&!unavLocked(mk||UI.mk)); }
function unavDenyMsg(pid,mk){ return pid===myPid()&&unavLocked(mk||UI.mk)?`Modifiche chiuse dal ${fmt(add(unavDeadline(mk||UI.mk),1))}: per cambiare chiedi a chi gestisce i turni`:"Puoi modificare solo le tue indisponibilità"; }
const SRC={}, SUBS={};
function recomputeUnav(){ const keep={}, keepP={};
  for(const mk in UNAV) for(const pid in UNAV[mk]){ const k=mk+"_"+pid; if(uT[k]||uBusy[k]){ keep[k]=UNAV[mk][pid]; keepP[k]=PR(mk)[pid]; } }
  for(const mk in UNAV) for(const pid in UNAV[mk]) delete UNAV[mk][pid];
  for(const mk in PREF) for(const pid in PREF[mk]) delete PREF[mk][pid];
  /* i dati del database arrivano congelati: si copiano, altrimenti le modifiche successive vengono ignorate */
  for(const x of Object.values(SRC.staff||{})){ UN(x.mk)[x.pid]={...(x.days||{})}; if(x.pref) PR(x.mk)[x.pid]={...x.pref}; }
  for(const u in SRC){ if(u==="staff") continue; for(const x of Object.values(SRC[u])) if(CLAIMS[x.pid]===u){ UN(x.mk)[x.pid]={...(x.days||{})}; if(x.pref) PR(x.mk)[x.pid]={...x.pref}; } }
  for(const k in keep){ const i=k.indexOf("_"); UN(k.slice(0,i))[k.slice(i+1)]=keep[k]; if(keepP[k]) PR(k.slice(0,i))[k.slice(i+1)]=keepP[k]; }
  if(HIDEUNAV&&!ADMIN()){ const me=myAnyPid(); for(const mk in UNAV) for(const pid in UNAV[mk]) if(pid!==me) delete UNAV[mk][pid]; for(const mk in PREF) for(const pid in PREF[mk]) if(pid!==me) delete PREF[mk][pid]; } }
function syncSubs(uids){ const want=new Set(["staff",...uids]);
  for(const u of want) if(!SUBS[u]) SUBS[u]=db.collection(`unav/${u}/m`).limit(1000).onSnapshot(qs=>{ SRC[u]={}; for(const doc of qs.docs){ const x=doc.data(); if(x&&x.mk&&x.pid) SRC[u][doc.id]=x; } recomputeUnav(); if(S&&!layer.innerHTML) render(); },()=>{});
  for(const u in SUBS) if(!want.has(u)){ try{SUBS[u]();}catch(e){} delete SUBS[u]; delete SRC[u]; } }
/* associazione account → nome: definitiva per lo specializzando, la cambia solo il proprietario */
function linkPanel(){ const groups=MULTI?YRS(todayMk()).concat(ALLY().filter(c=>!YRS(todayMk()).includes(c)&&c<YRS(todayMk())[0])).map(y=>[y,((yState(y)||{}).residents)||[]]).filter(g=>g[1].length):[[null,S.residents]];
  const anyFree=groups.some(g=>g[1].some(r=>!CLAIMS[r.id]));
  return `<div class="panel" style="border:2px solid var(--accent)"><h2>Associa l'account: chi sei?</h2>
   <p style="margin:0;font-size:.9rem">Tocca il tuo cognome e conferma. <strong>La scelta è definitiva</strong>: potrà cambiarla solo chi gestisce il tool. Da quel momento potrai modificare solo le tue indisponibilità e rispondere ai cambi rivolti a te.</p>
   ${groups.map(([gy,list])=>`${gy?`<span class="groupname">${yLab(gy)}° anno</span>`:""}<div class="pickers">${list.map(r=>{const taken=!!CLAIMS[r.id]; const conf=UI.confirm==="claim-"+r.id;
     return `<button data-act="claim" data-id="${r.id}" ${taken?"disabled":""} ${conf?'style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)"':""}>${conf?"Confermo: sono "+esc(gy?`(${yLab(r.year||gy)}) ${r.name}`:rName(r)):esc(gy?`(${yLab(r.year||gy)}) ${r.name}`:rName(r))}${taken?' <span class="cnt">già associato</span>':""}</button>`;}).join("")}</div>`).join("")}
   ${anyFree?"":`<p class="muted" style="margin:0">Tutti i nomi sono già associati: se il tuo è stato preso per errore, avvisa chi gestisce il tool.</p>`}</div>`; }
/* un account = una sola persona: se è già associato (anche in un altro anno) non si sceglie più */
function claimPanel(why){ const pid=myAnyPid(); const mine=CLAIMDOCS.find(x=>x.u===MYUID);
  if(!pid&&mine&&!OWNER) return `<div class="panel" style="border:2px solid var(--bad)"><h2>Associazione da sistemare</h2><p style="margin:0;font-size:.9rem">Il tuo account risulta già associato a un nome (${esc(rNameAny(mine.pid))}) che appartiene a un altro collega o non esiste più. Chiedi al proprietario di scollegarti: poi potrai scegliere il tuo nome.</p></div>`;
  if(!pid) return linkPanel(); const y=MULTI?yearOfPid(pid):null;
  return `<div class="panel"><p style="margin:0;font-size:.9rem">Il tuo account è associato a <strong>${esc(rNameAny(pid))}</strong>${y&&y!==CURY?` del ${yLab(y)}° anno: qui puoi solo guardare. Per le tue indisponibilità e i tuoi cambi scegli in alto il ${yLab(y)}° anno.`:"."}</p>${y&&y!==CURY?`<div class="row"><button class="btn primary" data-act="year" data-v="${y}">Vai al ${yLab(y)}° anno</button></div>`:""}</div>`; }
function rNameAny(pid){ for(const y of ALLY()){ const st=yState(y); const r=st&&(st.residents||[]).find(x=>x.id===pid); if(r) return `(${yLab(r.year||st.groupYear||y)}) ${r.name}`; } return resName(pid); }
function claimPanelOld(why){ return `<div class="panel"><h2>Chi sei?</h2><p class="muted" style="margin:0;font-size:.88rem">${why}</p>
  <div class="pickers">${S.residents.map(r=>{const taken=CLAIMS[r.id]&&CLAIMS[r.id]!==MYUID;return `<button data-act="claim" data-id="${r.id}" ${taken?"disabled":""}>${esc(rName(r))}${taken?' <span class="cnt">già collegato</span>':""}</button>`;}).join("")}</div></div>`; }
function saveUnav(mk,pid){ const k=mk+"_"+pid; if(db&&!canEditUnav(pid,mk)){ toast(unavDenyMsg(pid,mk)); return; } clearTimeout(uT[k]); setSync("Modifiche in corso…");
  uT[k]=setTimeout(async()=>{ delete uT[k];
    if(!db){ try{localStorage.setItem("turni.unav",JSON.stringify(UNAV));}catch(e){} setSync("Salvato su questo dispositivo"); return; }
    if(uBusy[k]){ saveUnav(mk,pid); return; } uBusy[k]=true;
    try{ await unavRef(mk,pid).set({mk,pid,days:UN(mk)[pid]||{},pref:PR(mk)[pid]||{},updated:new Date().toISOString()}); setSync("Salvato"); }
    catch(e){ setSync(e&&e.code==="invalid_argument"?"Non hai i permessi per salvare: chiedi a chi gestisce i turni di invitarti":"Salvataggio non riuscito, riprova"); }
    uBusy[k]=false; },400); }
function persist(){ TICK++; if(!ADMIN()) return; clearTimeout(saveT); setSync("Modifiche in corso…"); saveT=setTimeout(()=>{saveT=null;flush();},500); }
/* impostazioni del tool (config/main: solo il proprietario) separate dai mesi (planner/state: proprietario e rappresentanti) */
let cfgRef=null, lastCfg="", lastMon="";
function splitS(){ const {months,...cfg}=S; return {cfg:JSON.stringify(cfg), mon:JSON.stringify({months})}; }
async function flush(){
  if(!docRef){ const json=JSON.stringify(S); try{localStorage.setItem("turni.state",json);}catch(e){} setSync("Salvato su questo dispositivo"); return; }
  const {cfg,mon}=splitS(); if(cfg===lastCfg&&mon===lastMon){setSync("Salvato");return;}
  if(saving){pending=true;return;} saving=true;
  try{
    const at=new Date().toISOString();
    if(ADMIN()&&cfg!==lastCfg){ await cfgRef.set({state:cfg,updated:at}); lastCfg=cfg; }
    if(ADMIN()&&mon!==lastMon){ const y=CURY;
      if(MSPLIT[y]){ const L=(MS[y]&&MS[y].last)||{}; for(const mk of Object.keys(S.months||{})){ const j=JSON.stringify(S.months[mk]); if(L[mk]===j) continue; await db.doc(monPath(y,mk)).set({state:j,updated:at}); L[mk]=j; } if(MS[y]) MS[y].last=L; }
      else await db.doc(yDocs(y).mon).set({state:mon,updated:at});
      lastMon=mon; }
    setSync("Salvato");
  }catch(e){ const ro=e&&e.code==="invalid_argument"; setSync(ro?"Sola lettura: non puoi salvare":"Salvataggio non riuscito, riprovo…"); if(!ro) setTimeout(flush,4000); }
  saving=false; if(pending){pending=false;flush();}
}
let migrated=false;
function load(raw){ const st=raw?JSON.parse(raw):clone(DEFAULT);
  if(!st.posts){ // versione precedente: sale → rotazioni + postazioni
    st.rotations=(st.rooms||DEFAULT.rotations).map(r=>({id:r.id,name:r.name,jolly:["ANGIO","DEA"].includes(r.id)}));
    st.posts=defPosts(); delete st.rooms; for(const k in (st.months||{})) st.months[k].sched=null; migrated=true; }
  for(const k of Object.keys(DEFAULT)) if(st[k]===undefined) st[k]=clone(DEFAULT[k]);
  sortRes(st.residents);
  for(const s of SH) if(!st.hours[s]) st.hours[s]=DEFAULT.hours[s];
  st.posts.forEach(p=>{ if(!p.on){ p.on={}; DT.forEach(([t])=>p.on[t]=(p.days||[]).includes(t)?[...(p.shifts||[])]:[]); delete p.days; delete p.shifts; migrated=true; } });
  if(!st.posts.some(p=>p.cover==="ANGIO")&&!st._v3){ const d=defPosts(); const add=d.filter(p=>p.id==="DEAMP"||p.cover==="ANGIO"); st.posts.splice(st.posts.findIndex(p=>p.cover==="ALL"),0,...add); migrated=true; }
  st._v3=true;
  /* rotazioni esterne per anno (niente turni al Gemelli) */
  if(st.groupYear===4&&!st.externals.some(x=>x.id==="SE")){ st.externals.push({id:"SE",name:"Sede Esterna"}); migrated=true; }
  if(st.groupYear===3&&!st.externals.some(x=>x.id==="IT")){ st.externals.push({id:"IT",name:"Isola Tiberina"}); migrated=true; }
  if(!st._v4){ st.posts.forEach(p=>{ if(p.id==="DEA"&&p.cover==="ALL") p.name="Guardia domenica"; if(p.id==="NOTTE") p.on.fes=[];
      if(p.cover!=="ALL") p.on.fes=[]; }); st._v4=true; migrated=true; }
  /* sale di Senologia, Ecografia, RX e TC Columbus (di base per il 1°/3° anno: vedi "Anni che coprono ogni sala") */
  if(!st._v5){ const MP=()=>({fer:["M","P"],sab:["M","P"],fes:[]});
    [["SENO","Senologia"],["ECO","Ecografia"],["RX","RX"]].forEach(([id,name])=>{ if(!st.rotations.some(r=>r.id===id)) st.rotations.push({id,name,jolly:false}); });
    [["TCCOL","TC Columbus","TC"],["DIAGSEN","DIAGSEN","SENO"],["RADSEN1","RadSen 1","SENO"],["RADSEN2","RadSen 2","SENO"],["ECOCOL","Eco Columbus","ECO"],["ECO","Ecografia","ECO"],["RXTOR","RX Torace","RX"],["RXSCH","RX Scheletro","RX"]]
      .forEach(([id,name,cover])=>{ if(!st.posts.some(p=>p.id===id||normRoom(p.name)===normRoom(name))) st.posts.push({id,name,cover,on:MP()}); });
    st._v5=true; migrated=true; }
  if(!st._v6){ const MP=()=>({fer:["M","P"],sab:["M","P"],fes:[]});
    [["TCCEMI","TC 0 CEMI","TC"],["SALA8","Sala 8","RX"]].forEach(([id,name,cover])=>{ if(!st.posts.some(p=>p.id===id||normRoom(p.name)===normRoom(name))) st.posts.push({id,name,cover,on:MP()}); });
    st._v6=true; migrated=true; }
  /* associazione fissa sala → rotazione (decisa dal proprietario): TC, RM, Senologia, RX (anche RX/Eco), Ecografia (anche RX/Eco), DEA */
  if(!st._v9){ st.rotations.forEach(r=>{ r.jolly=r.id==="ANGIO"||r.id==="DEA"; }); st._v9=true; migrated=true; }
  if(!st._v8){ st.posts.forEach(p=>{ const r=roomRot(p.name); if(r&&p.cover!=="ALL"&&p.cover!==r){ p.cover=r; } }); st._v8=true; migrated=true; }
  if(!st._v7){ if(!st.rotations.some(r=>r.id==="RXECO")) st.rotations.push({id:"RXECO",name:"RX/Eco",jolly:false}); st._v7=true; migrated=true; }
  return st; }

/* ---------- generazione ---------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function newStat(){return {on:{},tot:0,M:0,P:0,D:0,N:0,we:0,wk:{},wn:{},pc:{},last:{}};}
/* abilitazione a notti e guardie: per specializzando (r.nights / r.guards); se non indicata, sì tranne il 1° anno */
function resOf(pid){ return S.residents.find(r=>r.id===pid); }
function yearOfRes(r){ return yLab(r.year||S.groupYear||2); }
function canDoR(r,s,st){ if(s!=="N"&&s!=="D") return true; const v=s==="N"?r.nights:r.guards; return v===undefined?yLab(r.year||(st||S).groupYear||2)!==1:!!v; }
function canDo(pid,s){ const r=resOf(pid); return r?canDoR(r,s,S):true; }
/* notti e guardie equilibrate tra gli anni: quota per persona = notti (o guardie) del mese ÷ abilitati presenti di tutti gli anni */
function nightQuota(mk,sh){ if(!MULTI||!hasLowerYear()) return null; const days=period(mk).days; let need=0, people=0, mine=0, union={};
  for(const y of YRS(mk)){ const st=yState(y); if(!st) continue; const rot=(((st.months||{})[mk])||{}).rot||{}, ext=new Set((st.externals||[]).map(x=>x.id));
    const n=(st.residents||[]).filter(r=>rot[r.id]&&!ext.has(rot[r.id])&&canDoR(r,sh,st)).length; people+=n; if(y===CURY) mine=n;
    (st.posts||[]).forEach(p=>{ const k=normRoom(p.name); if(k&&yearsFor(p).includes(yLab(y))&&!union[k]) union[k]=p; }); }
  for(const d of days){ const t=dayType(d); for(const k in union) if(((union[k].on||{})[t]||[]).includes(sh)) need+=capOf(union[k],sh).min; }
  /* per: massimo a persona; year: quota dell'anno, in proporzione agli abilitati */
  return people?{per:Math.max(1,Math.ceil(need/people)),year:Math.round(need*mine/people)}:null; }
function ok(mo,p,pid,d,s,w,cap,forceG){
  if(!canDo(pid,s)) return false;
  { const u=unavOf(mo,pid,d); if(blocked(u,s)&&!(forceG&&u==="G")) return false; }
  if(p.on[d]) return false;
  if(p.on[add(d,-1)]==="N") return false;
  if(s==="N" && p.on[add(d,1)]) return false;
  if((p.wk[w]||0)>=Math.min(cap||S.maxWeek,S.maxWeek)) return false;
  if(s==="N" && (p.wn[w]||0)>=S.maxNightsWeek) return false;
  return true; }
function cmp(a,b){for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
/* wk = indice della settimana da (ri)generare; senza wk si genera tutto il mese. Le altre settimane restano com'erano e contano per equità e vincoli */
/* ---------- notti e guardie già programmate (foglio "Guardie/Notti …") ----------
   tabelle con "Data | Giorno | nome(i)" sotto i titoli "GUARDIE…" e "NOTTI". I nostri diventano turni fissi, gli altri anni turni coperti. */
function toIso(v){ if(v instanceof Date&&!isNaN(v)) return ymd(new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())));
  const t=String(v||"").trim(); let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/); if(m){ const y=m[3].length===2?"20"+m[3]:m[3]; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; } return null; }
function parseNights(rows,mk){ const days=new Set(period(mk).days), titles=[];
  rows.slice(0,6).forEach(r=>(r||[]).forEach((v,c)=>{ const t=String(v||""); if(/guardi/i.test(t)) titles.push([c,"D"]); else if(/nott/i.test(t)) titles.push([c,"N"]); }));
  titles.sort((a,b)=>a[0]-b[0]); const kindAt=c=>{ let k=null; for(const [tc,tk] of titles) if(tc<=c) k=tk; return k; };
  const out=[], dayWord=/^(lun|mar|mer|gio|ven|sab|dom)/i;
  rows.forEach(r=>{ r=r||[]; for(let c=0;c<r.length;c++){ const d=toIso(r[c]); if(!d) continue; const k=kindAt(c); if(!k||!days.has(d)) continue;
      let j=c+1; if(dayWord.test(String(r[j]||"").trim())) j++;
      for(;j<r.length;j++){ const v=String(r[j]??"").trim(); if(!v||toIso(r[j])) break; out.push({d,s:k,name:v}); } } });
  const ours={}; S.residents.forEach(x=>ours[x.name.trim().toLowerCase()]=x.id);
  const res=[]; for(const o of out){ const sl=slotsOfDay(o.d).find(x=>x.s===o.s); if(!sl) continue; const sur=o.name.replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase();
    res.push({...o,key:sl.key,pid:ours[sur]||null}); }
  return res; }
function nightsPreview(name){ const wb=UI.extWb; if(!wb) return; const ws=wb.Sheets[name];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""}), r=parseNights(rows,UI.mk); UI.nightRes=r;
  const mine=r.filter(x=>x.pid), oth=r.filter(x=>!x.pid), cnt=(l,s)=>l.filter(x=>x.s===s).length;
  sheet(`<div class="row" style="justify-content:space-between"><h2>Notti e guardie programmate</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   <label class="stack" style="gap:4px"><span class="label">Foglio</span><select id="nightsheet">${wb.SheetNames.map(x=>`<option ${x===name?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
   <p class="muted" style="margin:0;font-size:.86rem">${monthName(UI.mk)}: i nostri diventano turni fissi (il generatore non li tocca), gli altri anni turni già coperti.</p>
   ${r.length?`<div class="alerts" style="background:var(--accent-soft)"><strong>Trovati ${r.length} turni</strong><ul>
     <li>Notti: ${cnt(mine,"N")} nostre, ${cnt(oth,"N")} di altri anni</li><li>Guardie: ${cnt(mine,"D")} nostre, ${cnt(oth,"D")} di altri anni</li></ul></div>
     ${mine.length?`<p style="margin:0;font-size:.84rem">${mine.map(x=>`${fmt(x.d)} ${x.s==="N"?"notte":"guardia"}: ${esc(resName(x.pid))}`).join(" · ")}</p>`:""}`
    :`<div class="alerts bad"><strong>Nessuna notte o guardia per ${monthName(UI.mk)}</strong><span style="font-size:.85rem">Controlla di aver scelto il foglio giusto (es. «Guardie/Notti NOV-GEN») e il mese.</span></div>`}
   <div class="row"><button class="btn primary" data-act="nightsave" ${r.length?"":"disabled"}>Inserisci</button><button class="btn" data-act="close">Annulla</button></div>`); }
function applyNights(mk,list){ const mo=M(mk); mo.fixed=mo.fixed||{}; mo.ext=mo.ext||{};
  if(!hasDraft(mo)){ const sc={}; period(mk).days.forEach(d=>{ sc[d]={}; slotsOfDay(d).forEach(x=>{ sc[d][x.key]=[null]; }); }); mo.draft={sched:mo.sched?clone(mo.sched):sc,at:new Date().toISOString(),acc:{}}; }
  const W=mo.draft.sched; let pins=0, cov=0;
  for(const x of list){ const pre=x.d+"|"+x.key+"|";
    if(x.pid){ const used=Object.keys(mo.fixed).filter(z=>z.startsWith(pre)).map(z=>mo.fixed[z]); if(used.includes(x.pid)) continue;
      const i=used.length; mo.fixed[pre+i]=x.pid; W[x.d]=W[x.d]||{}; const a=W[x.d][x.key]=(W[x.d][x.key]||[null]).filter(v=>v===x.pid||Object.values(mo.fixed).includes(v)||!v);
      if(!a.includes(x.pid)){ if(!a[0]) a[0]=x.pid; else a.push(x.pid); } pins++; }
    else { const k=x.d+"|"+x.key; mo.ext[k]=mo.ext[k]||[]; if(!mo.ext[k].includes(x.name)){ mo.ext[k].push(x.name); cov++; } } }
  syncExt(mo); UI.draftView=true; return {pins,cov}; }
/* ---------- bozza e pubblicazione ----------
   "Genera" e "Aggiorna" scrivono una bozza (mo.draft) che vedono solo i rappresentanti dell'anno; con "Accetta" (tutta o settimana
   per settimana) passa nell'orario pubblicato (mo.sched), che vedono tutti e che passa agli altri anni. Ogni bozza e ogni
   accettazione si salvano nello storico (hist/y<anno>_<mese>/v), leggibile solo dai rappresentanti di quell'anno. */
function hasDraft(mo){ return !!(mo.draft&&mo.draft.sched); }
function draftView(mo){ return (ADMIN()||anyMgr())&&hasDraft(mo)&&UI.draftView!==false; }
function workSched(mo){ return draftView(mo)?mo.draft.sched:mo.sched; }
/* le modifiche a mano vanno sempre nella bozza (creata dal pubblicato se serve) e la settimana toccata torna da accettare */
function ensureDraft(mo,d){ if(!hasDraft(mo)){ const n=period(mo.mk).days.length/7, acc={}; if(mo.sched) for(let w=0;w<n;w++) acc[w]=true; mo.draft={sched:clone(mo.sched||{}),at:new Date().toISOString(),acc}; }
  if(d&&mo.draft.acc){ const w=Math.floor(period(mo.mk).days.indexOf(d)/7); if(w>=0) delete mo.draft.acc[w]; } UI.draftView=true; return mo.draft.sched; }
function editSched(mo){ return hasDraft(mo)?mo.draft.sched:mo.sched; }
function viewSched(mk){ const mo=M(mk); return draftView(mo)?clone(mo.draft.sched):effSched(mk); }
function histAdd(mk,kind,sched){ if(!db||!sched) return; const by=myPid()?resName(myPid()):(OWNER?"proprietario":"");
  db.collection(`hist/y${CURY}_${mk}/v`).doc().set({mk,kind,by,at:new Date().toISOString(),state:JSON.stringify(sched)}).catch(()=>{}); }
/* chi sta modificando: nome del rappresentante (o "proprietario") */
function whoAmI(){ const pid=myAnyPid(); if(pid){ const y=MULTI?yearOfPid(pid):CURY, st=y===CURY?S:yState(y), r=st&&(st.residents||[]).find(x=>x.id===pid); if(r) return `(${yLab(r.year||st.groupYear||y)}) ${r.name}`; } return OWNER?"proprietario":"rappresentante"; }
function acceptDraft(mk,weeks){ const mo=M(mk); if(!hasDraft(mo)) return 0; const p=period(mk), n=p.days.length/7; mo.sched=mo.sched||{};
  const at0=new Date().toISOString(), chg=[];
  for(const w of weeks) p.days.slice(w*7,w*7+7).forEach(d=>{ if(!mo.draft.sched[d]) return;
    /* modifiche all'orario già pubblicato: si segnalano alle persone coinvolte (Cambi → "Modifiche al tuo orario") */
    if(mo.generated&&mo.sched[d]){ const keysOf=(sc,pid)=>Object.keys(sc||{}).filter(k=>(sc[k]||[]).includes(pid)).sort(), ids=new Set();
      [mo.sched[d],mo.draft.sched[d]].forEach(sc=>{ for(const k in sc) (sc[k]||[]).forEach(x=>x&&ids.add(x)); });
      const W=(mo.draft.who||{}), me=whoAmI();
      ids.forEach(pid=>{ const a=keysOf(mo.sched[d],pid), b=keysOf(mo.draft.sched[d],pid); if(a.join()!==b.join()){ const by=[...b,...a].map(k=>W[d+"|"+k]).find(x=>x)||me; chg.push({at:at0,pid,d,from:a,to:b,by}); } }); }
    mo.sched[d]=clone(mo.draft.sched[d]); });
  if(chg.length) mo.changes=[...(mo.changes||[]),...chg].slice(-300);
  mo.draft.acc={...(mo.draft.acc||{})}; weeks.forEach(w=>mo.draft.acc[w]=true); mo.generated=new Date().toISOString();
  const all=Array.from({length:n},(_,w)=>w).every(w=>mo.draft.acc[w]);
  histAdd(mk,weeks.length===n?"Pubblicata (tutto il mese)":`Pubblicata: ${weeks.map(w=>"settimana "+(w+1)).join(", ")}`,mo.draft.sched);
  if(all) delete mo.draft; return weeks.length; }
/* equilibrio tra gli anni (con più anni attivo): un anno che ha anni sotto di sé nella cascata si ferma alla quota
   media settimanale per persona (turni da coprire in tutte le sale ÷ specializzandi presenti di tutti gli anni), così il resto va agli anni successivi */
function hasLowerYear(){ return MULTI&&YRS(UI.mk).some(y=>y<CURY&&(((yState(y)||{}).residents)||[]).length); }
function fairMonth(mk){ if(!MULTI) return null;
  const days=period(mk).days, union={}; let people=0;
  for(const y of YRS(mk)){ const st=yState(y); if(!st) continue; const rot=(((st.months||{})[mk])||{}).rot||{}, ext=new Set((st.externals||[]).map(x=>x.id));
    people+=(st.residents||[]).filter(r=>rot[r.id]&&!ext.has(rot[r.id])).length;
    (st.posts||[]).forEach(p=>{ const k=normRoom(p.name); if(k&&yearsFor(p).includes(yLab(y))&&!union[k]) union[k]=p; }); }
  if(!people) return null;
  let demand=0; for(const d of days){ const t=dayType(d); for(const k in union) demand+=((union[k].on||{})[t]||[]).length; }
  return Math.max(1,Math.ceil(demand/people)); }
/* equità su più mesi: notti, guardie e turni nel weekend dei 3 mesi precedenti (orario pubblicato).
   Scarto di ognuno dalla media del gruppo (limitato a ±3): il generatore lo somma ai conteggi del mese, così chi ne ha fatti di più ne riceve meno. */
function pastLoad(mk){ const [y,m]=mk.split("-").map(Number), out={}; S.residents.forEach(r=>out[r.id]={N:0,D:0,we:0,months:0});
  for(let k=1;k<=KEEP_MONTHS;k++){ const pk=mkOf(y,m-k), mo=S.months[pk]; if(!mo||!mo.sched||!mo.generated) continue; const sc=effSched(pk)||mo.sched, seen=new Set();
    for(const d of period(pk).days){ const t=dayType(d); for(const key in (sc[d]||{})){ const sh=key.split("|")[1]; (sc[d][key]||[]).forEach(pid=>{ const o=out[pid]; if(!o) return; seen.add(pid);
      if(sh==="N") o.N++; if(sh==="D") o.D++; if(t!=="fer") o.we++; }); } }
    seen.forEach(pid=>out[pid].months++); }
  return out; }
function pastBias(mk){ const h=pastLoad(mk), B={}; const ids=Object.keys(h).filter(id=>h[id].months>0);
  for(const f of ["N","D","we"]){ const el=ids.filter(id=>f==="we"||canDo(id,f)); const mean=el.length?el.reduce((a,id)=>a+h[id][f],0)/el.length:0;
    for(const id in h){ B[id]=B[id]||{N:0,D:0,we:0}; if(el.includes(id)) B[id][f]=Math.max(-3,Math.min(3,h[id][f]-mean)); } }
  return {B,h}; }
function generate(mk,wk,only2,from){ TICK++; /* from: i giorni prima restano come sono (aggiorna da oggi) */ /* only2: Set di pid a cui si possono dare turni nuovi (aggiorna per rotazione) */
  const mo=M(mk), {days}=period(mk), rand=rng(Date.now()%2147483647), only=wk!==undefined&&wk!==null, base=(hasDraft(mo)?mo.draft.sched:mo.sched)||{};
  const sched={}, st={}, slots=[], nDone={N:0,D:0};
  S.residents.forEach(r=>{st[r.id]=newStat();st[r.id].jit=rand();});
  const PB=pastBias(mk).B, pb=(id,f)=>(PB[id]||{})[f]||0;
  /* notte dell'ultimo giorno del mese precedente: il primo lunedì è smonto */
  { const [y,m]=mk.split("-").map(Number), pk=mkOf(y,m-1); if(S.months[pk]){ const ps=effSched(pk)||{}, last=add(days[0],-1); for(const k in (ps[last]||{})) (ps[last][k]||[]).forEach(pid=>{ if(pid&&st[pid]) st[pid].on[last]=k.split("|")[1]; }); } }
  days.forEach((d,i)=>{ const t=dayType(d), w=Math.floor(i/7);
    if((only&&w!==wk)||(from&&d<from)){ sched[d]=clone(base[d]||{});
      slotsWith(d,sched[d]).forEach(x=>{ if(!sched[d][x.key]) sched[d][x.key]=[null];
        sched[d][x.key].forEach(pid=>{ const p=pid&&st[pid]; if(!p) return; p.on[d]=x.s; p.tot++; p[x.s]++; p.pc[x.post.id]=(p.pc[x.post.id]||0)+1; p.last[d]=x.post.id;
          if(t!=="fer")p.we++; p.wk[w]=(p.wk[w]||0)+1; if(x.s==="N")p.wn[w]=(p.wn[w]||0)+1; }); });
      return; }
    sched[d]={};
    slotsOfDay(d).forEach(x=>{ if(isClosed(mo,d,x.key)||extCovered(mo,d,x.key)){ sched[d][x.key]=[]; return; }
      /* tanti posti quante persone servono a quest'anno; se gli altri anni arrivano già al minimo resta un posto facoltativo (fino al massimo) */
      const {need,nL,nO}=myNeed(mo,d,x.key); sched[d][x.key]=[null];
      /* i posti degli scoperti assegnati a quest'anno vengono per primi (tag) */
      for(let k=0;k<need;k++) slots.push({d,i,w,t,post:x.post,s:x.s,key:x.key,k,ext:false,tag:k<nL});
      /* sale "una per anno" (DEA, guardia): anche se il minimo è già raggiunto, quest'anno prova a mettere la sua persona (senza farne un buco);
         non se la casella è stata assegnata a un altro anno */
      if(!need&&!nO) slots.push({d,i,w,t,post:x.post,s:x.s,key:x.key,k:0,ext:!capOf(x.post,x.s).py}); }); });
  const pri=x=>x.tag?-1:x.s==="N"?0:x.s==="D"?1:(x.t!=="fer"?2:3);
  slots.forEach(x=>x.r=rand()); slots.sort((a,b)=>pri(a)-pri(b)||a.i-b.i||a.r-b.r);
  const covCnt=(p,cov)=>{ let n=0; for(const id in p.pc){ const q=postOf(id); if(q&&q.cover===cov) n+=p.pc[id]; } return n; };
  const pick=(sl,cands,cap,forceG,mcap)=>{ let best=null,bk=null; if(mcap===undefined) mcap=mMain;
    for(const r of cands){ if(only2&&!only2.has(r.id)) continue; const p=st[r.id];
      /* RX/Eco: si alternano RX ed Eco (metà e metà, RX sempre per primo); oltre i turni ideali solo dove serve, prima RX */
      if(HYB[mo.rot[r.id]]&&cap===soft){ const rx=covCnt(p,"RX"), ec=covCnt(p,"ECO"); if(sl.post.cover==="ECO"&&ec>=rx) continue; if(sl.post.cover==="RX"&&rx>ec) continue; }
      if(sl.s==="N"&&capN&&(p.N>=capN.per||nDone.N>=capN.year)) continue; if(sl.s==="D"&&capD&&(p.D>=capD.per||nDone.D>=capD.year)) continue; if(!ok(mo,p,r.id,sl.d,sl.s,sl.w,cap,forceG)) continue; if(mcap&&p.tot>=mcap) continue;
      const j=p.jit+rand()*0.5;
      const mp=(sl.s==="M"||sl.s==="P")?p[sl.s]-(sl.s==="M"?p.P:p.M):0, pc=p.pc[sl.post.id]||0, same=p.last[sl.d]===undefined&&p.last[add(sl.d,-1)]===sl.post.id?1:0;
      const key= sl.s==="N"?[p.N+pb(r.id,"N"),p.tot,j] : sl.s==="D"?[p.we+pb(r.id,"we")+pb(r.id,"D"),p.tot,j] : sl.t!=="fer"?[p.we+pb(r.id,"we"),p.tot,mp,pc+same,j] : [p.tot,mp,pc+same,j];
      if(forceG) key.unshift(p.g||0);
      if(!best||cmp(key,bk)<0){best=r;bk=key;} }
    return best; };
  const filled=sl=>(sched[sl.d][sl.key]||[]).filter(x=>x).length>(sl.k||0);
  const put=(sl,r)=>{ const p=st[r.id], a=sched[sl.d][sl.key]=sched[sl.d][sl.key]||[], z=a.indexOf(null); if(z>=0) a[z]=r.id; else a.push(r.id); p.on[sl.d]=sl.s; p.tot++; p[sl.s]++; p.pc[sl.post.id]=(p.pc[sl.post.id]||0)+1; p.last[sl.d]=sl.post.id;
    if(sl.t!=="fer")p.we++; p.wk[sl.w]=(p.wk[sl.w]||0)+1; if(sl.s==="N")p.wn[sl.w]=(p.wn[sl.w]||0)+1; if(sl.s==="N"||sl.s==="D") nDone[sl.s]++; };
  /* prima si resta entro i turni ideali (es. 5, con un riposo in settimana), poi si arriva al massimo solo dove serve */
  /* ogni giorno si riempiono per prime le sale/turni finora meno coperti: i buchi si distribuiscono in modo omogeneo */
  /* turni inseriti a mano (fissi): si mettono per primi e il generatore non li tocca */
  const fx=mo.fixed||{};
  /* turni fissi in sale non dell'anno (es. dal foglio): restano e contano */
  { const genDays=new Set(days.filter((d,i)=>(!only||Math.floor(i/7)===wk)&&!(from&&d<from)));
    Object.keys(fx).forEach(z=>{ const [d,pid,sh]=z.split("|"), key=pid+"|"+sh, i=days.indexOf(d); if(!genDays.has(d)||!st[fx[z]]) return;
      if(slots.some(sl=>sl.d===d&&sl.key===key)||(sched[d]&&sched[d][key]&&slotsOfDay(d).some(x=>x.key===key))) return; const post=postOf(pid); if(!post) return;
      sched[d][key]=sched[d][key]||[]; if(sched[d][key].includes(fx[z])) return;
      put({d,i,w:Math.floor(i/7),t:dayType(d),post,s:sh,key},{id:fx[z]},sched[d][key].length>0); }); }
  { const seenK=new Set(); slots.forEach(sl=>{ const pre=sl.d+"|"+sl.key+"|"; if(seenK.has(pre)) return; seenK.add(pre);
    const ids=Object.keys(fx).filter(k=>k.startsWith(pre)).sort((a,b)=>+a.split("|").pop()-+b.split("|").pop()).map(k=>fx[k]).filter(pid=>st[pid]);
    ids.forEach(pid=>{ if(!sched[sl.d][sl.key].includes(pid)) put(sl,{id:pid}); }); }); }
  /* quota mensile per persona uguale per tutti gli anni: gli anni con anni sotto si fermano lì; le persone in più in TC/RM non la superano mai */
  const capN=nightQuota(mk,"N"), capD=nightQuota(mk,"D");
  const fair=fairMonth(mk), mMain=fair&&hasLowerYear()?fair:null, maxCap=S.maxWeek, soft=S.targetWeek||S.maxWeek, fill={}, byDay=days.map(()=>[]);
  slots.forEach(sl=>byDay[sl.i].push(sl));
  /* preferenze di turno (3° e 4° anno): si provano per prime, rispettando tutte le regole e le quote */
  { const PRF=PR(mk);
    const order=S.residents.filter(r=>PRF[r.id]&&canPref(r.id)&&inGem(mo,r.id)&&(!only2||only2.has(r.id))).sort((a,b)=>st[a.id].jit-st[b.id].jit);
    for(const r of order) for(const d of Object.keys(PRF[r.id]).sort()){ const code=PRF[r.id][d]; if(!code) continue;
      const [pid0,sh]=code.includes("|")?code.split("|"):[null,code];
      const cands=slots.filter(sl=>sl.d===d&&sl.s===sh&&(!pid0||sl.post.id===pid0)&&!filled(sl)).filter(sl=>{ const pl=pools(mo,sl.post,sl.s); return pl.pri.some(x=>x.id===r.id)||pl.jol.some(x=>x.id===r.id); });
      cands.sort((a,b)=>(a.ext-b.ext)||((fill[a.key]||0)-(fill[b.key]||0)));
      for(const sl of cands){ if(pick(sl,[r],maxCap,false,sl.ext?fair:undefined)){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; break; } } } }
  for(const [grp,cap] of [["pri",soft],["jol",soft],["pri",maxCap],["jol",maxCap]])
    for(const pr of [-1,0,1,2,3]) for(const list of ((pr<2&&(capN||capD))?byDay.map(l=>({l,o:rand()})).sort((a,b)=>a.o-b.o).map(x=>x.l):byDay)){
      const todo=list.filter(sl=>pri(sl)===pr&&!sl.ext&&!filled(sl));
      todo.forEach(sl=>sl.r=rand());
      todo.sort((a,b)=>(a.post.cover==="ECO")-(b.post.cover==="ECO")||(fill[a.key]||0)-(fill[b.key]||0)||a.r-b.r); /* RX prima di Eco (RX/Eco) */
      for(const sl of todo){ const r=pick(sl,pools(mo,sl.post,sl.s)[grp],cap); if(r){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; } } }
  /* regola prioritaria: chi ha segnato "tutta la giornata" viene inserito lo stesso se il turno resterebbe scoperto
     (ferie, congressi e indisponibilità di singoli turni restano vincolanti); si distribuisce tra chi è stato forzato meno */
  /* TC/RM dove c'è già un altro anno: si coprono dopo, con chi resta entro i turni ideali */
  for(const grp of ["pri","jol"]) for(const list of byDay){
    const todo=list.filter(sl=>sl.ext&&!filled(sl)); todo.forEach(sl=>sl.r=rand()); todo.sort((a,b)=>(fill[a.key]||0)-(fill[b.key]||0)||a.r-b.r);
    for(const sl of todo){ const r=pick(sl,pools(mo,sl.post,sl.s)[grp],soft,false,fair); if(r){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; } } }
  for(const grp of ["pri","jol"]) for(const sl of slots){ if(sl.ext||filled(sl)) continue;
    const r=pick(sl,pools(mo,sl.post,sl.s)[grp],maxCap,true); if(r){ put(sl,r); st[r.id].g=(st[r.id].g||0)+1; } }
  /* chi è in rotazione TC/RM ed è libero (entro i turni ideali) va comunque in TC/RM come persona in più, nella sala meno affollata */
  const ours=(d,k)=>(sched[d][k]||[]).filter(x=>x).length, cnt=(d,k)=>ours(d,k)+othersIn(mo,d,k), Y=curYear();
  byDay.forEach(list=>{ if(!list.length) return; const {d,i,w,t}=list[0]; if(t==="fes") return;
    const people=S.residents.filter(r=>inGem(mo,r.id)&&(!only2||only2.has(r.id))).map(r=>({r,o:rand()})).sort((a,b)=>a.o-b.o).map(x=>x.r);
    for(const r of people){ const rot=mo.rot[r.id], p=st[r.id]; if(fair&&p.tot>=fair) continue;
      const posts=(rot==="TC"||rot==="RM")?S.posts.filter(x=>x.cover===rot&&postActive(x)):[]; if(!posts.length) continue;
      /* prima le sale vuote, poi le meno affollate; a parità si bilancia mattina/pomeriggio e la sala */
      const opts=[]; for(const sh of ["M","P"]){ if(!ok(mo,p,r.id,d,sh,w,soft)) continue;
        posts.forEach(x=>{ const k=x.id+"|"+sh; if(!multiPost(x,sh)||!(x.on[t]||[]).includes(sh)||!sched[d][k]||isClosed(mo,d,k)) return; const c=cnt(d,k), o=ours(d,k);
          if(c>=capOf(x,sh).max||(o>0&&!sameYearOk(Y))) return; opts.push({post:x,sh,c,o,mp:p[sh]-p[sh==="M"?"P":"M"],pc:p.pc[x.id]||0}); }); }
      if(!opts.length) continue; opts.sort((a,b)=>(a.o>0)-(b.o>0)||a.c-b.c||a.mp-b.mp||a.pc-b.pc);
      const {post,sh}=opts[0], key=post.id+"|"+sh; put({d,i,w,t,post,s:sh,key},r); } });
  const at=new Date().toISOString(); mo.draft={sched,at,acc:{}}; UI.draftView=true; if(only){ mo.weeksGen=mo.weeksGen||{}; mo.weeksGen[wk]=at; }
}
/* ridistribuzione nelle sale della stessa metodica (TC, RM): per ogni giorno e turno, finché una sala ha almeno 2 persone
   più di un'altra si sposta una persona, preferendo i più giovani (1°, poi 2°, 3°, 4° anno). Si spostano solo i turni che
   si possono modificare: dell'anno che si guarda; con più anni attivo, il proprietario anche quelli degli altri anni.
   I turni fissi (inseriti a mano) non si spostano. */
function rebalanceRooms(mk,onlyPids,onlyCover,from){ const days=period(mk).days, sch={}, posts={}, fixedOf={}, mon={}, Ys=MULTI?YRS(mk):[CURY];
  for(const y of Ys){ const st=y===CURY?S:yState(y); if(!st) continue; const m=(st.months||{})[mk]; if(!m) continue; const src=(m.draft&&m.draft.sched)||m.sched; if(!src) continue;
    sch[y]=y===CURY?src:JSON.parse(JSON.stringify(src)); fixedOf[y]=m.fixed||{}; mon[y]=st; posts[y]={};
    (st.posts||[]).forEach(p=>{ posts[y][normRoom(p.name)]=p; }); }
  const canMove=y=>y===CURY||(MULTI&&canMgr(y)), yearOf=y=>(y===CURY?curYear():yLab(y));
  const groups={}; S.posts.filter(p=>(p.cover==="TC"||p.cover==="RM")&&multiPost(p)&&(!onlyCover||p.cover===onlyCover||isJolly(onlyCover))).forEach(p=>{ (groups[p.cover]=groups[p.cover]||[]).push(normRoom(p.name)); });
  const sheetExt=MULTI?{}:(M(mk).ext||{});
  let moved=0; const changed=new Set();
  for(const d of days){ const t=dayType(d); if(t==="fes"||(from&&d<from)) continue;
    for(const sh of ["M","P"]) for(const g in groups){
      for(let guard=0;guard<12;guard++){
        const rooms=groups[g].filter(rn=>{ const p=posts[CURY]&&posts[CURY][rn]; return p&&((p.on||{})[t]||[]).includes(sh)&&!closedN(mk,d,rn,sh); }); if(rooms.length<2) break;
        const occ={}, tot={};
        rooms.forEach(rn=>{ occ[rn]=[]; for(const y in sch){ const p=posts[y][rn]; if(!p) continue; const key=p.id+"|"+sh, arr=((sch[y][d]||{})[key])||[];
            arr.forEach((pid,i)=>{ if(pid) occ[rn].push({y:+y,pid,key,i}); }); }
          const pc=posts[CURY][rn]; tot[rn]=occ[rn].length+((sheetExt[d+"|"+pc.id+"|"+sh])||[]).length; });
        const order=[...rooms].sort((a,b)=>tot[b]-tot[a]), A=order[0];
        const targets=[...rooms].sort((a,b)=>tot[a]-tot[b]);
        let done=false;
        for(const B of targets){ if(tot[A]-tot[B]<2) break; if(tot[B]>=capOf(posts[CURY][B],sh).max) continue;
          const cand=occ[A].filter(o=>{ if(onlyPids&&!(o.y===CURY&&onlyPids.has(o.pid))) return false; if(!canMove(o.y)||fixedOf[o.y][d+"|"+o.key+"|"+o.i]===o.pid) return false;
              const pb=posts[o.y][B]; if(!pb||!((pb.on||{})[t]||[]).includes(sh)||!(yearsFor(pb).includes(yearOf(o.y))||!MULTI)) return false;
              if(occ[B].some(x=>x.y===o.y)&&!sameYearOk(yearOf(o.y))) return false; return true; })
            .sort((a,b)=>yearOf(a.y)-yearOf(b.y));
          if(!cand.length) continue;
          const o=cand[0], pb=posts[o.y][B], kb=pb.id+"|"+sh, day=sch[o.y][d]=sch[o.y][d]||{};
          const arrA=day[o.key]; arrA.splice(o.i,1); if(!arrA.length) arrA.push(null);
          const fx=fixedOf[o.y], pre=d+"|"+o.key+"|"; Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>{ const j=+z.split("|").pop(); if(j>o.i){ fx[pre+(j-1)]=fx[z]; delete fx[z]; } });
          const arrB=day[kb]=day[kb]||[null]; if(!arrB[0]) arrB[0]=o.pid; else arrB.push(o.pid);
          moved++; changed.add(o.y); done=true; break; }
        if(!done) break; } } }
  /* altri anni (solo proprietario): si salva il loro orario */
  /* per gli altri anni le modifiche diventano una loro bozza: le accettano i loro rappresentanti */
  for(const y of changed){ if(y===CURY||!db) continue; const st=mon[y], months={...(st.months||{})}; months[mk]={...months[mk],draft:{...((months[mk]||{}).draft||{}),sched:sch[y],at:new Date().toISOString(),acc:{}}};
    saveYearMonths(y,months,[mk]).catch(()=>toast("Non riesco a salvare l'orario del "+y+"° anno")); }
  return moved; }
/* aggiorna: i turni già assegnati restano (fissi solo per questa generazione), si tolgono quelli in conflitto con indisponibilità/ferie/congressi e si ricopre il resto */
/* aggiorna solo da oggi alla fine del mese: i giorni passati restano come sono */
function refreshSched(mk,rot){ TICK++; const mo=M(mk), base0=hasDraft(mo)?mo.draft.sched:mo.sched; if(!base0) return {removed:0,added:0,covered:0,moved:0};
  const today=todayYmd(), pd=period(mk), from=today>pd.days[0]?today:null; if(from&&from>pd.days[pd.days.length-1]) return {removed:0,added:0,covered:0,moved:0,past:true};
  const inRot=rot?new Set(S.residents.filter(r=>mo.rot[r.id]===rot).map(r=>r.id)):null;
  const old=clone(base0), keep={}, fx=mo.fixed||{}; let removed=0, covered=0, wrong=0;
  for(const d in old) for(const k in old[d]) (old[d][k]||[]).forEach((pid,i)=>{ if(!pid) return;
    if(fx[d+"|"+k+"|"+i]===pid||(inRot&&!inRot.has(pid))||(from&&d<from)){ keep[d+"|"+k+"|"+i]=pid; return; }
    if(blocked(unavOf(mo,pid,d),k.split("|")[1])) removed++;
    /* fuori dalla propria rotazione (non inserito a mano): si toglie e si ricopre con chi è nella rotazione */
    else if(outOfRot(mo,pid,k)) wrong++;
    /* turno ora coperto da un altro anno (DEA, Angio, notti, guardie): si libera e il carico si ridistribuisce */
    else if(extCovered(mo,d,k)) covered++;
    else keep[d+"|"+k+"|"+i]=pid; });
  const saved=mo.fixed, wg=mo.weeksGen; mo.fixed={...keep,...(saved||{})};
  try{ generate(mk,undefined,inRot,from); } finally { mo.fixed=saved||{}; mo.weeksGen=wg; }
  let added=0; const nw=mo.draft.sched; for(const d in nw) for(const k in nw[d]){ const before=(old[d]||{})[k]||[];
    (nw[d][k]||[]).forEach(pid=>{ if(pid&&!before.includes(pid)) added++; }); }
  const moved=rebalanceRooms(mk,inRot,rot,from);
  return {removed,added,covered,moved,wrong}; }
function outOfRot(mo,pid,key){ const [id,s]=key.split("|"), post=postOf(id); if(!post||!postActive(post)) return false; const cov=covOf(post,s), rot=mo.rot[pid];
  return cov!=="ALL"&&!isBG(rot)&&!rotCovers(rot,cov)&&!(isJolly(rot)&&(cov==="TC"||cov==="RM")); }
function derive(mk,override){
  const mo=M(mk), {days}=period(mk), per={}; S.residents.forEach(r=>per[r.id]=newStat());
  const holes=[], issues=[], where={}, SC=override||effSched(mk);
  if(!SC) return {per,holes,issues,where};
  days.forEach((d,i)=>{const w=Math.floor(i/7),t=dayType(d);
    slotsWith(d,SC[d]).forEach(({post,s,key,extra})=>{ const arr=(SC[d]||{})[key]||[null];
      if(!extra){
      if(arr.some(x=>x)&&isClosed(mo,d,key)) issues.push(`${post.name} ${SHN[s].toLowerCase()} il ${fmt(d)}: sala chiusa ma con ${arr.filter(x=>x).map(resName).join(", ")}`);
      { const nd=myNeed(mo,d,key).need, oc=arr.filter(x=>x).length; if(oc<nd&&!isClosed(mo,d,key)) holes.push({d,post:post.name,s,n:nd-oc}); }
      { const c=capOf(post,s), oc=arr.filter(x=>x).length, oth=othersIn(mo,d,key); if(oc&&oc+oth>c.max) issues.push(`${post.name} ${SHN[s].toLowerCase()} il ${fmt(d)}: ${oc+oth} persone (massimo ${c.max})`); }
      if((post.cover==="TC"||post.cover==="RM")&&multiPost(post,s)){ const o=arr.filter(x=>x); if(o.length>1) issues.push(`${post.name} ${SHN[s].toLowerCase()} il ${fmt(d)}: ${o.length} dello stesso anno (${o.map(resName).join(", ")})${sameYearOk(curYear())?"":" — non previsto per questo anno"}`);
      } }
      arr.forEach(pid=>{ if(!pid) return; const p=per[pid]; if(!p)return;
        if(p.on[d]) issues.push(`${resName(pid)}: ${p.on[d]==="N"||s==="N"?"lavora di giorno il "+fmt(d)+", giorno di monto":"due turni il "+fmt(d)}`);
        p.on[d]=s; where[pid+"|"+d]=post.name; p.pc[post.name]=(p.pc[post.name]||0)+1; p.tot++; p[s]++; if(t!=="fer")p.we++; if(t==="sab")p.sab=(p.sab||0)+1; if(t==="fes")p.fes=(p.fes||0)+1; p.wk[w]=(p.wk[w]||0)+1; if(s==="N")p.wn[w]=(p.wn[w]||0)+1;
        if(!canDo(pid,s)) issues.push(`${resName(pid)}: ${s==="N"?"notte":"guardia"} il ${fmt(d)}, ma non è abilitato/a ${s==="N"?"alle notti":"alle guardie"}`);
        {const u=unavOf(mo,pid,d); if(blocked(u,s)) issues.push(`${resName(pid)}: ${u==="F"?"in ferie":u==="C"?"a congresso":u==="G"?"indisponibile tutto il giorno, inserito perché il turno sarebbe rimasto scoperto,":"indisponibile"} ${fmt(d)} (${SHN[s]})`);}
        const rot=mo.rot[pid];
        if(isExt(rot)&&!isBG(rot)) issues.push(`${resName(pid)}: in turno il ${fmt(d)} ma è ${rot?"a "+rotName(rot):"senza rotazione"}`);
        else if(!extra&&!isBG(rot)&&covOf(post,s)!=="ALL"&&!rotCovers(rot,covOf(post,s))&&!(isJolly(rot)&&(covOf(post,s)==="TC"||covOf(post,s)==="RM"))) issues.push(`${resName(pid)}: in ${post.name} il ${fmt(d)} ma la rotazione è ${rotName(rot)}`);
      }); }); });
  { const PRF=PR(mk); for(const pid in PRF){ if(!per[pid]||!canPref(pid)) continue; for(const d in PRF[pid]){ const code=PRF[pid][d]; if(!code||!days.includes(d)) continue;
      const [pp,sh]=code.includes("|")?code.split("|"):[null,code]; const okk=Object.entries(SC[d]||{}).some(([k,a])=>a.includes(pid)&&k.endsWith("|"+sh)&&(!pp||k.startsWith(pp+"|")));
      if(!okk) issues.push(`${resName(pid)}: preferenza non rispettata il ${fmt(d)} (${pp?esc((postOf(pp)||{}).name||pp)+" ":""}${SHN[sh]})`); } } }
  for(const pid in per){ const p=per[pid];
    for(const d in p.on){ if(p.on[d]==="N" && p.on[add(d,1)]) issues.push(`${resName(pid)}: lavora il ${fmt(add(d,1))}, giorno di smonto`); }
    for(const w in p.wk){ if(p.wk[w]>S.maxWeek) issues.push(`${resName(pid)}: ${p.wk[w]} turni nella settimana ${+w+1} (max ${S.maxWeek})`); }
    for(const w in p.wn){ if(p.wn[w]>S.maxNightsWeek) issues.push(`${resName(pid)}: ${p.wn[w]} notti nella settimana ${+w+1} (max ${S.maxNightsWeek})`); }
  }
  return {per,holes,issues:[...new Set(issues)],where};
}
/* colonne: sale/turni presenti nell'orario + quelle attive per l'anno anche se non ancora generate (es. sale aggiunte dopo) */
function columns(SC,p){ const cols=[]; S.posts.forEach(post=>SH.forEach(s=>{ const k=post.id+"|"+s;
  const ex=ADMIN()&&S.months[UI.mk]?EXT(M(UI.mk)):{};
  if(p.days.some(d=>(SC[d]||{})[k])||(postActive(post)&&p.days.some(d=>((post.on||{})[dayType(d)]||[]).includes(s)))||p.days.some(d=>ex[d+"|"+k])) cols.push({post,s,k}); })); return cols; }

/* ---------- cambi turno ---------- */
/* orario effettivo = turni generati + cambi accettati non ancora consolidati dal rappresentante */
const SWMARK={};
function swapsOf(mk){ return Object.values(SW).filter(x=>x.mk===mk).sort((a,b)=>(a.decided||a.created||"").localeCompare(b.decided||b.created||"")); }
function applySwap(sc,x){ const A=(sc[x.a.d]||{})[x.a.k]; if(!A) return false; const ia=A.indexOf(x.from); if(ia<0) return false;
  if(x.b){ const B=(sc[x.b.d]||{})[x.b.k]; if(!B) return false; const ib=B.indexOf(x.to); if(ib<0) return false; B[ib]=x.from; }
  A[ia]=x.to;
  for(const e of (x.extra||[])){ const E=(sc[e.d]||{})[e.k]; if(!E) return false; const ie=E.indexOf(e.giver); if(ie<0) return false; E[ie]=e.taker; }
  return true; }
/* turni che entrano in conflitto con una notte che cambia di mano (giorno stesso e giorno dopo): si propone di scambiarli */
function nightLinks(mk,x){ const base=effSched(mk); if(!base) return []; const sc=clone(base); const y={...x,extra:[]}; if(!applySwap(sc,y)) return [];
  const moves=[]; if(x.a.k.endsWith("|N")) moves.push({d:x.a.d,taker:x.to,other:x.from}); if(x.b&&x.b.k.endsWith("|N")) moves.push({d:x.b.d,taker:x.from,other:x.to});
  const out=[];
  for(const m of moves) for(const day of [m.d,add(m.d,1)])
    for(const z of shiftsOf(sc,m.taker)) if(z.d===day&&!(z.d===m.d&&z.k.endsWith("|N"))) out.push({d:z.d,k:z.k,giver:m.taker,taker:m.other,night:m.d,same:day===m.d});
  return out; }
function effSched(mk){ const mo=M(mk); if(!mo.sched||(!mo.generated&&!ADMIN())) return null; const sc=clone(mo.sched), mark=new Set();
  for(const x of swapsOf(mk)){ if(x.status!=="accepted") continue;
    if(!x.applied) applySwap(sc,x);
    for(const e of (x.extra||[])) if(((sc[e.d]||{})[e.k]||[]).includes(e.taker)) mark.add(e.d+"|"+e.k);
    if(((sc[x.a.d]||{})[x.a.k]||[]).includes(x.to)) mark.add(x.a.d+"|"+x.a.k);
    if(x.b&&((sc[x.b.d]||{})[x.b.k]||[]).includes(x.from)) mark.add(x.b.d+"|"+x.b.k); }
  SWMARK[mk]=mark; return sc; }
function shiftsOf(sc,pid){ const out=[]; for(const d of Object.keys(sc||{}).sort()) for(const k in sc[d]) if((sc[d][k]||[]).includes(pid)) out.push({d,k}); return out; }
function slotLabel(x){ const [pid,s]=x.k.split("|"), post=postOf(pid); return `${fmt(x.d)} · ${post?esc(post.name):"?"} ${SHN[s]}`; }
/* problemi di una persona in un orario (testi brevi, senza nome) */
function personIssues(mk,sc,pid){ const mo=M(mk), {days}=period(mk), out=[], on={}, wk={}, wn={};
  days.forEach((d,i)=>{ const w=Math.floor(i/7);
    for(const k in (sc[d]||{})) if((sc[d][k]||[]).includes(pid)){ const [postId,s]=k.split("|"), post=postOf(postId);
      (on[d]=on[d]||[]).push(s); wk[w]=(wk[w]||0)+1; if(s==="N") wn[w]=(wn[w]||0)+1;
      const u=unavOf(mo,pid,d);
      if(!canDo(pid,s)) out.push(`${s==="N"?"notte":"guardia"} il ${fmt(d)}, ma non è abilitato/a ${s==="N"?"alle notti":"alle guardie"}`);
      if(blocked(u,s)) out.push(u==="F"?`lavora durante le ferie: ${fmt(d)} (${SHN[s]})`:u==="C"?`lavora durante il congresso: ${fmt(d)} (${SHN[s]})`:`indisponibilità non rispettata: ${fmt(d)} (${SHN[s]})`);
      if(post){ const cov=covOf(post,s), rot=mo.rot[pid]; if(cov!=="ALL"&&!rotCovers(rot,cov)&&!isBG(rot)&&!(isJolly(rot)&&(cov==="TC"||cov==="RM"))) out.push(`copre ${esc(post.name)} il ${fmt(d)}, fuori dalla sua rotazione (${esc(rotName(rot))})`); } } });
  for(const d in on){ if(on[d].length>1) out.push(on[d].includes("N")?`lavora di giorno il ${fmt(d)}, giorno di monto (ha la notte)`:`doppio turno il ${fmt(d)} (${on[d].map(s=>SHN[s]).join(" + ")})`);
    if(on[d].includes("N")&&on[add(d,1)]) out.push(`lavora il ${fmt(add(d,1))}, giorno di smonto`); }
  for(const w in wk) if(wk[w]>S.maxWeek) out.push(`${wk[w]} turni nella settimana dal ${fmt(period(mk).days[w*7])} (max ${S.maxWeek})`);
  for(const w in wn) if(wn[w]>S.maxNightsWeek) out.push(`${wn[w]} notti nella settimana dal ${fmt(period(mk).days[w*7])} (max ${S.maxNightsWeek})`);
  return out; }
function swapWarnings(mk,x){ if(!swapDateOk(x)) return {ok:false,old:true}; const before=effSched(mk); if(!before) return {ok:false};
  const after=clone(before); if(!applySwap(after,x)) return {ok:false};
  const diff=pid=>{ const b=new Set(personIssues(mk,before,pid)); return personIssues(mk,after,pid).filter(t=>!b.has(t)); };
  const free=pid=>{ const dB=new Set(shiftsOf(before,pid).map(y=>y.d)), dA=new Set(shiftsOf(after,pid).map(y=>y.d));
    const sm=(sc,d)=>shiftsOf(sc,pid).some(y=>y.d===add(d,-1)&&y.k.endsWith("|N"));
    const g=[...dB].filter(d=>!dA.has(d)).sort();
    return {gain:g.filter(d=>!sm(after,d)).map(d=>fmt(d)), smonto:g.filter(d=>sm(after,d)).map(d=>[fmt(d),fmt(add(d,-1))]),
            lose:[...dA].filter(d=>!dB.has(d)).sort().map(d=>fmt(d))}; };
  /* postazioni che con il cambio restano senza nessuno */
  const cells=[x.a,...(x.b?[x.b]:[]),...(x.extra||[])], seen=new Set(), holes=[];
  for(const c of cells){ const key=c.d+"|"+c.k; if(seen.has(key)) continue; seen.add(key);
    const empty=sc=>!(((sc[c.d]||{})[c.k])||[]).some(v=>v)&&!roomCovered(M(mk),c.d,c.k);
    if(empty(after)&&!empty(before)) holes.push(`${slotLabel({d:c.d,k:c.k})} rimane scoperto`); }
  return {ok:true, holes, from:diff(x.from), to:x.to?diff(x.to):[], freeFrom:free(x.from), freeTo:x.to?free(x.to):{gain:[],smonto:[],lose:[]}}; }
function freeBox(rows){ const li=[];
  for(const [who,f] of rows){ f.gain.forEach(d=>li.push(`<li><strong>${who}</strong>: giorno libero il ${d}</li>`)); (f.smonto||[]).forEach(([d,n])=>li.push(`<li><strong>${who}</strong>: il ${d} non lavori, ma è lo smonto della notte del ${n}: non è un giorno libero</li>`)); f.lose.forEach(d=>li.push(`<li><strong>${who}</strong>: lavori il ${d}, che prima era libero</li>`)); }
  return `<div class="alerts" style="background:var(--accent-soft)"><strong>Giorni liberi</strong>${li.length?`<ul>${li.join("")}</ul>`:`<span style="font-size:.88rem">Il cambio non cambia i giorni liberi: si scambiano turni nello stesso giorno.</span>`}</div>`; }
function myPid(){ if(!MYUID||!S) return null; for(const pid in CLAIMS) if(CLAIMS[pid]===MYUID&&S.residents.some(r=>r.id===pid)) return pid; return null; }

/* ---------- render ---------- */
const app=document.getElementById("app");
/* cambiando mese si resta sulla propria coorte; se in quel mese non c'è (es. il nuovo 1° anno in ottobre) si passa allo stesso anno di corso */
function goMonth(nk){ const lvl=yLab(CURY); UI.mk=nk; if(MULTI&&!YRS(nk).includes(CURY)){ const c=Math.min(4,Math.max(1,lvl))-yShift(nk); if(!switchYear(c)) return; } render(); }
function yearBar(){ if(!MULTI) return ""; return `<div class="pickers" style="margin-bottom:2px">${YRS(UI.mk).map(y=>{ const l=yLab(y); return `<button data-act="year" data-v="${y}" aria-pressed="${y===CURY}">${l<1?"nuovo anno":l>4?"specializzati":l+"° anno"}</button>`; }).join("")}</div>`; }
function switchYear(y){ if(!db||y===CURY||!REBUILD) return true; if(saveT||saving){ toast("Attendi il salvataggio e riprova"); return false; }
  if(RAW[y]&&RAW[y].cfg===null&&!OWNER){ toast("Questo anno non è ancora stato creato dal proprietario"); return false; }
  CURY=y; docRef=db.doc(yDocs(y).mon); cfgRef=db.doc(yDocs(y).cfg); S=null; PRUNED=false; AUTOSYNC=false; SALIGN=false; SEXC.key=null; UI.who=null; UI.sel=null; UI.confirm=null; EXTC.key=null; LOWC.key=null;
  try{ localStorage.setItem("turni.year",String(y)); }catch(e){}
  REBUILD(); if(!S) render(); return true; }
/* all'avvio con più anni: si apre l'anno di chi entra (una volta) */
function autoYear(){ if(!MULTI||YAUTO||!MYUID) return; const pid=Object.keys(CLAIMS).find(p=>CLAIMS[p]===MYUID);
  let y=pid?yearOfPid(pid):null; if(!y){ try{ y=+localStorage.getItem("turni.year")||null; }catch(e){} }
  if(pid&&!y) return; /* dati degli anni non ancora arrivati */
  YAUTO=true; if(y&&ALLY().includes(y)&&y!==CURY) switchYear(y); }
/* nomi per anno ricavati dal foglio "Elenco Spec" (anno accademico 2026/27: (2)→3°, (3)→4°) */
const YSEED={1:[],3:["Alcini","Avenoso","Battistella","Breccia","Capone","De Blasi","De Filippis","Del Prete","Della Valle","Di Certo","Kosta","Marino","Mastrodonato","Monterisi","Pica","Pozzebon","Quarta G.","Quatrale","Seri","Sparagna","Spinilli","Tancredi","Tomassetti","Trogu","Villa"],
  /* 4° anno di ottobre 2026 (escono a novembre) */
  5:["Bianco","Bottalico","Brancasi","Farina","Ferrara","Ferravante","Friscia","Iacono","Lippi","Marchetti","Mazzon","Morelli","Nardini","Papalia","Patrucco","Rubino","Sabato","Schiavo","Sciaccotta","Scrocca"],
  4:["Ariano","Azzaro","Cerquiglini","Chianura","Cigliese","Collura","Corinto","D'Aniello","Di Maio","Ferrari","Fiorillo","Gulotta","Imbemba","Isufi","Lia","Marzano","Morettoni","Napoletano","Parisi","Pentassuglia","Quarta A.","Sama","Villone","Zhang"]};
/* crea i documenti delle coorti che servono nei mesi visibili (es. a novembre il nuovo 1° anno, vuoto) */
let COHORTS_BUSY=false;
async function ensureCohorts(){ if(!OWNER||!db||!MULTI||COHORTS_BUSY) return; COHORTS_BUSY=true; try{
  const st2=yState(2); if(!st2) return; const {months,...base}=st2; const miss=ALLY().filter(c=>c!==2&&RAW[c]&&RAW[c].cfg===null);
  for(const y of miss) await createCohort(y,base); } finally { COHORTS_BUSY=false; } }
async function createCohort(y,base){ const snap=await db.doc(yDocs(y).cfg).get(); if(snap.exists) return;
    const residents=(YSEED[y]||[]).map(n=>({id:uid(),name:n,year:y})); sortRes(residents);
    const cfg={...base,residents,managers:[],groupYear:y}; delete cfg.multiYear; delete cfg.extSheetUrl;
    if(y===4) cfg.externals=[...(cfg.externals||[]),{id:"SE",name:"Sede Esterna"}]; if(y===3) cfg.externals=[...(cfg.externals||[]),{id:"IT",name:"Isola Tiberina"}];
    const at=new Date().toISOString();
    await db.doc(yDocs(y).cfg).set({state:JSON.stringify(cfg),updated:at}); await db.doc(yDocs(y).mon).set({state:JSON.stringify({months:{}}),updated:at}); }
async function enableYears(){ if(!OWNER||!db||CURY!==2) return; const base=JSON.parse(splitS().cfg);
  for(const y of ALLY()){ if(y===2) continue; await createCohort(y,base); }
  S.multiYear=true; persist(); }
/* "Turni" è uguale per tutti (come lo vede uno specializzando: orario pubblicato, sola lettura); i rappresentanti modificano in "Modifica turni" */
function asResident(fn){ const u=UI.userMode, sel=UI.clsel; UI.userMode=true; UI.clsel=null; try{ return fn(); } finally{ UI.userMode=u; UI.clsel=sel; } }
/* aggiornamento della pagina "a pezzi": si cambia solo ciò che è diverso dal disegno precedente (più veloce, niente salti) */
function morph(target,html){ const tpl=document.createElement("template"); tpl.innerHTML=html; morphKids(target,tpl.content); }
function morphKids(a,b){ const an=[...a.childNodes], bn=[...b.childNodes], n=Math.max(an.length,bn.length);
  for(let i=0;i<n;i++){ const x=an[i], y=bn[i]; if(!x){ a.appendChild(y); continue; } if(!y){ x.remove(); continue; } morphNode(x,y); } }
function morphNode(x,y){ if(x.nodeType!==y.nodeType||x.nodeName!==y.nodeName){ x.replaceWith(y); return; }
  if(x.nodeType!==1){ if(x.nodeValue!==y.nodeValue) x.nodeValue=y.nodeValue; return; }
  if(x.isEqualNode(y)) return;
  for(const at of [...x.attributes]) if(!y.hasAttribute(at.name)) x.removeAttribute(at.name);
  for(const at of [...y.attributes]) if(x.getAttribute(at.name)!==at.value) x.setAttribute(at.name,at.value);
  if(x.nodeName==="SELECT"){ morphKids(x,y); const so=[...y.querySelectorAll("option")].find(o=>o.hasAttribute("selected")); const v=so?so.value:(y.querySelector("option")||{}).value; if(v!==undefined&&x.value!==v) x.value=v; return; }
  if(x.nodeName==="INPUT"||x.nodeName==="TEXTAREA"){ if(x.type==="checkbox"||x.type==="radio") x.checked=y.hasAttribute("checked"); else if(x.type!=="file"&&document.activeElement!==x){ const v=y.getAttribute("value")??(x.nodeName==="TEXTAREA"?y.textContent:""); if(x.value!==v) x.value=v; } if(x.nodeName==="INPUT") return; }
  morphKids(x,y); }
function render(){ TICK++;
  if(UI.userMode&&S&&MYUID&&Object.keys(CLAIMS).length&&!realAdmin()) setUserMode(false);
  if((!ADMIN()&&(UI.tab==="mese"||(UI.tab==="imp"&&!UI.userMode)))||(UI.tab==="modturni"&&!ADMIN()&&!anyMgr())) UI.tab="turni";
  document.querySelectorAll("#tabs button").forEach(b=>{b.setAttribute("aria-selected",b.dataset.tab===UI.tab); b.hidden=(b.dataset.tab==="modturni")?!(ADMIN()||anyMgr()):!ADMIN()&&(b.dataset.tab==="mese"||(b.dataset.tab==="imp"&&!UI.userMode));});
  if(!S){app.innerHTML=`<div class="empty">Caricamento dati…</div>`;return;}
  { const cb=document.querySelector('#tabs [data-tab="cambi"]'); if(cb){ let n=0; try{ n=new Set(myChanges().list.map(c=>c.d)).size; }catch(e){} cb.textContent=n?`Cambi (${n})`:"Cambi"; } }
  const yLoaded=!MULTI||ALLY().every(y=>yState(y)||(RAW[y]&&RAW[y].cfg===null));
  const needLink=db&&MYUID&&yLoaded&&(MULTI||S.residents.length)&&!myAnyPid();
  if(needLink&&!OWNER){ app.innerHTML=`<section class="view">${claimPanel("")}</section>`; return; }
  /* la tabella "Per giorno" scorre dentro il suo riquadro: dopo ogni aggiornamento resta dove era (es. selezionando più caselle) */
  const rk=UI.tab+"|"+UI.mk+"|"+UI.view+"|"+CURY+"|"+JSON.stringify((UI.dayWk||{})[UI.mk]), tw=app.querySelector(".scroll.tall"), keep=tw&&render.rk===rk?{t:tw.scrollTop,l:tw.scrollLeft,y:window.scrollY}:null; render.rk=rk;
  morph(app,`<section class="view">${todayBanner()}${yearBar()}${needLink?linkPanel():""}${({mese:vMese,indisp:vIndisp,turni:()=>ADMIN()?asResident(vTurni):vTurni(),modturni:vTurni,cambi:vCambi,imp:vImp}[UI.tab]||vMese)()}</section>`);
  { const nw=app.querySelector(".scroll.tall"); if(keep){ if(nw){ nw.scrollTop=keep.t; nw.scrollLeft=keep.l; } if(Math.abs(window.scrollY-keep.y)>2) window.scrollTo(0,keep.y); } else if(nw&&tw){ nw.scrollTop=0; nw.scrollLeft=0; } }
}
/* banner in alto: il turno di oggi e di domani di chi ha un nome associato (orario pubblicato, con i cambi accettati) */
function mkOfDay(d){ const [y,m]=d.split("-").map(Number); for(const dm of [0,1,-1]){ const mk=mkOf(y,m+dm), p=period(mk); if(d>=p.first&&d<=p.last) return mk; } return null; }
function dayInfo(pid,d){ const mk=mkOfDay(d); if(!mk) return null; const own=S.residents.some(r=>r.id===pid), st=own?S:yState(yearOfPid(pid)); if(!st) return null;
  const mo=(st.months||{})[mk]; if(!mo||!mo.sched||!mo.generated) return {txt:"orario non ancora pubblicato",cls:""};
  const sc=own?(effSched(mk)||mo.sched):mo.sched, find=dd=>{ for(const k in (sc[dd]||{})) if((sc[dd][k]||[]).includes(pid)) return k; return null; };
  const k=find(d); if(k){ const [postId,sh]=k.split("|"), post=(st.posts||[]).find(x=>x.id===postId); return {txt:sh==="N"?`Notte ${esc(S.hours.N)}`:sh==="D"?`Guardia ${esc(S.hours.D)} (${esc(post?post.name:"DEA")})`:`${esc(post?post.name:postId)} · ${SHN[sh]} ${esc(S.hours[sh])}`,cls:"sh-"+sh}; }
  const pk=find(add(d,-1)); if(pk&&pk.split("|")[1]==="N") return {txt:"Smonto",cls:""};
  const u=((own&&S.months[mk]&&S.months[mk].unav)||{})[pid]; const c=u&&u[d]; if(c==="F") return {txt:"Ferie",cls:""}; if(c==="C") return {txt:"Congresso",cls:""};
  return {txt:"Libero",cls:""}; }
function todayBanner(){ const pid=myAnyPid(); if(!pid) return ""; const t=new Date(), today=ymd(new Date(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()))), tom=add(today,1);
  const a=dayInfo(pid,today), b=dayInfo(pid,tom); if(!a&&!b) return "";
  const cell=(lab,d,x)=>`<div style="flex:1;min-width:140px"><span class="muted" style="font-size:.78rem">${lab} · ${fmt(d)}</span><div class="name-strong">${x?(x.cls?`<span class="chip ${x.cls}">${x.txt}</span>`:x.txt):"—"}</div></div>`;
  return `<div class="panel" style="flex-direction:row;flex-wrap:wrap;gap:10px;padding:10px 14px;margin-bottom:10px">${cell("Oggi",today,a)}${cell("Domani",tom,b)}</div>`; }
function todayYmd(){ const t=new Date(); return ymd(new Date(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()))); }
/* cambi: solo turni futuri o al massimo di 3 giorni fa */
const SWAP_BACK=3;
function swapMinDay(){ return add(todayYmd(),-SWAP_BACK); }
function swapDateOk(x){ const m=swapMinDay(); return !!x&&!!x.a&&x.a.d>=m&&(!x.b||x.b.d>=m)&&(x.extra||[]).every(e=>e.d>=m); }
/* mese il cui periodo (primo lunedì → ultima domenica) contiene la data di oggi */
/* all'apertura l'app parte dal mese corrente (quello il cui periodo contiene oggi) */
function todayMk(){ const t=new Date(), today=ymd(new Date(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())));
  for(const dm of [0,1,-1]){ const mk=mkOf(t.getFullYear(),t.getMonth()+1+dm), p=period(mk); if(today>=p.first&&today<=p.last) return mk; }
  return mkOf(t.getFullYear(),t.getMonth()+1); }
/* si vedono i turni e le indisponibilità fino a 3 mesi prima del mese corrente; i mesi più vecchi vengono archiviati */
const KEEP_MONTHS=3;
function oldestMk(){ const [y,m]=todayMk().split("-").map(Number); return mkOf(y,m-KEEP_MONTHS); }
function newestMk(){ const [y,m]=todayMk().split("-").map(Number); return mkOf(y,m+KEEP_MONTHS); }
function clampMk(mk){ return mk<oldestMk()?oldestMk():mk>newestMk()?newestMk():mk; }
let PRUNED=false;
/* il mese si toglie dal documento solo dopo averne salvato una copia nello storico (se la copia non riesce resta dov'è) */
async function pruneOld(){ if(PRUNED||!db||!S||!ADMIN()) return; PRUNED=true; const cut=oldestMk(), y=CURY, st=S; let n=0;
  /* mesi salvati per documento: quelli appena usciti dai 7 visibili vanno nello storico e il loro documento si cancella */
  if(MSPLIT[y]){ const [cy,cm]=cut.split("-").map(Number); for(let k=1;k<=3;k++){ const mk=mkOf(cy,cm-k);
      try{ const sn=await db.doc(monPath(y,mk)).get(); if(!sn.exists) continue; const m=JSON.parse(sn.data().state||"{}");
        if(m&&(m.sched||m.draft)) await db.collection(`hist/y${y}_${mk}/v`).doc().set({mk,kind:"Archivio (mese chiuso)",by:"automatico",at:new Date().toISOString(),
          state:JSON.stringify({sched:m.sched||null,draft:m.draft||null,fixed:m.fixed||{},ext:m.ext||{},rot:m.rot||{}})});
        await db.doc(monPath(y,mk)).delete(); }catch(e){} } }
  for(const mk of Object.keys(st.months||{})){ if(mk>=cut) continue; const m=st.months[mk];
    try{ if(m&&(m.sched||m.draft)) await db.collection(`hist/y${y}_${mk}/v`).doc().set({mk,kind:"Archivio (mese chiuso)",by:"automatico",at:new Date().toISOString(),
        state:JSON.stringify({sched:m.sched||null,draft:m.draft||null,fixed:m.fixed||{},ext:m.ext||{},rot:m.rot||{}})});
      if(S!==st) return; delete st.months[mk]; n++; }catch(e){} }
  if(n) persist(); }
function monthBar(){ if(UI.mk!==clampMk(UI.mk)) UI.mk=clampMk(UI.mk); const p=period(UI.mk), tm=todayMk();
  return `<div class="monthbar"><button class="btn icon" data-act="mprev" aria-label="Mese precedente" ${UI.mk<=oldestMk()?"disabled":""}>‹</button>
  <span class="name">${monthName(UI.mk)}</span><button class="btn icon" data-act="mnext" aria-label="Mese successivo" ${UI.mk>=newestMk()?"disabled":""}>›</button>
  ${UI.mk!==tm?`<button class="btn" data-act="mtoday">Oggi</button>`:`<span class="chip">mese corrente</span>`}
  <span class="period">${fmt(p.first)} → ${fmt(p.last)} · ${p.days.length/7} settimane</span></div>`; }
function noRes(){return `<div class="panel empty"><h2>Nessuno specializzando</h2><p>Aggiungi i nomi in Impostazioni, poi assegna a ciascuno la rotazione del mese.</p><button class="btn primary" data-act="goto" data-tab="imp">Vai a Impostazioni</button></div>`;}

function vMese(){ if(!S.residents.length) return monthBar()+noRes();
  const mo=M(UI.mk), opts=[...S.rotations,...S.externals];
  const count={}; S.residents.forEach(r=>{const k=mo.rot[r.id]||"";count[k]=(count[k]||0)+1;});
  return monthBar()+`
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>Rotazione del mese</h2>
   <div class="row">${opts.map(o=>`<span class="chip">${esc(o.name)} ${count[o.id]||0}</span>`).join("")}</div></div>
   <p class="muted" style="margin:0;font-size:.85rem">Ogni sala è coperta da chi è nella sua rotazione (TC1–4, RM1–5, DEA, Angio 1–2); ${S.rotations.filter(r=>r.jolly).map(r=>esc(r.name)).join(" e ")||"nessuno"} riempie le sale TC e RM scoperte. Notte e Guardia domenica sono turni della sala DEA ma li fanno tutti, tranne chi è fuori sede. Nei mesi nuovi la rotazione viene copiata dal mese precedente.</p>
   <div class="list">${S.residents.map(r=>`<div class="rotrow"><span class="name-strong">${esc(rName(r))}</span>
     <select id="rot-${r.id}" data-rot="${r.id}"><option value="">— non assegnato —</option>${opts.map(o=>`<option value="${o.id}" ${mo.rot[r.id]===o.id?"selected":""}>${esc(o.name)}</option>`).join("")}</select>
</div>`).join("")}</div>
  </div>${presenceBox(presence(UI.mk))}`; }

function vIndisp(){ if(!S.residents.length) return monthBar()+noRes();
  const mo=M(UI.mk), p=period(UI.mk), me=myPid(); let mode=UI.umode||"T"; if(mode==="R"&&!S.residents.some(r=>canPref(r.id))) mode=UI.umode="T";
  if(!OWNER&&db){ if(!MYUID) return monthBar()+`<div class="panel"><h2>Accedi con il tuo account</h2><p class="muted" style="margin:0">Per compilare le tue indisponibilità accedi con la tua email.</p></div>`;
    if(!me&&!myAnyPid()) return monthBar()+claimPanel("Tocca il tuo nome per collegarlo al tuo account. Serve una volta sola: dopo potrai modificare solo le tue indisponibilità, ferie e congressi."); }
  const otherYear=!OWNER&&db&&!me&&!!myAnyPid();
  if(!OWNER&&me&&(!UI.selTouched||(HIDEUNAV&&!ADMIN()))) UI.sel=me;
  if(!UI.sel||!S.residents.find(r=>r.id===UI.sel)) UI.sel=S.residents[0].id;
  const ro=db&&!canEditUnav(UI.sel), dl=unavDeadline(UI.mk), closed=todayIso()>dl;
  const dlBox=`<div class="${closed?"alerts":"okline"}" style="${closed?"":"font-weight:500;color:var(--muted)"}">${closed?`<strong>Modifiche chiuse</strong><span style="font-size:.86rem">Indisponibilità, ferie e congressi di ${monthName(UI.mk)} si potevano inserire fino a ${fmt(dl,true)}.${ADMIN()?" Tu puoi ancora modificarle, anche per gli altri.":" Per cambiare qualcosa chiedi a chi gestisce i turni."}</span>`:`Puoi inserire o modificare indisponibilità, ferie e congressi di ${monthName(UI.mk)} fino a <strong>${fmt(dl,true)}</strong>.`}</div>`;
  const m=+UI.mk.slice(5);
  const cnt=id=>mode==="R"?Object.entries(PR(UI.mk)[id]||{}).filter(([d,v])=>v&&d>=p.first&&d<=p.last).length:Object.entries(mo.unav[id]||{}).filter(([d,u])=>d>=p.first&&d<=p.last&&(mode==="T"?!(u==="F"||u==="C"):u===mode)).length;
  const MODES=[["T","Indisponibilità turni"],["F","Ferie"],["C","Ferie congresso"],...(S.residents.some(r=>canPref(r.id))?[["R","Preferenze di turno"]]:[])];
  if(mode==="R"&&!canPref(UI.sel)){ const f=S.residents.find(r=>canPref(r.id)&&(r.id===me||ADMIN())); if(f&&!UI.selTouched) UI.sel=f.id; }
  const hint={T:"Tocca un giorno: compaiono i turni previsti quel giorno da segnare come non disponibili.",F:"Tocca i giorni di ferie: si segna l'intera giornata. Tocca di nuovo per togliere.",C:"Tocca i giorni di congresso: si segna l'intera giornata. Tocca di nuovo per togliere.",R:canPref(UI.sel)?"Tocca un giorno e scegli il turno che preferisci (e se vuoi la sala). Il 4° anno viene sistemato per primo, poi il 3°: le preferenze si rispettano se le regole lo permettono; quelle non rispettate vengono segnalate ai rappresentanti.":"Le preferenze di turno sono solo per 3° e 4° anno."}[mode];
  const pr=presence(UI.mk), myRot=mo.rot[UI.sel], lowDays=new Set(pr.filter(x=>x.rot.id===myRot).map(x=>x.d));
  const tot=(id,v)=>Object.entries(mo.unav[id]||{}).filter(([d,u])=>d>=p.first&&d<=p.last&&u===v).length;
  return monthBar()+(otherYear?claimPanel(""):"")+(OWNER||otherYear?"":`<div class="panel" style="gap:4px"><h2>Compila le tue indisponibilità</h2><p class="muted" style="margin:0;font-size:.88rem">Scegli il tuo nome, poi segna i turni in cui non ci sei, le ferie e i congressi. Si salva da solo e tutti vedono le stesse informazioni.</p></div>`)+`
  ${ADMIN()?`<div class="row"><button class="btn" data-act="xunav">Scarica indisponibilità (Excel)</button></div>`:""}
  <div class="pickers" role="tablist">${MODES.map(([k,l])=>`<button data-act="umode" data-v="${k}" aria-pressed="${mode===k}">${l}</button>`).join("")}</div>
  <div class="panel"><span class="label">Specializzando</span>
   <div class="pickers">${S.residents.filter(r=>!(HIDEUNAV&&!ADMIN())||r.id===me).map(r=>`<button data-act="sel" data-id="${r.id}" aria-pressed="${r.id===UI.sel}">${esc(rName(r))}${cnt(r.id)?`<span class="cnt">${cnt(r.id)}</span>`:""}</button>`).join("")}</div></div>
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>${esc(resName(UI.sel))} · ${MODES.find(x=>x[0]===mode)[1]}</h2><span class="row" style="gap:6px"><span class="chip">${esc(rotName(mo.rot[UI.sel]))}</span><span class="chip tag-F">${tot(UI.sel,"F")} ferie</span><span class="chip tag-C">${tot(UI.sel,"C")} congr.</span></span></div>
   ${dlBox}
   <p class="muted" style="margin:0;font-size:.85rem">${ro?(UI.sel===myPid()?`Sola lettura: il termine per ${monthName(UI.mk)} è scaduto.`:`Stai guardando le voci di ${esc(resName(UI.sel))}: puoi modificare solo le tue.`):hint}</p>
   ${ro||mode!=="R"||!canPref(UI.sel)?"":`<div class="row">${clrBtn("clrR",`Elimina tutte le preferenze di ${esc(resName(UI.sel))}`)}</div>`}
   ${ro||mode==="R"?"":`<div class="row">${mode==="T"?clrBtn("clrone",`Elimina indisponibilità di ${esc(resName(UI.sel))}`):""}${clrBtn("clrF",`Elimina tutte le ferie di ${esc(resName(UI.sel))}`)}${clrBtn("clrC",`Elimina tutte le ferie congresso di ${esc(resName(UI.sel))}`)}${ADMIN()?clrBtn("clrall",`Elimina ${mode==="T"?"tutte le indisponibilità":mode==="F"?"tutte le ferie":"tutti i congressi"} del mese`):""}</div>`}
   <div class="cal">${DOW.map(d=>`<div class="dow">${d}</div>`).join("")}
   ${p.days.map(d=>{const u=unavOf(mo,UI.sel,d), t=dayType(d), out=+d.slice(5,7)!==m, pf=mode==="R"?((PR(UI.mk)[UI.sel]||{})[d]||""):"";
     const tag=mode==="R"?(pf?(()=>{ const [pp,sh]=pf.includes("|")?pf.split("|"):[null,pf]; return `<span class="marks"><span class="sh-${sh}">${sh==="D"?"G":sh}</span></span>${pp?`<span style="font-size:.62rem;display:block">${esc((postOf(pp)||{}).name||pp)}</span>`:""}`; })():(FULL[u]?`<span class="full-tag">—</span>`:"")):u==="F"?`<span class="full-tag tag-F">Ferie</span>`:u==="C"?`<span class="full-tag tag-C">Congresso</span>`:u==="G"?`<span class="full-tag">Indisp.</span>`:`<span class="marks">${SH.filter(s=>u.includes(s)).map(s=>`<span class="sh-${s}">${s==="D"?"G":s}</span>`).join("")}</span>`;
     return `<button class="day ${out?"out":""} ${t!=="fer"?"we":""} ${t==="fes"&&isoDow(d)!==6?"fes":""} ${u==="G"?"full":""} ${u==="F"?"fer-day":""} ${u==="C"?"con-day":""} ${lowDays.has(d)?"low":""}" data-act="day" data-d="${d}" aria-label="${fmt(d,true)}">
       <span class="d">${+d.slice(8)}${out?`<span style="font-size:.65rem">/${+d.slice(5,7)}</span>`:""}</span>${tag}</button>`;}).join("")}</div>
   <div class="legend"><span><span class="chip sh-M">M</span> mattina</span><span><span class="chip sh-P">P</span> pomeriggio</span><span><span class="chip sh-N">N</span> notte</span><span><span class="chip sh-D">G</span> guardia domenica</span><span style="color:var(--bad)">rosso = festivo</span><span><span class="lowdot"></span> rotazione sotto il ${S.minPresence}%</span></div>
  </div>${presenceBox(pr)}`; }

function clrBtn(act,label){ const on=UI.confirm===act; return `<button class="btn danger ${on?"confirm":""}" data-act="${act}">${on?"Tocca di nuovo per confermare":label}</button>`; }
function clearUnav(pids,mode){ const mo=M(UI.mk), p=period(UI.mk);
  for(const pid of pids){ if(db&&!canEditUnav(pid)) continue; const m=mo.unav[pid]; if(!m) continue;
    for(const d of Object.keys(m)){ if(d<p.first||d>p.last) continue; const u=m[d];
      if(mode==="T"?!(u==="F"||u==="C"):u===mode) delete m[d]; } saveUnav(UI.mk,pid); } }
function histBox(mk){ const h=(UI.hist||{})[mk]; if(!h) return ""; if(h==="loading") return `<p class="muted" style="margin:0">Caricamento storico…</p>`;
  if(!h.length) return `<p class="muted" style="margin:0;font-size:.85rem">Nessuna bozza salvata per ${monthName(mk)}.</p>`;
  return `<div class="list">${h.map((x,i)=>`<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(x.kind)}</span><span class="muted" style="font-size:.78rem">${new Date(x.at).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"})}${x.by?" · "+esc(x.by):""}</span></span><span class="row" style="gap:6px;flex:none"><button class="btn ${UI.confirm==="hopen-"+i?"confirm":""}" data-act="hopen" data-i="${i}">${UI.confirm==="hopen-"+i?"Tocca di nuovo":"Apri come bozza"}</button><button class="btn danger ${UI.confirm==="hdel-"+i?"confirm":""}" data-act="hdel" data-i="${i}">${UI.confirm==="hdel-"+i?"Conferma":"Elimina"}</button></span></div>`).join("")}</div>`; }
function vTurni(){ if(!S.residents.length) return monthBar()+noRes();
  const mo=M(UI.mk), p=period(UI.mk), SC=viewSched(UI.mk), {per,holes,issues,where}=derive(UI.mk,SC||undefined);
  if(!UI.view) UI.view=ADMIN()?"giorni":"nome";
  const conf=UI.confirm==="gen";
  const noRot=S.residents.filter(r=>!mo.rot[r.id]);
  const head=monthBar()+`<div class="panel"><div class="row" style="justify-content:space-between">
    <div class="stack" style="gap:2px"><h2>Turni del mese</h2><span class="muted" style="font-size:.82rem">${mo.generated?`Pubblicati il ${new Date(mo.generated).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"})}`:"Non ancora pubblicati"}${ADMIN()&&hasDraft(mo)?" · bozza in corso":""}</span></div>
    </div>
    ${!ADMIN()&&anyMgr()?`<p class="muted" style="margin:0;font-size:.84rem">Sola lettura: ${hasDraft(mo)?"vedi la bozza di quest'anno":"quest'anno non ha una bozza in corso"}; la modificano i suoi rappresentanti${hasDraft(mo)&&mo.sched?` · <button class="btn" data-act="dview" data-v="${draftView(mo)?"0":"1"}" style="border:0;text-decoration:underline;background:none;padding:0">${draftView(mo)?"vedi l'orario pubblicato":"torna alla bozza"}</button>`:""}.</p>`:""}
    ${ADMIN()?(()=>{ const nw=p.days.length/7, cur=UI.genWk??"", fresh=!mo.sched&&!hasDraft(mo);
      const filled=w=>p.days.slice(w*7,w*7+7).some(d=>Object.values((workSched(mo)||{})[d]||{}).some(a=>a.some(x=>x)));
      return `<div class="row" style="gap:8px;align-items:center"><button class="btn primary" data-act="prep">${fresh?"Prepara la bozza del mese":"Prepara la bozza"}</button>
         <button class="btn" data-act="optopen" aria-expanded="${!!UI.optOpen}">Opzioni ${UI.optOpen?"▴":"▾"}</button>
         ${hasDraft(mo)&&mo.sched?`<button class="btn" data-act="dview" data-v="${draftView(mo)?"0":"1"}" style="border:0;text-decoration:underline;background:none">${draftView(mo)?"Vedi l'orario pubblicato":"Torna alla bozza"}</button>`:""}</div>
       <p class="muted" style="margin:0;font-size:.82rem">${fresh?"Genera tutto il mese (i turni già inseriti a mano restano). Poi controlli e pubblichi.":"Tiene i turni già assegnati, toglie quelli in conflitto con ferie, congressi o indisponibilità e quelli già coperti da altri anni, copre i buchi e pareggia le sale. Il risultato va nella bozza: la pubblichi dalla barra in basso."}</p>
       ${UI.optOpen?`<div class="stack" style="gap:8px;padding:10px;border:1px solid var(--line);border-radius:8px">
         <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="label">Rifai da zero</span><select id="genWk" data-genwk="1"><option value="" ${cur===""?"selected":""}>Tutto il mese</option>${Array.from({length:nw},(_,w)=>`<option value="${w}" ${String(cur)===String(w)?"selected":""}>Settimana ${w+1}: ${fmt(p.days[w*7])} – ${fmt(p.days[w*7+6])}${filled(w)?" ✓":""}</option>`).join("")}</select>
          <button class="btn ${UI.confirm==="genwk"?"confirm":""}" data-act="genwk">${UI.confirm==="genwk"?"Tocca di nuovo: sovrascrive questa parte":"Rigenera"}</button></div>
         <p class="muted" style="margin:0;font-size:.8rem">Ricrea la bozza da capo (restano solo i turni fissi inseriti a mano). Con una settimana, le altre restano come sono.</p>
         ${fresh?"":`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="label">Solo una rotazione</span><select id="refRot" data-refrot="1" aria-label="Rotazione"><option value="">Rotazione…</option>${S.rotations.map(r=>`<option value="${r.id}" ${UI.refRot===r.id?"selected":""}>${esc(r.name)}</option>`).join("")}</select><button class="btn ${UI.confirm==="refrot"?"confirm":""}" data-act="refrot" ${UI.refRot?"":"disabled"}>${UI.confirm==="refrot"?"Tocca di nuovo":"Prepara solo questa"}</button></div>
         <p class="muted" style="margin:0;font-size:.8rem">Come «Prepara la bozza», ma tocca solo chi è nella rotazione scelta: gli altri restano fermi.</p>`}</div>`:""}`; })():""}
    ${noRot.length?`<p class="muted" style="margin:0;font-size:.85rem">Senza rotazione questo mese: ${noRot.map(r=>esc(rName(r))).join(", ")}.</p>`:""}</div>`;
  if(!mo.generated&&!ADMIN()&&!draftView(mo)) return head+`<div class="panel empty"><h2>Turni non ancora pubblicati</h2><p>Appena verranno generati li vedrai qui.</p></div>`;
  const nW=p.days.length/7, acc=(mo.draft&&mo.draft.acc)||{};
  /* strumenti (chiusi di base) e barra "Pubblica" fissa in basso quando c'è una bozza */
  const tools=ADMIN()?`<div class="row" style="margin:6px 0"><button class="btn" data-act="toolsopen" aria-expanded="${!!UI.toolsOpen}">Strumenti ${UI.toolsOpen?"▴":"▾"}</button></div>
    ${UI.toolsOpen?`<div class="panel"><h2>Strumenti</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="extlink">Turni degli altri anni da link</button><label class="btn">Turni degli altri anni da file<input type="file" id="extfile" accept=".xlsx,.xls,.csv" hidden></label>${Object.keys(mo.ext||{}).length?`<span class="chip">${Object.keys(mo.ext).length} turni coperti da altri anni</span>${clrBtn("clrext","Rimuovi")}`:""}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${(mo.sched||hasDraft(mo))?`<button class="btn" data-act="xlsx">Scarica Excel</button><button class="btn" data-act="xbozza">Excel formato BOZZA ORARI</button>`:""}<button class="btn" data-act="manualstart">Inserisci turni a mano</button><button class="btn" data-act="hist">Storico bozze</button></div>
      ${histBox(UI.mk)}
      ${(mo.sched||hasDraft(mo))?`<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:10px"><span class="label">Azzera i turni</span>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><select id="rstWk" data-rstwk="1"><option value="">Tutto il mese</option>${Array.from({length:nW},(_,w)=>`<option value="${w}" ${String(UI.rstWk??"")===String(w)?"selected":""}>Settimana ${w+1}: ${fmt(p.days[w*7])} – ${fmt(p.days[w*7+6])}</option>`).join("")}</select>
         <button class="btn ${UI.confirm==="clrmine"?"confirm":""}" data-act="clrmine">${UI.confirm==="clrmine"?"Tocca di nuovo: elimina":"Elimina i turni del tuo anno"}</button>
         <button class="btn ${UI.confirm==="clrgen"?"confirm":""}" data-act="clrgen">${UI.confirm==="clrgen"?"Tocca di nuovo: elimina":"Elimina i turni generati"}</button>
         <button class="btn danger ${UI.confirm==="reset"?"confirm":""}" data-act="reset">${UI.confirm==="reset"?"Tocca di nuovo: azzera tutto":"Azzera tutto"}</button>
         <button class="btn ${UI.confirm==="restpub"?"confirm":""}" data-act="restpub">${UI.confirm==="restpub"?"Tocca di nuovo: riprendi":"Riprendi l'orario pubblicato"}</button></div>
        <p class="muted" style="margin:0;font-size:.8rem"><strong>Elimina i turni del tuo anno</strong>: toglie i turni messi dal generatore solo nell'anno che stai guardando.<br><strong>Elimina i turni generati</strong>: lo stesso, ma in tutti gli anni.<br>In entrambi restano i turni inseriti a mano o arrivati dal foglio (link/file), le sale chiuse, i turni coperti da altri anni e gli anni assegnati ai turni scoperti.<br><strong>Azzera tutto</strong> (tutti gli anni): svuota tutte le caselle (anche i turni inseriti a mano o dal foglio) e toglie per quel periodo sale chiuse, turni coperti da altri anni e anni assegnati ai turni scoperti.<br><strong>Riprendi l'orario pubblicato</strong> (tutti gli anni): rimette nella bozza l'orario pubblicato finora per quel periodo, con quello che «Azzera tutto» aveva tolto (turni fissi, coperti da altri anni, sale chiuse, anni degli scoperti).<br>Indisponibilità, ferie e congressi non vengono mai toccati. I turni vanno nella bozza: l'orario pubblicato cambia quando premi «Pubblica» («Annulla» torna indietro).</p></div>`:""}</div>`:""}`:"";
  const pubBar=ADMIN()&&hasDraft(mo)?`<div style="height:84px"></div><div class="pubbar"><span class="name-strong">Bozza non pubblicata${(()=>{ const c=draftChanges(mo,true); return c?` · ${c.size} ${mo.sched?"caselle cambiate":"caselle nuove"}`:""; })()}</span>
      <button class="btn ${UI.confirm==="accall"?"confirm":"primary"}" data-act="accall">${UI.confirm==="accall"?"Tocca di nuovo: pubblica":"Pubblica"}</button>
      ${clrBtn("drop","Annulla")}
      <button class="btn" data-act="pubwk" aria-expanded="${!!UI.pubWk}">Solo una settimana ${UI.pubWk?"▴":"▾"}</button>
      ${UI.pubWk?`<div class="row" style="gap:6px;flex-wrap:wrap;width:100%;justify-content:center">${Array.from({length:nW},(_,w)=>acc[w]?`<span class="chip tag-F">Sett. ${w+1} pubblicata</span>`:`<button class="btn sm ${UI.confirm==="accw-"+w?"confirm":""}" data-act="accw" data-w="${w}">${UI.confirm==="accw-"+w?"Tocca di nuovo":`Pubblica sett. ${w+1} (${fmt(p.days[w*7]).slice(4)})`}</button>`).join("")}</div>`:""}</div>`:"";
  const draft=tools;
  if(!mo.sched&&!hasDraft(mo)&&!ADMIN()) return head+`<div class="panel empty"><h2>Nessun turno per questo mese</h2><p>Quest'anno non ha ancora né bozza né orario pubblicato.</p></div>`;
  if(!mo.sched&&!hasDraft(mo)) return head+draft+`<div class="panel empty"><h2>Pronto per generare</h2><p>Controlla rotazioni e indisponibilità, poi tocca «Prepara la bozza del mese». Potrai cambiare a mano ogni turno toccandolo e poi pubblicare.</p><p>Se alcuni turni sono già decisi, inseriscili prima a mano: la generazione non li tocca.</p><button class="btn" data-act="manualstart">Inserisci turni a mano</button></div>`;
  let alerts="";
  let holesBox="";
  if(holes.length&&ADMIN()&&(mo.generated||draftView(mo))){ const g={}; holes.forEach(h=>{const k=fmt(h.d);(g[k]=g[k]||[]).push(`${h.post} ${h.s}${h.n>1?" ×"+h.n:""}`);});
    holesBox=`<div class="alerts bad"><strong>${holes.length} turni scoperti</strong><span style="font-size:.84rem">Non c'è nessuno disponibile entro i limiti. Puoi alzare il massimo settimanale, togliere postazioni oppure coprirli a mano.</span><ul>${Object.entries(g).slice(0,10).map(([k,v])=>`<li>${k}: ${v.join(", ")}</li>`).join("")}${Object.keys(g).length>10?`<li>… e altri ${Object.keys(g).length-10} giorni</li>`:""}</ul></div>`; }
  if(ADMIN()){ const lev=yLab(CURY), tags=HOLEY[UI.mk]||{}, byRn={}; S.posts.forEach(x=>byRn[normRoom(x.name)]=x); const g={}; let n=0;
    Object.keys(tags).filter(k=>normTags(tags[k]).some(t=>t.l===lev)).sort().forEach(k=>{ const [d,rn,sh]=k.split("|"), post=byRn[rn]; let m=normTags(tags[k]).filter(t=>t.l===lev).length;
      if(post){ const key=post.id+"|"+sh, a=(((SC||{})[d]||{})[key]||[]); if(isClosed(mo,d,key)) return; m=unsatTags(mo,d,key,a).filter(x=>x===lev).length; if(!m) return; }
      n+=m; (g[fmt(d)]=g[fmt(d)]||[]).push(`${esc(post?post.name:rn)} ${SHN[sh]||sh}${m>1?" ×"+m:""}`); });
    if(n) alerts+=`<div class="alerts" style="border-left:4px solid ${ycol(lev)}"><strong style="color:${ycol(lev)}">Turni scoperti del ${ROMAN[lev]} anno (${n})</strong><ul>${Object.entries(g).map(([k,v])=>`<li>${k}: ${v.join(", ")}</li>`).join("")}</ul></div>`; }
  if(issues.length&&ADMIN()) alerts+=`<div class="alerts"><strong>Da controllare</strong><ul>${issues.slice(0,15).map(i=>`<li>${esc(i)}</li>`).join("")}</ul></div>`;
  const pr=presence(UI.mk); alerts+=presenceBox(pr);
  if(ADMIN()&&(mo.generated||draftView(mo))&&!holes.length&&!issues.length&&!pr.length) alerts=`<div class="okline">Tutte le postazioni coperte, nessun conflitto.</div>`;
  const vb=(v,l)=>`<button data-act="view" data-v="${v}" aria-pressed="${UI.view===v}">${l}</button>`;
  /* in Modifica turni (rappresentanti) prima "Per giorno", poi "Per nome" */
  const tabs=`<div class="pickers">${ADMIN()?vb("giorni","Per giorno")+vb("nome","Per nome"):vb("nome","Per nome")+vb("giorni","Per giorno")}<button data-act="view" data-v="persone" aria-pressed="${UI.view==="persone"}">Per specializzando</button><button data-act="view" data-v="conti" aria-pressed="${UI.view==="conti"}">Conteggi</button></div>`;
  let body="";
  const people=S.residents.filter(r=>inGem(mo,r.id)||(SC&&shiftsOf(SC,r.id).length));
  CHG=UI.view==="giorni"?draftChanges(mo):null; drxSync();
  if(UI.view==="giorni"){
    /* filtro per metodica: sale della rotazione (solo mattina/pomeriggio) oppure notti e guardie */
    const myY=ADMIN()?null:yLab((MULTI&&myAnyPid()&&yearOfPid(myAnyPid()))||CURY);
    const cols0=columns(SC,p).filter(c=>myY===null||yearsFor(c.post).includes(myY)), fgs=FGROUPS.filter(([id])=>S.posts.some(x=>fgOf(x)===id));
    /* filtri per metodica visibili a tutti: con un filtro si vedono tutte le sale della metodica, anche di altri anni */
    const F=fgs.some(([id])=>id===UI.filt)||UI.filt==="NG"?UI.filt:"";
    /* "Tutte le sale": tutte le sale di tutti gli anni, per tutti */
    const allCols=S.posts.flatMap(post=>SH.filter(s=>Object.values(post.on||{}).some(a=>(a||[]).includes(s))).map(s=>({post,s,k:post.id+"|"+s})));
    const cols=!F?allCols:F==="NG"?cols0.filter(c=>c.s==="N"||c.s==="D"):S.posts.filter(x=>fgOf(x)===F).flatMap(post=>["M","P"].filter(s=>Object.values(post.on||{}).some(a=>(a||[]).includes(s))).map(s=>({post,s,k:post.id+"|"+s}))), used=S.posts.filter(x=>cols.some(c=>c.post===x));
    body=`<div class="pickers sm" style="margin-bottom:6px"><button data-act="filt" data-v="" aria-pressed="${!F}">Tutte</button>${fgs.map(([id,name])=>`<button data-act="filt" data-v="${id}" aria-pressed="${F===id}">${esc(name)}</button>`).join("")}<button data-act="filt" data-v="NG" aria-pressed="${F==="NG"}">Notti e guardie</button></div>`;
    if(ADMIN()) body+=UI.clsel?`<div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:.84rem">Tocca le caselle da chiudere o riaprire: <span id="clselN">${UI.clsel.size}</span> selezionate</span><button class="btn primary clselbtn" data-act="clapply" data-v="1" ${UI.clsel.size?"":"disabled"}>Chiudi le selezionate</button><button class="btn clselbtn" data-act="clapply" data-v="0" ${UI.clsel.size?"":"disabled"}>Riapri le selezionate</button><span class="muted" style="font-size:.84rem">Scoperti di:</span>${LEVELS.map(l=>`<button class="btn sm clselbtn" data-act="holesel" data-v="${l}" ${UI.clsel.size?"":"disabled"} style="border-color:${ycol(l)};color:${ycol(l)}">${ROMAN[l]}</button>`).join("")}<button class="btn sm clselbtn" data-act="holesel" data-v="0" ${UI.clsel.size?"":"disabled"}>Togli anno</button><button class="btn" data-act="clsel">Annulla</button></div>`
      :`<div class="row" style="margin-bottom:6px"><button class="btn" data-act="clsel">Seleziona caselle (sale chiuse, scoperti per anno)</button></div>`;
    /* una settimana alla volta (più veloce da disegnare); di base quella di oggi, se è nel mese */
    const nWk=p.days.length/7; UI.dayWk=UI.dayWk||{}; if(UI.dayWk[UI.mk]===undefined){ const ti=p.days.indexOf(todayYmd()); UI.dayWk[UI.mk]=ti>=0?Math.floor(ti/7):0; }
    const wsel=UI.dayWk[UI.mk], shownDays=wsel==="all"?p.days:p.days.slice(wsel*7,wsel*7+7), offs=wsel==="all"?0:wsel*7;
    body+=`<div class="row" style="gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">${wsel==="all"?`<button class="btn sm" data-act="daywk" data-v="0">Una settimana alla volta</button>`:`<button class="btn sm" data-act="daywk" data-v="${wsel-1}" ${wsel>0?"":"disabled"} aria-label="Settimana precedente">‹</button><span class="name-strong" style="font-size:.88rem">Settimana ${wsel+1} di ${nWk}: ${fmt(shownDays[0])} – ${fmt(shownDays[6])}</span><button class="btn sm" data-act="daywk" data-v="${wsel+1}" ${wsel<nWk-1?"":"disabled"} aria-label="Settimana successiva">›</button><button class="btn sm" data-act="daywk" data-v="all" style="border:0;text-decoration:underline;background:none">tutto il mese</button>`}</div>`;
    body+=`<div class="scroll tall"><table class="grid"><thead><tr><th class="sticky" rowspan="2">Giorno</th>${used.map(x=>`<th class="roomh" colspan="${cols.filter(c=>c.post===x).length}">${esc(x.name)}</th>`).join("")}</tr>
     <tr>${cols.map(c=>`<th><span class="chip sh-${c.s}">${c.s} ${esc(S.hours[c.s])}</span></th>`).join("")}</tr></thead><tbody>
     ${shownDays.map((d,i0)=>{const i=i0+offs, t=dayType(d);return `<tr class="${t==="sab"?"we":""} ${t==="fes"?"fes":""} ${i%7===0&&i?"weekstart":""}"><td class="date sticky">${fmt(d)}</td>${cols.map(c=>{const arr=(SC[d]||{})[c.k];
       if(isClosed(mo,d,c.k)&&!(arr||[]).some(x=>x)) return `<td class="cell${selC(d,c.k)}" ${ADMIN()?`data-act="cell" data-d="${d}" data-k="${c.k}"`:`style="cursor:default"`} title="Sala chiusa"><span class="muted" style="font-size:.75rem;font-weight:600">Chiusa</span></td>`;
       if(!arr){ const opn=((c.post.on||{})[dayType(d)]||[]).includes(c.s), due=opn, ex0=EXT(mo)[d+"|"+c.k];
         if(ex0) return `<td class="cell${selC(d,c.k)}" ${(due||UI.clsel)&&ADMIN()?`data-act="cell" data-d="${d}" data-k="${c.k}"`:`style="cursor:default"`} title="Coperto da altri anni"><span class="muted" style="font-size:.72rem;display:block">${xNames(d,c.k,ex0)}</span></td>`;
         return due?`<td class="cell${selC(d,c.k)}" ${ADMIN()?`data-act="cell" data-d="${d}" data-k="${c.k}"`:`style="cursor:default"`}>${holeLabel(d,c.k)}</td>`:UI.clsel&&ADMIN()?`<td class="cell${selC(d,c.k)}" data-act="cell" data-d="${d}" data-k="${c.k}"><span class="muted">·</span></td>`:`<td class="cell none">·</td>`; }
       const ex=EXT(mo)[d+"|"+c.k], lw=lowerOnly(mo,d,c.k), exh=(ex?`<span class="muted" style="font-size:.72rem;display:block">${xNames(d,c.k,ex)}</span>`:"")+(lw?`<span class="muted" style="font-size:.72rem;display:block;font-style:italic">${xNames(d,c.k,lw)}</span>`:"");
       if(!arr.length) return `<td class="cell${selC(d,c.k)}" ${ADMIN()?`data-act="cell" data-d="${d}" data-k="${c.k}"`:`style="cursor:default"`} title="Coperto da altri anni">${exh||`<span class="muted">—</span>`}</td>`;
       return `<td class="cell${selC(d,c.k)} ${SWMARK[UI.mk]&&SWMARK[UI.mk].has(d+"|"+c.k)?"swapped":""}" ${ADMIN()?`data-act="cell"`:`style="cursor:default"`} data-d="${d}" data-k="${c.k}">${arr.map((pid,ai)=>pid?`<span class="who">${esc(resName(pid))}</span>${ADMIN()&&(mo.fixed||{})[d+"|"+c.k+"|"+ai]===pid?`<span class="muted" style="font-size:.7rem;display:block">fisso</span>`:""}`:(arr.some(v=>v)||(needOf(mo,d,c.k)===0&&!unsatTags(mo,d,c.k,arr).length)?"":`${holeLabel(d,c.k)}`)).join("")}${partialLabel(mo,d,c.k,arr)}${exh}</td>`;}).join("")}</tr>`;}).join("")}</tbody></table></div>`;
  } else if(UI.view==="nome"){
    if(!UI.who) UI.who=myPid()||"";
    const pid=UI.who, rows=[];
    if(pid) p.days.forEach(d=>{ const c=code(mo,per,pid,d), sh=shiftsOf({[d]:SC[d]||{}},pid);
      if(sh.length) sh.forEach(x=>{ const [postId,s]=x.k.split("|"), post=postOf(postId); rows.push({d,s,txt:`${post?esc(post.name):""}`,h:S.hours[s],sw:SWMARK[UI.mk]&&SWMARK[UI.mk].has(d+"|"+x.k)}); });
      else if(c==="S") rows.push({d,s:"S"}); else if(c==="F"||c==="C"||c==="X") rows.push({d,s:c}); else rows.push({d,s:"L"}); });
    const x=pid?per[pid]:null;
    const lab={M:"Mattina",P:"Pomeriggio",N:"Notte",D:"Guardia",S:"Smonto",F:"Ferie",C:"Ferie congresso",X:"Indisponibile",L:"Libero"};
    const cls={M:"sh-M",P:"sh-P",N:"sh-N",D:"sh-D",S:"",F:"tag-F",C:"tag-C",X:"",L:""};
    body=`<div class="panel"><label class="stack" style="gap:4px"><span class="label">Nome</span><select id="whoSel" data-who="1"><option value="">Scegli…</option>${S.residents.map(r=>`<option value="${r.id}" ${pid===r.id?"selected":""}>${esc(rName(r))}</option>`).join("")}</select></label>
     ${pid?`<div class="row" style="gap:6px"><span class="chip">${esc(rotName(mo.rot[pid]))}</span><span class="chip">${x.tot} turni</span><span class="chip sh-M">${x.M} M</span><span class="chip sh-P">${x.P} P</span><span class="chip sh-N">${x.N} N</span><span class="chip sh-D">${x.D} G</span><span class="chip">${x.sab||0} sabati</span><span class="chip">${x.fes||0} dom/festivi</span></div>`:""}</div>
     ${pid?(rows.length?`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Giorno</th><th>Turno</th><th>Sala</th><th>Orario</th></tr></thead><tbody>${rows.map(r=>`<tr class="${dayType(r.d)==="sab"?"we":""} ${dayType(r.d)==="fes"?"fes":""}"><td class="date sticky">${fmt(r.d)}</td><td><span class="chip ${cls[r.s]}">${lab[r.s]}</span>${r.s==="N"?' <span class="muted" style="font-size:.78rem">monto</span>':""}${r.sw?' <span style="color:var(--accent);font-weight:700">↔</span>':""}</td><td>${r.txt||""}</td><td class="num">${r.h?esc(r.h):""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="panel empty"><p>Nessun turno per ${esc(resName(pid))} in questo mese.</p></div>`):`<div class="panel empty"><p>Scegli un nome per vedere solo i suoi turni.</p></div>`}`;
  } else if(UI.view==="persone"){
    body=`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Specializzando</th>${p.days.map(d=>`<th class="code" style="${dayType(d)==="fes"?"color:var(--bad)":dayType(d)==="sab"?"color:var(--accent)":""}">${DOW[isoDow(d)][0]}<br>${+d.slice(8)}</th>`).join("")}</tr></thead><tbody>
     ${people.map(r=>`<tr><td class="sticky"><span class="name-strong">${esc(rName(r))}</span><br><span class="muted" style="font-size:.75rem">${esc(rotName(mo.rot[r.id]))}</span></td>${p.days.map(d=>{const c=code(mo,per,r.id,d);return c==="N"?`<td class="code monto"><div class="mn"><span class="mt">monto</span><span class="nt">Notte</span></div></td>`:`<td class="code ${c}">${c?label(c,where[r.id+"|"+d]):`<span class="muted" style="font-size:.68rem">libero</span>`}</td>`;}).join("")}</tr>`).join("")}</tbody></table></div>
     <div class="legend"><span><span class="chip sh-M">Mattina</span></span><span><span class="chip sh-P">Pomeriggio</span></span><span><span class="chip sh-N">Notte</span></span><span><span class="chip sh-D">Guardia dom/festivi</span></span><span><span class="chip tag-F">Ferie</span></span><span><span class="chip tag-C">Congresso</span></span><span>monto = giorno della notte, non si lavora di giorno · smonto = giorno dopo, non si lavora</span><span>✕ = indisponibile</span><span>G = guardia domenica</span></div>`;
  } else {
    body=`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Specializzando</th><th>Rotazione</th><th>Totale</th><th>Mattine</th><th>Pomeriggi</th><th>Guardie</th><th>Notti</th><th>Sabati</th><th>Dom/festivi</th><th>Max/sett.</th><th>Sett. oltre ${S.targetWeek}</th><th>Sale</th></tr></thead><tbody>
     ${people.map(r=>{const x=per[r.id];return `<tr><td class="sticky name-strong">${esc(rName(r))}</td><td>${esc(rotName(mo.rot[r.id]))}</td><td class="num">${x.tot}</td><td class="num">${x.M}</td><td class="num">${x.P}</td><td class="num">${x.D}</td><td class="num">${x.N}</td><td class="num">${x.sab||0}</td><td class="num">${x.fes||0}</td><td class="num">${Math.max(0,...Object.values(x.wk))}</td><td class="num">${Object.values(x.wk).filter(v=>v>S.targetWeek).length||""}</td><td style="white-space:nowrap;font-size:.78rem">${Object.entries(x.pc).sort((a,b)=>a[0].localeCompare(b[0],"it",{numeric:true})).map(([k,v])=>`${esc(k)} ${v}`).join(" · ")}</td></tr>`;}).join("")}</tbody></table></div>`;
  }
  if(UI.view==="conti"){ const cov={}; p.days.forEach(d=>{ for(const k in (SC[d]||{})){ const c=cov[k]||(cov[k]={f:0,n:0}); (SC[d][k]||[]).forEach(x=>{c.n++; if(x)c.f++;}); } });
    const shown=S.posts.filter(x=>SH.some(s=>cov[x.id+"|"+s]));
    const pct=c=>c?`${Math.round(c.f/c.n*100)}% <span class="muted">(${c.f}/${c.n})</span>`:"";
    body+=`<h3 style="margin-top:6px">Copertura per sala</h3><div class="scroll"><table class="grid"><thead><tr><th class="sticky">Sala</th>${SH.map(s=>`<th><span class="chip sh-${s}">${SHN[s]}</span></th>`).join("")}</tr></thead><tbody>${shown.map(x=>`<tr><td class="sticky name-strong">${esc(x.name)}</td>${SH.map(s=>`<td class="num">${pct(cov[x.id+"|"+s])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    { const {h}=pastBias(UI.mk), cur={}; S.residents.forEach(r=>cur[r.id]={N:0,D:0,we:0}); p.days.forEach(d=>{ const t=dayType(d); for(const k in (SC[d]||{})){ const sh=k.split("|")[1]; (SC[d][k]||[]).forEach(x=>{ const o=cur[x]; if(!o) return; if(sh==="N")o.N++; if(sh==="D")o.D++; if(t!=="fer")o.we++; }); } });
      const rows=S.residents.filter(r=>h[r.id].months||cur[r.id].N||cur[r.id].D||cur[r.id].we);
      if(rows.length) body+=`<h3 style="margin-top:6px">Equità su più mesi</h3><p class="muted" style="margin:0;font-size:.82rem">Notti, guardie e turni nel weekend dei 3 mesi precedenti (orario pubblicato) + questo mese. Generando, chi ne ha fatti di più rispetto alla media ne riceve meno.</p>
        <div class="scroll"><table class="grid"><thead><tr><th class="sticky">Specializzando</th><th>Notti</th><th>Guardie</th><th>Weekend</th><th>Mesi</th></tr></thead><tbody>${rows.map(r=>{ const a=h[r.id], c=cur[r.id]; const f=(x,y)=>`${x+y} <span class="muted">(${x}+${y})</span>`;
          return `<tr><td class="sticky name-strong">${esc(rName(r))}</td><td class="num">${f(a.N,c.N)}</td><td class="num">${f(a.D,c.D)}</td><td class="num">${f(a.we,c.we)}</td><td class="num">${a.months}</td></tr>`; }).join("")}</tbody></table></div>`; } }
  const summ=ADMIN()&&draftView(mo)?`<div class="row" style="gap:8px;flex-wrap:wrap;font-size:.86rem;margin:4px 0 8px"><span class="name-strong">Bozza:</span><span class="chip" style="background:var(--chg-soft);color:var(--ink)">${(CHG||draftChanges(mo)||new Set()).size} ${mo.sched?"caselle cambiate":"caselle nuove"}</span><span class="chip" style="background:var(--bad-soft);color:var(--bad)">${holes.reduce((a,h)=>a+(h.n||1),0)} scoperti</span><span class="chip">${issues.length} da controllare</span></div>`:"";
  const xn=UI.view==="giorni"&&anyMgr()&&(DRX.u.cells.size||DRX.l.cells.size)?`<p style="margin:2px 0 8px;font-size:.84rem"><span class="chip" style="background:var(--chg-soft);color:var(--chg);font-weight:700">✎ Bozze di altri anni</span> Le caselle tratteggiate in arancione hanno modifiche di un altro anno non ancora pubblicate; i nomi in arancione ✎ sono in bozza.</p>`:"";
  return head+draft+alerts+summ+xn+tabs+body+holesBox+pubBar;
}
function code(mo,per,pid,d){ const p=per[pid]; if(p&&p.on[d]) return p.on[d]; if(p&&p.on[add(d,-1)]==="N") return "S"; const u=unavOf(mo,pid,d); return u==="G"?"X":u==="F"?"F":u==="C"?"C":""; }
function label(c,postName){ if(c==="S")return "smonto"; if(c==="X")return "✕"; if(c==="F")return "ferie"; if(c==="C")return "congr."; if(c==="D")return "G"; if(c==="N")return "monto"; if(c)return esc(postName||"")+" "+c; return ""; }

function vImp(){
  if(UI.userMode) return `<div class="panel" style="border:2px solid var(--accent)"><h2>Modalità specializzando</h2><p class="muted" style="margin:0;font-size:.88rem">Stai vedendo l'app come uno specializzando: niente funzioni di gestione, solo i turni, le tue indisponibilità e i tuoi cambi.</p><div class="row"><button class="btn primary" data-act="umodeoff">Torna in modalità rappresentante</button></div></div>`;
  return modePanel()+vImp2(); }
function modePanel(){ return `<div class="panel"><div class="row" style="justify-content:space-between"><h2>Modalità rappresentante</h2><button class="btn" data-act="umodeon">Passa a modalità specializzando</button></div><p class="muted" style="margin:0;font-size:.85rem">Per vedere l'app in modo essenziale, come la vedono gli specializzandi. Puoi tornare indietro da qui.</p></div>`; }
function vImp2(){
  const covOpts=[...S.rotations.map(r=>[r.id,r.name]),["ALL","Tutti"]];
  const groups=[]; S.posts.forEach(p=>{ const g=p.cover; if(!groups.includes(g)) groups.push(g); });
  const mg=S.managers||[];
  const mgPanel=`<div class="panel"><h2>Rappresentanti</h2>
   <p class="muted" style="margin:0;font-size:.85rem">${OWNER?"I rappresentanti possono usare tutte le funzioni come te: rotazioni, impostazioni, generazione e modifica dei turni, cambi manuali e cambi da inserire. Non possono modificare le indisponibilità degli altri, scegliere i rappresentanti o scollegare gli account. Si possono scegliere solo specializzandi che hanno già collegato il nome.":"Questo elenco lo modifica solo il proprietario del tool."}</p>
   <div class="pickers">${S.residents.filter(r=>CLAIMS[r.id]||mg.includes(r.id)).map(r=>`<button ${OWNER?`data-act="mgr" data-id="${r.id}"`:"disabled"} aria-pressed="${mg.includes(r.id)}">${esc(rName(r))}</button>`).join("")||`<span class="muted">Nessuno ha ancora collegato il nome.</span>`}</div></div>`;
  const reqPanel=OWNER&&REQS.length?`<div class="panel" style="border:2px solid var(--accent)"><h2>Richieste di accesso <span class="chip">${REQS.length}</span></h2>
   <div class="list">${REQS.map(r=>`<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(r.email)}</span><span class="muted" style="font-size:.78rem">${new Date(r.at).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"})}</span></span><span class="row" style="gap:6px"><button class="btn primary" data-act="reqok" data-id="${esc(r.id)}">Approva</button><button class="btn danger" data-act="reqno" data-id="${esc(r.id)}">Rifiuta</button></span></div>`).join("")}</div></div>`:"";
  const allowPanel=OWNER?`<div class="panel"><h2>Email autorizzate</h2><p class="muted" style="margin:0;font-size:.85rem">Solo queste email possono entrare nell'app (tu entri sempre). Una per riga. Dopo averle salvate, manda il link ai colleghi: si registrano con la stessa email e una password a scelta.</p>
   <textarea id="allowtxt" rows="6" style="width:100%;font:.88rem var(--f-mono);color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px">${esc(ALLOW.join("\n"))}</textarea>
   <div class="row"><button class="btn primary" data-act="allowsave">Salva elenco</button><span class="muted" style="font-size:.85rem">${ALLOW.length} email autorizzate</span></div></div>`:"";
  const importPanel=OWNER?`<div class="panel"><h2>Importa dati</h2><p class="muted" style="margin:0;font-size:.85rem">Carica una copia di sicurezza (.json) per ripristinare tutto, oppure il file di esportazione del vecchio tool (sostituisce impostazioni e turni e aggiunge indisponibilità e cambi).</p>
   <input type="file" id="impfile" accept=".json,application/json"></div>
   <div class="panel"><h2>Copia di sicurezza</h2><p class="muted" style="margin:0;font-size:.85rem">Scarica in un file tutti i dati: impostazioni e turni di tutti gli anni, indisponibilità, ferie, congressi e preferenze, cambi, associazioni nome-account, email autorizzate e rappresentanti. Per ripristinarli carica il file qui sopra in «Importa dati» (sovrascrive i dati attuali con quelli della copia). Lo storico delle bozze non è incluso.</p>
   <div class="row"><button class="btn primary" data-act="backup">Scarica copia di sicurezza</button></div></div>`:"";
  const yearsPanel=OWNER&&db&&CURY===2?`<div class="panel"><h2>Più anni</h2><p class="muted" style="margin:0;font-size:.85rem">${S.multiYear?"Attivo: in alto scegli l'anno. Ogni anno ha nomi, sale, rotazioni e rappresentanti propri (si impostano qui, scegliendo l'anno). Si genera a cascata: prima il 4°, poi il 3° vede i turni del 4° come già coperti, e così via. Disattivando, l'app torna com'era: i dati degli altri anni restano salvati e ricompaiono se lo riattivi.":"Aggiunge 1°, 3° e 4° anno, ognuno con i propri dati. I vostri dati (2° anno) non vengono toccati e disattivando si torna esattamente a come è ora. Nomi presi da «Elenco Spec»: (2)→3° anno, (3)→4° anno; il 1° anno è vuoto."}</p>
   <div class="row"><button class="btn ${UI.confirm==="years"?"confirm":S.multiYear?"danger":"primary"}" data-act="years">${UI.confirm==="years"?"Tocca di nuovo per confermare":S.multiYear?"Disattiva più anni":"Attiva più anni"}</button></div></div>`:"";
  const covPanel=ADMIN()&&db?(()=>{ const rows=[], seen=new Set();
    (MULTI?YRS(UI.mk):[CURY]).forEach(y=>((y===CURY?S:yState(y)||{}).posts||[]).forEach(p=>{ const k=normRoom(p.name); if(!k||seen.has(k)) return; seen.add(k); rows.push({k,name:p.name,p}); }));
    return `<div class="panel"><h2>Anni che coprono ogni sala</h2><p class="muted" style="margin:0;font-size:.85rem">Elenco unico per tutti gli anni: lo modificate tu e i rappresentanti di qualsiasi anno. Un anno genera turni solo nelle sale dove è segnato (anche con «Più anni» spento). Gli specializzandi vedono nella tabella dei turni solo le sale del proprio anno. Gli anni sono quelli di corso del mese (l'anno cambia a novembre).</p>
     <div class="list">${rows.map(r=>{ const ys=yearsFor(r.p); return `<div class="item"><span class="name-strong">${esc(r.name)}</span><span class="pickers sm">${LEVELS.map(y=>`<button data-act="covy" data-k="${esc(r.k)}" data-y="${y}" aria-pressed="${ys.includes(y)}">${y}°</button>`).join("")}</span></div>`; }).join("")}</div></div>`; })():"";
  const privPanel=ADMIN()&&db?`<div class="panel"><div class="row" style="justify-content:space-between"><h2>Privacy indisponibilità</h2><button class="btn ${HIDEUNAV?"primary":""}" data-act="privtog" role="switch" aria-checked="${HIDEUNAV}">${HIDEUNAV?"Attivo":"Spento"}</button></div>
   <p class="muted" style="margin:0;font-size:.85rem">${HIDEUNAV?"Gli specializzandi vedono solo le proprie indisponibilità, ferie, congressi e preferenze. Tu e i rappresentanti vedete tutto.":"Tutti vedono le indisponibilità, ferie e congressi di tutti. Attivandolo ognuno vede solo le proprie (tu e i rappresentanti vedete sempre tutto)."}</p>
   <div class="row" style="justify-content:space-between"><h2>Privacy cambi</h2><button class="btn ${HIDESWAPS?"primary":""}" data-act="privsw" role="switch" aria-checked="${HIDESWAPS}">${HIDESWAPS?"Attivo":"Spento"}</button></div>
   <p class="muted" style="margin:0;font-size:.85rem">${HIDESWAPS?"Gli specializzandi vedono solo i cambi in cui sono coinvolti. Tu e i rappresentanti vedete tutto.":"Tutti vedono lo storico dei cambi di tutti (con il filtro «Solo i miei»). Attivandolo ognuno vede solo i cambi in cui è coinvolto."}</p></div>`:"";
  const colPanel=ADMIN()&&db?`<div class="panel"><h2>Colori degli anni</h2><p class="muted" style="margin:0;font-size:.85rem">Usati per i turni scoperti assegnati a un anno ("scoperto · II anno"). Li modificate tu e i rappresentanti di qualsiasi anno.</p>
   <div class="row" style="gap:16px;flex-wrap:wrap">${LEVELS.map(l=>`<label style="display:flex;gap:8px;align-items:center"><input type="color" data-ycol="${l}" value="${ycol(l)}" style="width:42px;height:32px;border:0;background:none;padding:0"> ${ROMAN[l]} anno</label>`).join("")}</div></div>`:"";
  return reqPanel+yearsPanel+privPanel+covPanel+colPanel+mgPanel+allowPanel+linkedPanel()+importPanel+`
  <div class="panel"><h2>Specializzandi</h2>
   <form class="row" id="addform"><input id="newname" placeholder="Cognome Nome" style="flex:1 1 12em" autocomplete="off"><select id="newyear" aria-label="Anno">${[1,2,3,4].map(y=>`<option ${y===2?"selected":""}>${y}° anno</option>`).join("")}</select><button class="btn primary" type="submit">Aggiungi</button></form>
   <div class="list">${S.residents.map(r=>`<div class="item"><input id="rname-${r.id}" data-rname="${r.id}" value="${esc(r.name)}" aria-label="Nome" style="font-weight:600;width:100%"><span class="pickers sm" style="flex:none"><button data-act="rflag" data-id="${r.id}" data-f="nights" aria-pressed="${canDo(r.id,"N")}">Notti</button><button data-act="rflag" data-id="${r.id}" data-f="guards" aria-pressed="${canDo(r.id,"D")}">Guardie</button></span><button class="btn danger ${UI.confirm==="del-"+r.id?"confirm":""}" data-act="del" data-id="${r.id}">${UI.confirm==="del-"+r.id?"Conferma":"Rimuovi"}</button></div>`).join("")||`<p class="muted" style="margin:0">Ancora nessuno.</p>`}</div></div>
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>Postazioni da coprire</h2><button class="btn" data-act="addpost">Aggiungi postazione</button></div>
   <p class="muted" style="margin:0;font-size:.85rem">"Dom/festivi" comprende anche i festivi infrasettimanali. "Persone per turno": minimo e massimo contando tutti gli anni insieme (valgono per tutti gli anni; li modificate tu e i rappresentanti di qualsiasi anno). Sotto il minimo il turno è scoperto o "manca 1"; il generatore non supera il massimo. DEA (mattina/pomeriggio) e guardia: tendenzialmente una persona per anno.</p>
   ${S.posts.map(p=>`<div class="post">
     <div class="top"><input id="pname-${p.id}" data-pname="${p.id}" value="${esc(p.name)}" aria-label="Nome postazione">
      <select id="pcov-${p.id}" data-pcov="${p.id}" aria-label="Chi la copre">${covOpts.map(([v,l])=>`<option value="${v}" ${p.cover===v?"selected":""}>${v==="ALL"?"Tutti":"Rotazione "+esc(l)}</option>`).join("")}</select>
      <button class="btn danger ${UI.confirm==="delp-"+p.id?"confirm":""}" data-act="delpost" data-id="${p.id}">${UI.confirm==="delp-"+p.id?"Conferma":"Togli"}</button></div>
     <div class="row" style="gap:8px"><span style="font-size:.82rem;width:6.5em">Coperti da tutti</span><div class="pickers sm">${SH.map(s=>`<button data-act="pall" data-id="${p.id}" data-v="${s}" aria-pressed="${(p.all||[]).includes(s)}">${SHN[s]}</button>`).join("")}</div></div>
     <div class="stack" style="gap:6px">${DT.map(([t,l])=>`<div class="row" style="gap:8px"><span style="font-size:.82rem;width:6.5em">${l}</span><div class="pickers sm">${SH.map(s=>`<button data-act="pon" data-id="${p.id}" data-t="${t}" data-v="${s}" aria-pressed="${(p.on[t]||[]).includes(s)}">${SHN[s]}</button>`).join("")}</div></div>`).join("")}</div>
     ${(()=>{ const shs=SH.filter(x=>Object.values(p.on||{}).some(a=>(a||[]).includes(x))); if(!shs.length||!db) return ""; const rk=normRoom(p.name);
       return `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span style="font-size:.82rem;width:6.5em">Persone per turno</span>${shs.map(x=>{ const c=capOf(p,x); return `<span style="display:flex;gap:4px;align-items:center;font-size:.82rem"><span class="chip sh-${x}">${x}</span>min <input type="number" min="0" max="9" data-cap="${esc(rk)}|${x}|0" value="${c.min}" style="width:46px"> max <input type="number" min="1" max="9" data-cap="${esc(rk)}|${x}|1" value="${c.max}" style="width:46px"></span>`; }).join("")}</div>`; })()}
   </div>`).join("")}</div>
  <div class="panel"><h2>Rotazioni jolly</h2><p class="muted" style="margin:0;font-size:.85rem">Chi è in queste rotazioni copre anche TC e RM quando chi è in rotazione non basta. Le altre sale (RX, Ecografia, Senologia…) le copre solo chi è nella loro rotazione.</p>
   <div class="pickers">${S.rotations.map(r=>`<button data-act="jolly" data-id="${r.id}" aria-pressed="${!!r.jolly}">${esc(r.name)}</button>`).join("")}</div></div>
  <div class="panel"><h2>Orari e limiti</h2>
   <div class="row">${SH.map(s=>`<label class="row" style="gap:6px"><span class="chip sh-${s}">${SHN[s]}</span><input id="hour-${s}" data-hour="${s}" value="${esc(S.hours[s])}" style="width:6.5em"></label>`).join("")}</div>
   <div class="row"><label class="row" style="gap:8px">Turni ideali a settimana <input type="number" min="1" max="14" id="targetweek" data-lim="targetWeek" value="${S.targetWeek}"></label><label class="row" style="gap:8px">Turni max a settimana <input type="number" min="1" max="14" id="maxweek" data-lim="maxWeek" value="${S.maxWeek}"></label>
   <label class="row" style="gap:8px">Presenza minima per rotazione (%) <input type="number" min="0" max="100" id="minpres" data-lim="minPresence" value="${S.minPresence}"></label>
   <label class="row" style="gap:8px">Notti max a settimana <input type="number" min="0" max="7" id="maxn" data-lim="maxNightsWeek" value="${S.maxNightsWeek}"></label></div>
   <p class="muted" style="margin:0;font-size:.85rem">Regole fisse: un solo turno al giorno, mai due turni consecutivi; il giorno della notte è il monto e il giorno dopo è lo smonto: in nessuno dei due si lavora di giorno. Il tool resta entro i turni ideali (così chi lavora il sabato ha un riposo in settimana) e arriva al massimo solo per coprire i buchi. Le settimane vanno da lunedì a domenica. La presenza minima si controlla da lunedì a sabato e conta come assenti solo ferie e congressi.</p></div>`;
}


/* modifiche al proprio orario fatte dai rappresentanti (accettando una bozza): finché non si tocca "Ho visto" */
function myChanges(){ const pid=myAnyPid(); if(!pid) return {pid,list:[]}; const st=S.residents.some(r=>r.id===pid)?S:yState(yearOfPid(pid)); if(!st) return {pid,list:[]};
  let seen=""; try{ seen=localStorage.getItem("turni.chseen."+pid)||""; }catch(e){}
  const list=[]; for(const mk in (st.months||{})) ((st.months[mk]||{}).changes||[]).forEach(c=>{ if(c.pid===pid&&c.at>seen) list.push({...c,mk}); });
  list.sort((a,b)=>a.d.localeCompare(b.d)||a.at.localeCompare(b.at)); return {pid,list,st}; }
function changesPanel(){ const {list,st}=myChanges(); if(!list.length) return "";
  const nm=k=>{ const [pid,sh]=k.split("|"), post=(st.posts||[]).find(x=>x.id===pid); return sh==="N"?"Notte":sh==="D"?"Guardia":`${esc(post?post.name:pid)} ${SHN[sh]}`; };
  const desc=ks=>ks.length?ks.map(nm).join(" + "):"Libero";
  /* per ogni giorno l'ultima modifica, confrontata con lo stato di partenza */
  const by={}; list.forEach(c=>{ if(!by[c.d]) by[c.d]={from:c.from,to:c.to,who:c.by,mk:c.mk}; else { by[c.d].to=c.to; if(c.by) by[c.d].who=c.by; } });
  /* solo le modifiche ancora in vigore: l'orario di oggi (con i cambi accettati) deve essere quello della modifica */
  const pid=myAnyPid(), nowOf=(mk,d)=>{ const sc=st===S?(effSched(mk)||{}):(((st.months||{})[mk]||{}).sched||{}); return Object.keys(sc[d]||{}).filter(k=>(sc[d][k]||[]).includes(pid)).sort().join(); };
  const rows=Object.keys(by).sort().filter(d=>by[d].from.join()!==by[d].to.join()&&nowOf(by[d].mk,d)===[...by[d].to].sort().join());
  if(!rows.length) return "";
  return `<div class="panel" style="border:2px solid var(--accent)"><h2>Modifiche al tuo orario</h2><p class="muted" style="margin:0;font-size:.85rem">L'orario pubblicato è stato aggiornato:</p>
    <ul style="margin:0;padding-left:18px">${rows.map(d=>`<li><strong>${fmt(d,true)}</strong>: ${desc(by[d].from)} → <strong>${desc(by[d].to)}</strong>${by[d].who?` <span class="muted" style="font-size:.82rem">· modificato da ${esc(by[d].who)}</span>`:""}</li>`).join("")}</ul>
    <div class="row"><button class="btn" data-act="chseen">Ho visto</button></div></div>`; }
function vCambi(){ if(!S.residents.length) return monthBar()+noRes();
  const mk=UI.mk, mo=M(mk), SC=effSched(mk), me=myPid(), all=swapsOf(mk);
  let h=monthBar()+changesPanel();
  if(!MYUID){
    h+=`<div class="panel"><h2>Cambi turno</h2><p class="muted" style="margin:0">Per chiedere o accettare un cambio accedi con la tua email.</p></div>`;
  } else if(!me){
    h+=claimPanel("Tocca il tuo nome per collegarlo al tuo account. Serve una volta sola: così solo tu puoi accettare i cambi che ti riguardano e modificare le tue indisponibilità.");
  } else {
    h+=`<div class="panel" style="gap:4px"><div class="row" style="justify-content:space-between"><h2>Cambi turno</h2><span class="chip">Sei ${esc(resName(me))}</span></div><p class="muted" style="margin:0;font-size:.85rem">Il collega deve accettare. Se il cambio forza una regola, prima di accettare compare un avviso con cosa comporta.</p></div>`;
    if(!SC) h+=`<div class="panel empty"><p>I turni di ${monthName(mk)} non sono ancora stati generati: i cambi si potranno chiedere dopo.</p></div>`;
    else {
      const inbox=all.filter(x=>x.status==="pending"&&(x.needs?x.needs.includes(me)&&!(x.acc||[]).includes(me):x.to===me));
      if(inbox.length) h+=`<div class="panel"><h2>Richieste per te <span class="chip">${inbox.length}</span></h2><div class="stack" style="gap:8px">${inbox.map(x=>swCard(x,true)).join("")}</div></div>`;
      const F=UI.sw=UI.sw||{}; const mine=shiftsOf(SC,me).filter(x=>x.d>=swapMinDay());
      if(F.a&&!mine.some(x=>x.d+"#"+x.k===F.a)) F.a="";
      const others=S.residents.filter(r=>r.id!==me&&inGem(mo,r.id));
      const theirs=F.to?shiftsOf(SC,F.to).filter(x=>x.d>=swapMinDay()):[];
      let prev="";
      let linkHtml="";
      if(F.a&&F.to){ const [ad,ak]=F.a.split("#"), x={from:me,to:F.to,a:{d:ad,k:ak},b:F.b?{d:F.b.split("#")[0],k:F.b.split("#")[1]}:null};
        const links=nightLinks(mk,x); F.ex=F.ex||{};
        x.extra=links.filter(e=>F.ex[e.d+"#"+e.k+"#"+e.giver]!==false);
        UI.swExtra=x.extra;
        linkHtml=links.map(e=>{ const id=e.d+"#"+e.k+"#"+e.giver, on=F.ex[id]!==false, lab=slotLabel(e), when=e.same?"il giorno di monto":"il giorno di smonto";
          const q=e.giver===me?`Cedi a ${esc(resName(e.taker))} anche il tuo turno ${lab}? È ${when} della notte del ${fmt(e.night)}: così rispetti ${e.same?"il monto":"lo smonto"}.`
                              :`Prendi tu anche il turno di ${esc(resName(e.giver))} ${lab}? È ${when} della notte del ${fmt(e.night)}: così ${esc(resName(e.giver))} rispetta ${e.same?"il monto":"lo smonto"}.`;
          return `<div class="stack" style="gap:6px;border:1px solid var(--line);border-radius:8px;padding:10px"><span style="font-size:.9rem">${q}</span><div class="pickers sm"><button data-act="swex" data-id="${id}" data-v="1" aria-pressed="${on}">Sì, scambia anche questo</button><button data-act="swex" data-id="${id}" data-v="0" aria-pressed="${!on}">No</button></div></div>`; }).join("");
        const w=swapWarnings(mk,x);
        prev=!w.ok?`<div class="alerts bad">Questo cambio non è possibile con l'orario attuale.</div>`:((w.from.length||w.to.length)?warnBox(w,me,F.to):`<div class="okline">Il cambio rispetta tutte le regole.</div>`)+freeBox([["per te",w.freeFrom],["per "+esc(resName(F.to)),w.freeTo]]);
        UI.swPrev=w; }
      h+=`<div class="panel"><h2>Chiedi un cambio</h2><p class="muted" style="margin:0;font-size:.84rem">Si possono cambiare solo i turni da ${fmt(swapMinDay(),true)} in poi (al massimo ${SWAP_BACK} giorni fa).</p>
       <label class="stack" style="gap:4px"><span class="label">Il tuo turno</span><select id="swA" data-sw="a"><option value="">Scegli…</option>${mine.map(x=>`<option value="${x.d}#${x.k}" ${F.a===x.d+"#"+x.k?"selected":""}>${slotLabel(x)}</option>`).join("")}</select></label>
       <label class="stack" style="gap:4px"><span class="label">Collega</span><select id="swTo" data-sw="to"><option value="">Scegli…</option>${others.map(r=>`<option value="${r.id}" ${F.to===r.id?"selected":""}>${esc(rName(r))} · ${esc(rotName(mo.rot[r.id]))}</option>`).join("")}</select></label>
       <label class="stack" style="gap:4px"><span class="label">In cambio prendi</span><select id="swB" data-sw="b" ${F.to?"":"disabled"}><option value="">Niente: cedo il turno</option>${theirs.map(x=>`<option value="${x.d}#${x.k}" ${F.b===x.d+"#"+x.k?"selected":""}>${slotLabel(x)}</option>`).join("")}</select></label>
       ${linkHtml?`<span class="label">Turni collegati alla notte</span>${linkHtml}`:""}
       ${prev}
       <div class="row"><button class="btn primary" data-act="swsend" ${F.a&&F.to&&UI.swPrev&&UI.swPrev.ok?"":"disabled"}>${UI.swPrev&&UI.swPrev.ok&&(UI.swPrev.from.length||UI.swPrev.to.length)?"Invia comunque la richiesta":"Invia richiesta"}</button></div></div>`;
      const out=all.filter(x=>x.status==="pending"&&x.from===me);
      if(out.length) h+=`<div class="panel"><h2>In attesa di risposta</h2><div class="stack" style="gap:8px">${out.map(x=>swCard(x,false,true)).join("")}</div></div>`;
    }
  }
  if(ADMIN()&&SC){ const cf=conflictsOf(mk);
    if(cf.length) h+=`<div class="panel" style="border:2px solid var(--bad)"><h2>Conflitti da risolvere <span class="chip">${cf.length}</span></h2><p class="muted" style="margin:0;font-size:.85rem">Turni assegnati a chi poi ha segnato indisponibilità, ferie o congresso.</p>
      <div class="list">${cf.map(c=>{const pend=pendingFor(c);return `<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(resName(c.pid))}</span><span style="font-size:.85rem">${slotLabel(c)}</span>${pend?`<span class="muted" style="font-size:.78rem">Richiesta inviata a ${esc(resName(pend.to))}</span>`:""}</span><button class="btn primary" data-act="planc" data-id="${c.pid}~${c.d}">Programma un cambio</button></div>`;}).join("")}</div></div>`; }
  if(ADMIN()&&SC) h+=manualPanel(mk,SC,mo);
  if(ADMIN()){ const acc=Object.values(SW).filter(x=>x.status==="accepted"), nuovi=acc.filter(x=>!x.reported);
    h+=`<div class="panel"><div class="row" style="justify-content:space-between"><h2>Cambi da inserire nell'orario ufficiale</h2><span class="chip ${nuovi.length?"tag-C":""}">${nuovi.length} nuovi</span></div>
     <p class="muted" style="margin:0;font-size:.85rem">Scarica l'elenco dei cambi accettati e non ancora riportati: dopo il download vengono segnati come riportati, così la volta successiva trovi solo quelli nuovi.</p>
     <div class="row"><button class="btn primary" data-act="rep" data-all="0" ${nuovi.length?"":"disabled"}>Scarica i ${nuovi.length} nuovi (Excel)</button><button class="btn" data-act="repcopy" ${nuovi.length?"":"disabled"}>Copia come testo</button><button class="btn" data-act="rep" data-all="1" ${acc.length?"":"disabled"}>Scarica tutti (${acc.length})</button></div></div>`; }
  const forced=HIDESWAPS&&!ADMIN(), onlyMine=forced||(UI.swMine&&!!me);
  const done=all.filter(x=>x.status!=="pending"&&(!onlyMine||swInvolves(x,me))).reverse();
  h+=`<div class="panel"><div class="row" style="justify-content:space-between"><h2>Storico cambi di ${monthName(mk)}</h2>${!forced&&me?`<span class="pickers sm"><button data-act="swmine" data-v="0" aria-pressed="${!onlyMine}">Tutti</button><button data-act="swmine" data-v="1" aria-pressed="${onlyMine}">Solo i miei</button></span>`:""}</div>${done.length?`<div class="stack" style="gap:8px">${done.map(x=>swCard(x,false,false,ADMIN()&&(x.status!=="accepted"||x.applied))).join("")}</div>`:`<p class="muted" style="margin:0">Nessun cambio per ora.</p>`}</div>`;
  return h; }
function linkedPanel(){ let h=""; if(OWNER){ const bad=CLAIMDOCS.filter(x=>CLAIMS[x.pid]!==x.u||!(MULTI?yearOfPid(x.pid):S.residents.some(r=>r.id===x.pid)));
    if(bad.length) h+=`<div class="panel" style="border:2px solid var(--bad)"><h2>Associazioni da sistemare</h2><p class="muted" style="margin:0;font-size:.85rem">Account associati a un nome già preso da un altro account o a un nome che non esiste più. Scollegali: potranno scegliere di nuovo il proprio nome.</p>
      <div class="list">${bad.map(x=>`<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(x.email||("account "+x.u.slice(0,6)+"…"))}</span><span class="muted" style="font-size:.8rem">scelto: ${esc(rNameAny(x.pid))}${CLAIMS[x.pid]&&CLAIMS[x.pid]!==x.u?" · già preso da un altro account":" · nome inesistente"}</span></span><button class="btn danger ${UI.confirm==="unlu-"+x.u?"confirm":""}" data-act="unlinku" data-u="${x.u}">${UI.confirm==="unlu-"+x.u?"Conferma":"Scollega"}</button></div>`).join("")}</div></div>`; const linked=S.residents.filter(r=>CLAIMS[r.id]);
    h+=`<div class="panel"><h2>Account collegati</h2><p class="muted" style="margin:0;font-size:.85rem">${linked.length} su ${S.residents.length}. Se qualcuno ha toccato il nome sbagliato, scollegalo.</p>${linked.length?`<div class="list">${linked.map(r=>`<div class="item"><span class="name-strong">${esc(rName(r))}</span><button class="btn danger ${UI.confirm==="unl-"+r.id?"confirm":""}" data-act="unlink" data-id="${r.id}">${UI.confirm==="unl-"+r.id?"Conferma":"Scollega"}</button></div>`).join("")}</div>`:""}</div>`; } return h; }
function warnBox(w,me,other){ return `<div class="alerts"><strong>Il cambio forza queste regole</strong><ul>${w.from.map(t=>`<li><strong>per te</strong>: ${t}</li>`).join("")}${w.to.map(t=>`<li><strong>per ${esc(resName(other))}</strong>: ${t}</li>`).join("")}</ul><span style="font-size:.85rem">${esc(resName(other))} vedrà questo avviso e dovrà confermarlo.</span></div>`; }
/* cambio inserito direttamente da un rappresentante: niente richiesta, si applica subito e finisce nello storico e nei cambi da inserire */
function manualPanel(mk,SC,mo){ const F=UI.msw=UI.msw||{}; const inG=S.residents.filter(r=>inGem(mo,r.id));
  const shA=F.from?shiftsOf(SC,F.from).filter(x=>x.d>=swapMinDay()):[]; const inG2=S.residents.filter(r=>inGem(mo,r.id)||(isBG(mo.rot[r.id])&&shiftsOf(SC,r.id).length)); if(F.a&&!shA.some(x=>x.d+"#"+x.k===F.a)) F.a="";
  const shB=F.to?shiftsOf(SC,F.to).filter(x=>x.d>=swapMinDay()):[];
  let links="", prev="", ok=false;
  if(F.from&&F.a&&F.to){ const [ad,ak]=F.a.split("#"), x={from:F.from,to:F.to,a:{d:ad,k:ak},b:F.b?{d:F.b.split("#")[0],k:F.b.split("#")[1]}:null};
    const L=nightLinks(mk,x); F.ex=F.ex||{}; x.extra=L.filter(e=>F.ex[e.d+"#"+e.k+"#"+e.giver]!==false); UI.mExtra=x.extra;
    links=L.map(e=>{ const id=e.d+"#"+e.k+"#"+e.giver, on=F.ex[id]!==false;
      return `<div class="stack" style="gap:6px;border:1px solid var(--line);border-radius:8px;padding:10px"><span style="font-size:.9rem">Passa anche ${slotLabel(e)} da ${esc(resName(e.giver))} a ${esc(resName(e.taker))}? È il giorno di ${e.same?"monto":"smonto"} della notte del ${fmt(e.night)}.</span><div class="pickers sm"><button data-act="mswex" data-id="${id}" data-v="1" aria-pressed="${on}">Sì</button><button data-act="mswex" data-id="${id}" data-v="0" aria-pressed="${!on}">No</button></div></div>`; }).join("");
    const w=swapWarnings(mk,x); ok=w.ok; UI.mWarn=w;
    prev=!w.ok?`<div class="alerts bad">Questo cambio non è possibile con l'orario attuale.</div>`
      :((w.from.length||w.to.length)?`<div class="alerts"><strong>Il cambio forza queste regole</strong><ul>${w.from.map(t=>`<li><strong>per ${esc(resName(F.from))}</strong>: ${t}</li>`).join("")}${w.to.map(t=>`<li><strong>per ${esc(resName(F.to))}</strong>: ${t}</li>`).join("")}</ul></div>`:`<div class="okline">Il cambio rispetta tutte le regole.</div>`)
       +freeBox([["per "+esc(resName(F.from)),w.freeFrom],["per "+esc(resName(F.to)),w.freeTo]]); }
  const sel=(id,key,opts,cur,ph,dis)=>`<select id="${id}" data-msw="${key}" ${dis?"disabled":""}><option value="">${ph}</option>${opts.map(([v,l])=>`<option value="${v}" ${cur===v?"selected":""}>${l}</option>`).join("")}</select>`;
  return `<div class="panel"><h2>Inserisci un cambio manuale</h2><p class="muted" style="margin:0;font-size:.85rem">Solo per i rappresentanti: il cambio si applica subito, senza chiedere conferma agli specializzandi, e compare nello storico e nei cambi da inserire.</p>
   <label class="stack" style="gap:4px"><span class="label">Chi cede</span>${sel("mswFrom","from",inG2.map(r=>[r.id,esc(rName(r))]),F.from,"Scegli…")}</label>
   <label class="stack" style="gap:4px"><span class="label">Il turno che cede</span>${sel("mswA","a",shA.map(x=>[x.d+"#"+x.k,slotLabel(x)]),F.a,"Scegli…",!F.from)}</label>
   <label class="stack" style="gap:4px"><span class="label">A chi</span>${sel("mswTo","to",S.residents.filter(r=>r.id!==F.from&&(inGem(mo,r.id)||isBG(mo.rot[r.id]))).map(r=>[r.id,esc(rName(r))+(isBG(mo.rot[r.id])?" · Bambin Gesù":"")]),F.to,"Scegli…")}</label>
   <label class="stack" style="gap:4px"><span class="label">In cambio prende</span>${sel("mswB","b",shB.map(x=>[x.d+"#"+x.k,slotLabel(x)]),F.b,"Niente: cessione del turno",!F.to)}</label>
   ${links?`<span class="label">Turni collegati alla notte</span>${links}`:""}${prev}
   <div class="row"><button class="btn primary ${UI.confirm==="mswgo"?"confirm":""}" data-act="mswgo" ${ok?"":"disabled"}>${UI.confirm==="mswgo"?"Tocca di nuovo per applicare":"Applica il cambio"}</button></div></div>`; }
function swCard(x,inbox,mineOut,canDel){ const st={pending:["In attesa","chip"],accepted:[x.manual?"Inserito":"Accettato","chip tag-F"],rejected:["Rifiutato","chip"],cancelled:["Annullato","chip"],invalid:["Non più valido","chip"]}[x.status]||["?","chip"];
  const txt=`<strong>${esc(resName(x.from))}</strong> cede <span class="name-strong">${slotLabel(x.a)}</span> a <strong>${esc(resName(x.to))}</strong>${x.b?` e prende <span class="name-strong">${slotLabel(x.b)}</span>`:" senza nulla in cambio"}${(x.extra||[]).map(e=>`<br><span style="font-size:.85rem">+ ${slotLabel(e)} passa da ${esc(resName(e.giver))} a ${esc(resName(e.taker))} (monto/smonto)</span>`).join("")}`;
  const manual=x.manual?`<span class="muted" style="font-size:.8rem">Inserito dal rappresentante${x.by&&x.by!=="owner"?" "+esc(resName(x.by)):""}${x.reason?" · per "+esc(x.reason):""}</span>`:(x.reason?`<span class="muted" style="font-size:.8rem">Proposto dal rappresentante per ${esc(x.reason)} di ${esc(resName(x.from))}</span>`:"");
  const waiting=x.status==="pending"&&x.needs?`<span class="muted" style="font-size:.8rem">Cambio a catena: in attesa di ${x.needs.filter(p=>!(x.acc||[]).includes(p)).map(p=>esc(resName(p))).join(", ")}</span>`:"";
  const forced=x.status==="accepted"&&x.forced&&x.forced.length?`<span class="muted" style="font-size:.8rem">Accettato forzando: ${x.forced.map(esc).join("; ")}</span>`:"";
  return `<div class="cand" style="cursor:default;grid-template-columns:minmax(0,1fr) auto"><span class="stack" style="gap:3px"><span>${txt}</span>${manual}${waiting}${forced}</span><span class="stack" style="gap:6px;align-items:flex-end"><span class="${st[1]}">${st[0]}</span>${inbox?`<button class="btn primary" data-act="swopen" data-id="${x.id}">Rispondi</button>`:""}${mineOut?`<button class="btn danger" data-act="swcancel" data-id="${x.id}">Annulla</button>`:""}${canDel?`<button class="btn danger ${UI.confirm==="swdel-"+x.id?"confirm":""}" data-act="swdel" data-id="${x.id}" title="${x.status==="accepted"?"Elimina solo la voce: l'orario resta com'è":"Elimina dallo storico"}">${UI.confirm==="swdel-"+x.id?(x.status==="accepted"?"Conferma (l'orario non cambia)":"Conferma"):"Elimina"}</button>`:""}</span></div>`; }
function showText(txt,list){ sheet(`<div class="row" style="justify-content:space-between"><h2>Cambi da inserire</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
  <p class="muted" style="margin:0">Seleziona il testo e copialo.</p><textarea id="reptxt" readonly style="width:100%;min-height:40vh;font:.85rem var(--f-mono);color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px">${esc(txt)}</textarea>
  <div class="row"><button class="btn primary" data-act="repmark">Segna come riportati</button><button class="btn" data-act="close">Chiudi</button></div>`);
  setTimeout(()=>{const t=document.getElementById("reptxt"); if(t){t.focus();t.select();}},50); }
/* risposta del terzo collega in un cambio a catena */
function thirdBody(x,id,me){ const e=(x.extra||[]).find(z=>z.taker===me); if(!e) return `<p>Questa richiesta non ti riguarda più.</p>`;
  const before=effSched(UI.mk), after=clone(before); applySwap(after,x);
  const b=new Set(personIssues(UI.mk,before,me)), mine=personIssues(UI.mk,after,me).filter(t=>!b.has(t)), w=swapWarnings(UI.mk,x);
  return `<p style="margin:0">Cambio a catena per ${esc(resName(x.from))}: <strong>${esc(resName(x.to))}</strong> prende ${slotLabel(x.a)} e <strong>tu prendi ${slotLabel(e)}</strong> al posto suo.</p>
   <p class="muted" style="margin:0;font-size:.86rem">Vale quando accettate entrambi.${(x.acc||[]).length?" Ha già accettato: "+x.acc.map(p=>esc(resName(p))).join(", ")+".":""}</p>
   ${(mine.length||w.holes.length)?`<div class="alerts bad"><strong>Attenzione: accettando, il cambio implica che</strong><ul>${w.holes.map(t=>`<li>${t}</li>`).join("")}${mine.map(t=>`<li><strong>per te</strong>: ${t}</li>`).join("")}</ul><span style="font-size:.85rem">Premendo Accetto confermi il cambio anche se queste regole non vengono rispettate.</span></div>`:`<div class="okline">Per te il cambio rispetta tutte le regole.</div>`}
   <div class="row"><button class="btn primary" data-act="swacc" data-id="${id}">Accetto</button><button class="btn danger" data-act="swrej" data-id="${id}">Non accetto</button></div>`; }
/* richieste non più possibili (un turno nel frattempo è cambiato): si annullano da sole */
const INVAL=new Set();
function autoInvalidate(){ if(!db||!S) return; for(const x of Object.values(SW)){ if(x.status!=="pending"||INVAL.has(x.id)) continue;
    const w0=swapDateOk(x)?null:{ok:false,old:true}; if(!w0&&!effSched(x.mk)) continue; const w=w0||swapWarnings(x.mk,x); if(w.ok) continue;
    INVAL.add(x.id); swWrite({...x,status:"invalid",decided:new Date().toISOString(),reason:w.old?`annullata: il turno è di più di ${SWAP_BACK} giorni fa`:"annullata: uno dei turni nel frattempo è cambiato"}); } }
function answerSheet(id){ const x=SW[id], me=myPid(); if(!x) return;
  const w=swapWarnings(x.mk,x); UI.swRole="to";
  if(!w.ok&&(w.old||effSched(x.mk))){ if(!INVAL.has(x.id)){ INVAL.add(x.id); swWrite({...x,status:"invalid",decided:new Date().toISOString(),reason:w.old?`annullata: il turno è di più di ${SWAP_BACK} giorni fa`:"annullata: uno dei turni nel frattempo è cambiato"}); }
    closeSheet(); toast("Richiesta annullata: uno dei turni nel frattempo è cambiato"); render(); return; }
  const body=!w.ok?`<div class="alerts bad">Il cambio non è più possibile: uno dei due turni nel frattempo è cambiato.</div><div class="row"><button class="btn" data-act="swinvalid" data-id="${id}">Chiudi la richiesta</button></div>`
   : (x.needs&&me!==x.to)?thirdBody(x,id,me):`<p style="margin:0">${esc(resName(x.from))} ti cede <strong>${slotLabel(x.a)}</strong>${x.b?` e prende il tuo <strong>${slotLabel(x.b)}</strong>`:", senza nulla in cambio"}.</p>
     ${x.needs?`<p class="muted" style="margin:0;font-size:.86rem">È un cambio a catena: vale quando accettano ${x.needs.map(p=>esc(resName(p))).join(" e ")}.${(x.acc||[]).length?" Ha già accettato: "+x.acc.map(p=>esc(resName(p))).join(", ")+".":""}</p>`:""}
     ${(x.extra||[]).length?`<div class="alerts" style="background:var(--accent-soft)"><strong>Insieme a questo cambio</strong><ul>${x.extra.map(e=>`<li>${slotLabel(e)}: da ${e.giver===me?"te":esc(resName(e.giver))} a ${e.taker===me?"te":esc(resName(e.taker))}</li>`).join("")}</ul></div>`:""}
     ${(w.from.length||w.to.length||w.holes.length)?`<div class="alerts bad"><strong>Attenzione: accettando, il cambio implica che</strong><ul>${w.holes.map(t=>`<li>${t}</li>`).join("")}${w.to.map(t=>`<li><strong>per te</strong>: ${t}</li>`).join("")}${w.from.map(t=>`<li><strong>per ${esc(resName(x.from))}</strong>: ${t}</li>`).join("")}</ul><span style="font-size:.85rem">Premendo Accetto confermi il cambio anche se queste regole non vengono rispettate.</span></div>`:`<div class="okline">Il cambio rispetta tutte le regole.</div>`}
     ${freeBox([["per te",w.freeTo],["per "+esc(resName(x.from)),w.freeFrom]])}
     <div class="row"><button class="btn primary" data-act="swacc" data-id="${id}">Accetto</button><button class="btn danger" data-act="swrej" data-id="${id}">Non accetto</button></div>`;
  sheet(`<div class="row" style="justify-content:space-between"><h2>Richiesta di cambio</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>${body}`); }
async function swWrite(x){ if(!db){toast("Accedi per gestire i cambi");return false;}
  try{ await db.collection("swaps").doc(x.id).set(x); SW[x.id]=x; return true; }
  catch(e){ toast(e&&e.code==="invalid_argument"?"Non hai i permessi per salvare":"Salvataggio non riuscito, riprova"); return false; } }
function swapMoves(x){ const m=[{d:x.a.d,k:x.a.k,da:x.from,a:x.to}]; if(x.b) m.push({d:x.b.d,k:x.b.k,da:x.to,a:x.from});
  (x.extra||[]).forEach(e=>m.push({d:e.d,k:e.k,da:e.giver,a:e.taker})); return m.sort((p,q)=>p.d.localeCompare(q.d)); }
function slotParts(k){ const [pid,s]=k.split("|"), post=postOf(pid); return {sala:post?post.name:pid, turno:SHN[s]+" ("+S.hours[s]+")"}; }
function reportText(list){ return list.map(x=>{ const names=x.b?`${resName(x.from)} ↔ ${resName(x.to)}`:`${resName(x.from)} → ${resName(x.to)}`;
  return `Inserisci cambio ${names}\n`+swapMoves(x).map(m=>{const sp=slotParts(m.k);return `  • ${fmt(m.d,true)}: ${sp.sala} ${sp.turno} passa da ${resName(m.da)} a ${resName(m.a)}`;}).join("\n"); }).join("\n\n"); }
async function markReported(list){ const at=new Date().toISOString(); for(const x of list) if(!x.reported) await swWrite({...x,reported:true,reportedAt:at}); render(); }
async function exportReport(all){ const acc=Object.values(SW).filter(x=>x.status==="accepted"&&(all||!x.reported)).sort((a,b)=>(a.decided||"").localeCompare(b.decided||""));
  if(!acc.length) return; if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
  const rows=[["Cambio","Data","Giorno","Sala","Turno","Da (prima)","A (dopo)","Accettato il","Regole forzate"]];
  acc.forEach((x,i)=>swapMoves(x).forEach(m=>{const sp=slotParts(m.k); rows.push([i+1,m.d.split("-").reverse().join("/"),DOW[isoDow(m.d)],sp.sala,sp.turno,resName(m.da),resName(m.a),x.decided?new Date(x.decided).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"}):"",(x.forced||[]).join("; ")]);}));
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(rows); ws["!cols"]=[{wch:7},{wch:11},{wch:6},{wch:16},{wch:22},{wch:20},{wch:20},{wch:15},{wch:60}];
  XLSX.utils.book_append_sheet(wb,ws,"Cambi da inserire");
  const tx=XLSX.utils.aoa_to_sheet(reportText(acc).split("\n").map(l=>[l])); tx["!cols"]=[{wch:110}]; XLSX.utils.book_append_sheet(wb,tx,"Testo");
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"}), now=new Date();
  const fname=`Cambi_da_inserire_${String(now.getDate()).padStart(2,"0")}-${String(now.getMonth()+1).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}.xlsx`;
  if(!downloads){toast("Il download non è disponibile in questa vista");return;}
  try{ const r=await downloads.save({filename:fname,data:new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})});
    if(r.status==="saved"||r.status==="delivered"){ toast("Elenco cambi scaricato"); await markReported(acc); } }
  catch(e){ if(e&&e.code!=="cancelled"&&e.code!=="declined") toast("Download non riuscito"); } }
let CONSOL=new Set();
async function consolidate(){ if(!ADMIN()||!S||!db) return; let changed=false;
  for(const x of Object.values(SW).sort((a,b)=>(a.decided||"").localeCompare(b.decided||""))){
    if(x.status!=="accepted"||x.applied||CONSOL.has(x.id)) continue; CONSOL.add(x.id);
    const mo=M(x.mk); const ok=mo.sched?applySwap(mo.sched,x):false; if(ok) changed=true;
    await swWrite({...x,applied:true,stale:!ok}); }
  if(changed){ persist(); render(); } }


/* ---------- programma un cambio: indisponibilità in conflitto con un turno già assegnato ---------- */
function conflictsOf(mk,onlyPid,onlyDay){ const mo=M(mk), SC=effSched(mk), out=[]; if(!SC) return out;
  for(const r of S.residents){ if(onlyPid&&r.id!==onlyPid) continue;
    for(const x of shiftsOf(SC,r.id)){ if(onlyDay&&x.d!==onlyDay) continue; const s=x.k.split("|")[1];
      if(blocked(unavOf(mo,r.id,x.d),s)) out.push({pid:r.id,d:x.d,k:x.k,s}); } }
  return out.sort((a,b)=>a.d.localeCompare(b.d)); }
function pendingFor(c){ return Object.values(SW).find(x=>x.status==="pending"&&x.from===c.pid&&x.a.d===c.d&&x.a.k===c.k); }
/* proposte per coprire il turno c di chi è diventato indisponibile, dalla migliore:
   1 sostituzione diretta da un collega libero quel giorno (con eventuale scambio di un suo turno per bilanciare)
   2 cambio di sala a catena: B lascia la sua postazione del giorno e prende c, un collega libero C prende quella di B
   3 spostamento: come la catena ma la postazione di B resta scoperta
   4 nessuno lo sostituisce */
const KORD={giorno:0,diretta:1,scambio:2,catena:3,sposta:4,lascia:5};
function planOptions(mk,c){ const mo=M(mk), SC=effSched(mk), post=postOf(c.k.split("|")[0]); if(!SC||!post) return [];
  const days=period(mk).days, di=days.indexOf(c.d), A=c.pid, day=c.d, nightish=k=>/\|[ND]$/.test(k);
  const onDay=pid=>shiftsOf(SC,pid).filter(y=>y.d===day);
  const near=pid=>shiftsOf(SC,pid).filter(y=>Math.abs(days.indexOf(y.d)-di)<=3).length;
  const poolOf=(p,s)=>{ const {pri,jol}=pools(mo,p,s); return [...pri.map(r=>({r,primary:true})),...jol.map(r=>({r,primary:false}))]; };
  const out=[];
  const add=(kind,x,pid,extra)=>{ const w=swapWarnings(mk,x); if(!w.ok) return null;
    const o={kind,x,w,pid,score:(w.from.length+w.to.length)*3+w.holes.length,load:pid?near(pid):0,...extra}; out.push(o); return o; };
  const cands=poolOf(post,c.s).filter(o=>o.r.id!==A);
  for(const {r:B,primary} of cands){
    const busy=onDay(B.id);
    if(!busy.length){
      /* 1. sostituzione diretta */
      const x={from:A,to:B.id,a:{d:day,k:c.k},b:null}; x.extra=nightLinks(mk,x);
      const o=add("diretta",x,B.id,{primary});
      /* variante: scambio con un turno di B nei 7 giorni vicini che A può fare, per non caricare B */
      if(o){ let best=null;
        for(const y of shiftsOf(SC,B.id)){ const dj=days.indexOf(y.d); if(Math.abs(dj-di)>7||y.d===day) continue;
          const xs={from:A,to:B.id,a:{d:day,k:c.k},b:{d:y.d,k:y.k}}; xs.extra=nightLinks(mk,xs); const w=swapWarnings(mk,xs);
          if(w.ok&&!w.from.length&&!w.to.length&&!w.holes.length&&(!best||Math.abs(dj-di)<best.dist)) best={xs,w,dist:Math.abs(dj-di)}; }
        if(best) out.push({kind:"scambio",x:best.xs,w:best.w,pid:B.id,score:0,load:near(B.id),primary}); }
    } else if(busy.length===1&&!nightish(busy[0].k)&&!nightish(c.k)){
      const y=busy[0], postY=postOf(y.k.split("|")[0]), sY=y.k.split("|")[1];
      /* 0. scambio nella stessa giornata (proposta preferita): B prende il turno di A, A prende quello di B (mattina ↔ pomeriggio) */
      const uA=unavOf(mo,A,day)||"";
      if(sY!==c.s&&/^[MP]$/.test(sY)&&/^[MP]$/.test(c.s)&&!FULL[uA]&&!uA.includes(sY)&&poolOf(postY,sY).some(o=>o.r.id===A))
        add("giorno",{from:A,to:B.id,a:{d:day,k:c.k},b:{d:day,k:y.k}},B.id,{primary});
      /* 2. catena: un collega libero prende la postazione lasciata da B */
      let bestC=null;
      for(const {r:C} of poolOf(postY,sY)){ if(C.id===A||C.id===B.id||onDay(C.id).length) continue;
        const x={from:A,to:B.id,a:{d:day,k:c.k},b:null,extra:[{d:day,k:y.k,giver:B.id,taker:C.id}]}; const w=swapWarnings(mk,x); if(!w.ok) continue;
        const sc=(w.from.length+w.to.length+personIssuesNew(mk,x,C.id))*3+w.holes.length;
        if(!bestC||sc<bestC.score||(sc===bestC.score&&near(C.id)<bestC.loadC)) bestC={x,w,score:sc,loadC:near(C.id),C:C.id}; }
      if(bestC) out.push({kind:"catena",x:bestC.x,w:bestC.w,pid:B.id,third:bestC.C,score:bestC.score,load:near(B.id),primary});
      /* 3. spostamento: la postazione di B resta scoperta */
      add("sposta",{from:A,to:B.id,a:{d:day,k:c.k},b:null,extra:[{d:day,k:y.k,giver:B.id,taker:null}]},B.id,{primary});
    }
  }
  out.sort((p,q)=>(q.kind==="giorno")-(p.kind==="giorno")||p.score-q.score||KORD[p.kind]-KORD[q.kind]||(q.primary-p.primary)||p.load-q.load);
  /* al massimo 2 proposte per collega e 9 in tutto */
  const per={}, res=[]; for(const o of out){ per[o.pid]=(per[o.pid]||0)+1; if(per[o.pid]<=2&&res.length<9) res.push(o); }
  const xs={from:A,to:null,a:{d:day,k:c.k},b:null,extra:[]}, ws=swapWarnings(mk,xs);
  if(ws.ok) res.push({kind:"lascia",x:xs,w:ws,score:ws.holes.length,pid:null,primary:false,load:0,leave:true});
  return res; }
/* problemi nuovi per un terzo coinvolto nella catena */
function personIssuesNew(mk,x,pid){ const before=effSched(mk), after=clone(before); if(!applySwap(after,x)) return 99;
  const b=new Set(personIssues(mk,before,pid)); return personIssues(mk,after,pid).filter(t=>!b.has(t)).length; }
function optText(c,o){ const A=esc(resName(c.pid)), B=esc(resName(o.pid)), sl=slotLabel(c);
  if(o.kind==="diretta") return `<span class="chip tag-F">Sostituzione</span> <strong>${B}</strong>, libero quel giorno, prende ${sl}`;
  if(o.kind==="scambio") return `<span class="chip tag-F">Scambio</span> <strong>${B}</strong>, libero quel giorno, prende ${sl}; in cambio ${A} prende <strong>${slotLabel(o.x.b)}</strong>`;
  if(o.kind==="giorno") return `<span class="chip sh-P">Scambio in giornata</span> <strong>${B}</strong> prende ${sl}; in cambio ${A} prende <strong>${slotLabel(o.x.b)}</strong> di ${B}`;
  if(o.kind==="catena"){ const e=o.x.extra.find(z=>z.giver===o.pid); return `<span class="chip sh-P">Cambio di sala</span> <strong>${B}</strong> passa da ${slotLabel(e)} a ${sl}; <strong>${esc(resName(o.third))}</strong>, libero quel giorno, prende ${slotLabel(e)}`; }
  if(o.kind==="sposta"){ const e=o.x.extra.find(z=>z.taker===null); return `<span class="chip sh-M">Spostamento</span> <strong>${B}</strong> passa da ${slotLabel(e)} a ${sl}`; }
  return `<span class="chip">Scoperto</span> <strong>Nessuno lo sostituisce</strong>: ${A} viene tolto da ${sl}`; }
function planSheet(mk,list){ UI.plan={mk,list,opts:list.map(c=>planOptions(mk,c))};
  const body=list.map((c,ci)=>{ const pend=pendingFor(c), opts=UI.plan.opts[ci];
    return `<div class="stack" style="gap:8px"><div class="alerts bad"><strong>${esc(resName(c.pid))} è in turno: ${slotLabel(c)}</strong><span style="font-size:.85rem">L'indisponibilità inserita va in conflitto con questo turno.${pend?` Richiesta già inviata, in attesa.`:""}</span></div>
     ${opts.map((o,oi)=>{ const probs=[...o.w.holes.map(esc),...o.w.to.map(t=>"per "+esc(resName(o.pid))+": "+t),...o.w.from.map(t=>"per "+esc(resName(c.pid))+": "+t)];
       const night=(o.x.extra||[]).filter(e=>e.taker!==null&&e.giver!==o.pid);
       return `<div class="cand" style="cursor:default;grid-template-columns:minmax(0,1fr)"><span class="stack" style="gap:5px">
        <span>${optText(c,o)}</span>
        ${night.map(e=>`<span style="font-size:.82rem">+ ${slotLabel(e)} da ${esc(resName(e.giver))} a ${esc(resName(e.taker))} (monto/smonto)</span>`).join("")}
        ${o.leave?"":`<span class="muted" style="font-size:.8rem">${esc(rotName(mo_rot(mk,o.pid)))}${o.primary?"":" · jolly"} · ${o.load} turni nei 3 giorni vicini${o.kind==="catena"?" · servono le conferme di "+esc(resName(o.pid))+" e "+esc(resName(o.third)):""}</span>`}
        ${probs.length?`<span style="font-size:.82rem;color:var(--bad)">Problemi: ${probs.join("; ")}</span>`:`<span class="okline" style="font-size:.85rem">Rispetta tutte le regole</span>`}
        <span class="row" style="gap:6px">${o.leave?"":`<button class="btn primary" data-act="planreq" data-c="${ci}" data-o="${oi}">Invia richiesta</button>`}<button class="btn ${UI.confirm==="planapp-"+ci+"-"+oi?"confirm":""}" data-act="planapp" data-c="${ci}" data-o="${oi}">${UI.confirm==="planapp-"+ci+"-"+oi?"Tocca di nuovo: applica subito":"Applica subito"}</button></span>
      </span></div>`; }).join("")}</div>`; }).join("");
  sheet(`<div class="row" style="justify-content:space-between"><h2>Programma un cambio</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   <p class="muted" style="margin:0;font-size:.86rem">Prima lo scambio in giornata (mattina ↔ pomeriggio con un collega in turno quel giorno), poi le soluzioni che rispettano tutte le regole (sostituzione da chi è libero, scambio, cambio di sala a catena), poi quelle che lasciano una postazione scoperta, infine quelle che forzano una regola. "Invia richiesta" la manda in Cambi a chi deve accettare; "Applica subito" la inserisce come cambio manuale.</p>${body}`); }
function mo_rot(mk,pid){ return (M(mk).rot||{})[pid]; }
function maybePlan(mk,pid,d){ if(!ADMIN()) return false; const c=conflictsOf(mk,pid,d); if(!c.length) return false; planSheet(mk,c); return true; }

/* ---------- turni coperti dagli altri anni (import dal foglio "BOZZA ORARI") ---------- */
/* mo.ext: "giorno|postId|turno" → ["(3) Rossi", …]; quei turni non vengono assegnati ai nostri e non sono buchi */
/* TC e RM possono avere più persone: lì un altro anno non toglie il nostro posto (resta da coprire con priorità bassa, ma vuoto non è un buco) */
/* filtri per metodica in Turni "Per giorno": gruppi riconosciuti dal nome della sala (indipendenti dalle rotazioni salvate) */
const FGROUPS=[["TC","TC"],["RM","RM"],["ANGIO","Angiografia"],["DEA","DEA"],["SENO","Senologia"],["ECO","Ecografia"],["RX","RX"]];
function fgOf(p){ const k=normRoom(p.name); if(/^(diagsen|radsen)/.test(k)) return "SENO"; if(/^eco/.test(k)) return "ECO"; if(/^(rx|sala8)/.test(k)) return "RX";
  if(/^tc/.test(k)) return "TC"; if(/^rm/.test(k)) return "RM"; if(/^angio/.test(k)) return "ANGIO"; if(/^dea/.test(k)) return "DEA"; return p.cover; }
/* sala chiusa (rappresentanti, per giorno e turno): nessuno viene assegnato e non è un buco; vale per tutti gli anni (chiave con il nome normalizzato della sala) */
function saveYearsDoc(){ const om=oldestMk(); const cl={}; for(const mk in CLOSEDG) if(mk>=om&&Object.keys(CLOSEDG[mk]).length) cl[mk]=CLOSEDG[mk]; CLOSEDG=cl;
  const hy={}; for(const mk in HOLEY) if(mk>=om&&Object.keys(HOLEY[mk]).length) hy[mk]=HOLEY[mk]; HOLEY=hy;
  return db.doc("config/years").set({state:JSON.stringify({coverage:COVY,closed:cl,colors:YCOL,holes:hy,caps:CAPS}),updated:new Date().toISOString()}); }
function closedN(mk,d,rn,sh){ const k=d+"|"+rn+"|"+sh; if(CLOSEDG[mk]&&CLOSEDG[mk][k]) return true; for(const y of (MULTI?YRS(mk):[CURY])){ const st=y===CURY?S:yState(y), m=st&&st.months&&st.months[mk]; if(m&&m.closed&&m.closed[k]) return true; } return false; }
function isClosed(mo,d,key){ const [pid,sh]=key.split("|"), p=postOf(pid); return !!p&&closedN(mo.mk,d,normRoom(p.name),sh); }
/* persone per sala e turno, contando tutti gli anni (min e max, modificabili in Impostazioni: config/years caps);
   py = "tendenzialmente una per anno" (DEA mattina/pomeriggio e guardia) */
const CAP_DEF={rxtorace:{M:[2,2],P:[1,1]},eco:{M:[1,2],P:[1,2]},radsen1:{M:[1,2],P:[1,2]},radsen2:{M:[1,2],P:[1,2]},dea:{M:[2,3],P:[2,3],N:[1,1],D:[3,3]}};
const PY_DEF={dea:["M","P","D"]};
let CAPS={};
function capRaw(rn,s){ let v=(CAPS[rn]||{})[s]||(CAP_DEF[rn]||{})[s]; if(!v&&/^(tc[1-4]|rm[1-5])$/.test(rn)&&(s==="M"||s==="P")) v=[1,3]; return v||[1,1]; }
function capOf(p,s){ const rn=normRoom(p.name), v=capRaw(rn,s), mn=Math.max(0,+v[0]||0), mx=Math.max(mn,1,+v[1]||1); return {min:mn,max:mx,py:(PY_DEF[rn]||[]).includes(s)}; }
function multiPost(p,s){ if(!p) return false; return s?capOf(p,s).max>1:["M","P"].some(x=>capOf(p,x).max>1); }
/* anni sotto (nella cascata) che coprono questa sala: per le sale "una per anno" ognuno ne mette una e lascia il resto a loro */
function lowerCovers(post,mk){ return MULTI&&YRS(mk).some(y=>y<CURY&&(((yState(y)||{}).residents)||[]).length&&yearsFor(post).includes(yLab(y))); }
/* quante persone di quest'anno servono ancora (min meno gli altri anni; "una per anno" se ci sono anni sotto) */
function needOf(mo,d,key){ const [pid,s]=key.split("|"), p=postOf(pid); if(!p) return 0; const c=capOf(p,s), oth=othersIn(mo,d,key); let n=Math.max(0,c.min-oth); if(c.py&&lowerCovers(p,mo.mk)) n=Math.min(n,1); return n; }
function extCovered(mo,d,key){ const [pid,s]=key.split("|"), p=postOf(pid); return !!p&&othersIn(mo,d,key)>=capOf(p,s).max && !(mo.fixed||{})[d+"|"+key+"|0"]; }
const EXT_MAN="Altri anni (inserito a mano)";
function extHas(mo,d,key){ return !!EXT(mo)[d+"|"+key]; }
/* sale TC/RM: al massimo 3 persone in tutto (anni diversi); stesso anno insieme solo per 2° e 3° anno, segnalato */
const ROOM_MAX=3;
function curYear(){ return yLab(S.groupYear||2); }
function sameYearOk(y){ return y===2||y===3; }
function othersIn(mo,d,key){ return (EXT(mo)[d+"|"+key]||[]).length+(lowerOnly(mo,d,key)||[]).length; }
/* turni scoperti assegnati a un anno: spettano solo a quell'anno (gli altri anni non li coprono) e per quell'anno vengono per primi */
function myNeed(mo,d,key){ const base=needOf(mo,d,key), tags=unsatTags(mo,d,key,[]); if(!tags.length) return {need:base,nL:0,nO:0};
  const L=curYear(), nL=tags.filter(l=>l===L).length, nO=tags.length-nL, [pid,s]=key.split("|"), p=postOf(pid), room=p?Math.max(0,capOf(p,s).max-othersIn(mo,d,key)):0;
  return {need:Math.min(room,Math.max(base-nO,nL)),nL,nO}; }
function roomCovered(mo,d,key){ return needOf(mo,d,key)===0; }
/* allinea l'orario già presente: i turni coperti da altri anni restano vuoti (non buchi), gli altri tornano da coprire */
function syncExt(mo){ TICK++; for(const sc of [mo.sched,hasDraft(mo)?mo.draft.sched:null]){ if(!sc) continue;
  for(const d in sc) for(const k in sc[d]){ const a=sc[d][k];
    if(extCovered(mo,d,k)){ if(!a.some(x=>x)) sc[d][k]=[]; }
    else if(!a.length) sc[d][k]=[null]; } } }
const NRC=new Map(); function normRoom(x){ const sx=String(x||""); let v=NRC.get(sx); if(v===undefined){ v=normRoom0(sx); NRC.set(sx,v); } return v; }
function normRoom0(x){ let k=String(x||"").toLowerCase().replace(/\(.*?\)/g,"").replace(/angiografia/g,"angio").replace(/ecografia/g,"eco").replace(/[^a-z0-9]/g,"");
  /* nomi del foglio "BOZZA ORARI" → sale dell'app */
  if(/^diagn?sen/.test(k)) k="diagsen";
  else if(/cemi/.test(k)) k="tccemi0";                 // "TC - CEMI 0" = TC 0 CEMI
  else if(/^rxurogen/.test(k)||k==="sala8") k="sala8"; // "RX Uro-Gen/Dig" = Sala 8
  else if(/^urgenze/.test(k)) k="rxtorace";            // "Urgenze, Torace, Scheletro (I)" (pomeriggio) = RX Torace
  return k; }
/* foglio: riga 1 = giorni ("LUN 05"), colonna A = sala (le righe sotto senza nome sono la stessa sala),
   prima della riga "POMERIGGIO" mattina, dopo pomeriggio; riga "NOTTE" = notti; domenica e festivi DEA = guardia */
function parseExt(rows,mk){
  const days=period(mk).days, hdr=rows[0]||[], col={}; let last=-1, bad=0;
  for(let c=1;c<hdr.length;c++){ const m=String(hdr[c]||"").match(/(\d{1,2})/); if(!m) continue; const n=+m[1];
    for(let i=last+1;i<days.length;i++) if(D(days[i]).getUTCDate()===n){ col[c]=days[i]; last=i; break; }
    /* controllo: il giorno della settimana scritto nel foglio deve coincidere (evita di leggere la scheda di un altro mese) */
    const w=String(hdr[c]||"").trim().slice(0,3).toLowerCase(); if(col[c]&&/^(lun|mar|mer|gio|ven|sab|dom)$/.test(w)&&DOW[isoDow(col[c])].toLowerCase()!==w) bad++; }
  const postBy={}; S.posts.forEach(p=>{ postBy[normRoom(p.name)]=p; postBy[normRoom(p.id)]=postBy[normRoom(p.id)]||p; });
  const nightPost=S.posts.find(p=>Object.values(p.on||{}).some(a=>(a||[]).includes("N")));
  const ourId={}; S.residents.forEach(r=>ourId[r.name.trim().toLowerCase()]=r.id); const ours=new Set(Object.keys(ourId));
  /* ownMap: dove il foglio mette i nostri; seen: sale/turni presenti nel foglio (per sapere dove il foglio "fa testo") */
  const map={}, ownMap={}, all={}, seen=new Set(), unknown=new Set(); let sec="M", room=null, own=0;
  for(let r=1;r<rows.length;r++){ const row=rows[r]||[], a=String(row[0]||"").trim();
    if(/^pomeriggio/i.test(a)){ sec="P"; room=null; continue; }
    if(a){ if(/^notte/i.test(a)) room={night:true}; else { const p=postBy[normRoom(a)]; room=p?{post:p}:null; if(!p) unknown.add(a); } }
    if(!room) continue;
    if(room.night) seen.add("N"); else { seen.add(room.post.id+"|"+sec); if(sec==="M") seen.add(room.post.id+"|D"); }
    for(const c in col){ const v=String(row[c]??"").trim(); if(!v) continue; const d=col[c], t=dayType(d);
      let post=room.night?nightPost:room.post, sh=room.night?"N":sec;
      if(!room.night&&t==="fes"&&(post.on.fes||[]).includes("D")) sh="D";
      if(!post||!(post.on[t]||[]).includes(sh)) continue;
      const sur=v.replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase();
      { const ak=d+"|"+normRoom(post.name)+"|"+sh; (all[ak]=all[ak]||[]).includes(v)||all[ak].push(v); }
      if(ours.has(sur)){ own++; const k=d+"|"+post.id+"|"+sh; (ownMap[k]=ownMap[k]||[]).includes(ourId[sur])||ownMap[k].push(ourId[sur]); continue; }
      const k=d+"|"+post.id+"|"+sh; map[k]=map[k]||[]; if(!map[k].includes(v)) map[k].push(v); } }
  const seenRooms=[...seen].map(x=>x==="N"?"N":(()=>{ const [pid,sh]=x.split("|"), p=postOf(pid); return p?normRoom(p.name)+"|"+sh:x; })());
  return {map,ownMap,all,seen,seenRooms,colDays:Object.values(col),unknown:[...unknown],own,cols:Object.keys(col).length,bad}; }
/* foglio condiviso tra gli anni: ogni import salva tutte le voci del mese (mo.sheet = {at, all, rooms, days}); ogni anno le vede
   (gli altri anni come "coperti", i propri come turni da allineare nella bozza) */
function sheetSave(mo,res){ const same=mo.sheet&&JSON.stringify(mo.sheet.all)===JSON.stringify(res.all); if(same){ return false; }
  mo.sheet={at:new Date().toISOString(),all:res.all,rooms:res.seenRooms,days:res.colDays}; mo.sheetAt=mo.sheet.at; return true; }
/* all'apertura (rappresentanti): se un altro anno ha caricato un foglio più recente, la bozza di quest'anno si allinea ai propri nomi */
let SALIGN=false;
function runSheetAlign(){ if(SALIGN||!S||!ADMIN()) return; SALIGN=true; let n=0; const [y0,m0]=todayMk().split("-").map(Number);
  for(let k=-KEEP_MONTHS;k<=KEEP_MONTHS;k++){ const mk=mkOf(y0,m0+k); if(sheetLatest(mk)) n+=sheetAlign(mk); }
  if(n){ persist(); render(); toast(`${n} turni del tuo anno presi dal foglio caricato da un altro anno: sono nella bozza, da accettare`); } }
function sheetLatest(mk){ let best=null; for(const y of (MULTI?ALLY():[CURY])){ const st=y===CURY?S:yState(y); const sh=st&&st.months&&st.months[mk]&&st.months[mk].sheet; if(sh&&(!best||sh.at>best.at)) best=sh; } return best; }
/* voci del foglio per l'anno corrente: chiave con la sala dell'anno, esclusi i nostri */
function sheetExt(mk){ const sh=sheetLatest(mk); if(!sh) return {}; const by={}; S.posts.forEach(p=>by[normRoom(p.name)]=p);
  const mine=new Set(S.residents.map(r=>r.name.trim().toLowerCase())), out={};
  const rst=((S.months[mk]||{}).extReset)||{};
  for(const ak in sh.all){ const [d,rk,s]=ak.split("|"), p=rk==="N"?S.posts.find(x=>Object.values(x.on||{}).some(a=>(a||[]).includes("N"))):by[rk]; if(!p) continue; if(rst[d]&&rst[d]>=sh.at) continue;
    const names=sh.all[ak].filter(v=>!mine.has(v.replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase())); if(names.length) out[d+"|"+p.id+"|"+s]=names; }
  return out; }
/* allinea la bozza dell'anno corrente a un foglio caricato da un altro anno (una volta per foglio) */
function sheetAlign(mk){ TICK++; if(!ADMIN()||!S) return 0; const mo=M(mk), sh=sheetLatest(mk); if(!sh||(mo.sheetAt&&mo.sheetAt>=sh.at)) return 0;
  const by={}; S.posts.forEach(p=>by[normRoom(p.name)]=p); const night=S.posts.find(x=>Object.values(x.on||{}).some(a=>(a||[]).includes("N")));
  const ourId={}; S.residents.forEach(r=>ourId[r.name.trim().toLowerCase()]=r.id); const ownMap={}; let own=0;
  for(const ak in sh.all){ const [d,rk,s]=ak.split("|"), p=s==="N"?night:by[rk]; if(!p) continue;
    sh.all[ak].forEach(v=>{ const id=ourId[v.replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase()]; if(id){ own++; const k=d+"|"+p.id+"|"+s; (ownMap[k]=ownMap[k]||[]).includes(id)||ownMap[k].push(id); } }); }
  const seen=new Set((sh.rooms||[]).map(x=>{ if(x==="N") return "N"; const [rk,s]=x.split("|"), p=by[rk]; return p?p.id+"|"+s:null; }).filter(Boolean));
  const rst=mo.extReset||{}; mo.sheetAt=sh.at; return alignOwn(mo,{own,ownMap,seen,colDays:(sh.days||[]).filter(d=>!(rst[d]&&rst[d]>=sh.at))}); }
/* aggiornamento automatico dal link salvato del foglio "BOZZA ORARI": quando un rappresentante apre l'app, al massimo ogni 3 ore,
   per il mese corrente e i successivi visibili. Aggiorna solo i turni coperti da altri anni (mattina/pomeriggio dal foglio;
   notti e guardie solo se il foglio le riporta); restano quelli segnati a mano. Poi si usa "Aggiorna l'orario". */
/* allinea la bozza ai nostri specializzandi come risultano nel foglio (sale/turni presenti nel foglio); restituisce quante caselle cambia */
/* giorni azzerati con «Azzera tutto»: l'aggiornamento automatico dal foglio non li riempie più (solo un nuovo import a mano li riprende) */
function skipReset(mo,res){ const rst=mo.extReset||{}; if(!Object.keys(rst).length) return res; const ok=k=>!rst[k.split("|")[0]], f=o=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>ok(k)));
  const ownMap=f(res.ownMap); return {...res,map:f(res.map),all:f(res.all),ownMap,own:Object.values(ownMap).reduce((a,v)=>a+v.length,0),colDays:(res.colDays||[]).filter(d=>!rst[d])}; }
function alignOwn(mo,res){ let moved=0; TICK++;
  const base=(hasDraft(mo)?mo.draft.sched:mo.sched)||{};
    if(res.own>0){ const nightKey=S.posts.find(x=>Object.values(x.on||{}).some(a=>(a||[]).includes("N")));
      for(const d of res.colDays){ for(const k in (base[d]||{})){ const [pid,sh]=k.split("|"); const sk=sh==="N"?"N":pid+"|"+sh; if(!res.seen.has(sk)) continue;
          const cur=(base[d][k]||[]).filter(x=>x), want=res.ownMap[d+"|"+k]||[];
          if(cur.length===want.length&&cur.every(x=>want.includes(x))) continue;
          const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=want.length?[...want]:(extCovered(mo,d,k)?[]:[null]);
          const fx=mo.fixed||{}; Object.keys(fx).filter(z=>z.startsWith(d+"|"+k+"|")).forEach(z=>delete fx[z]); want.forEach((x,i)=>fx[d+"|"+k+"|"+i]=x); mo.fixed=fx; moved++; }
        for(const kk in res.ownMap){ const [d2,pid,sh]=kk.split("|"); if(d2!==d) continue; const k=pid+"|"+sh; if((base[d]||{})[k]) continue;
          const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=[...res.ownMap[kk]]; res.ownMap[kk].forEach((x,i)=>{ mo.fixed=mo.fixed||{}; mo.fixed[d+"|"+k+"|"+i]=x; }); moved++; } } }
  return moved; }
let AUTOSYNC=false;
/* aggiornamento automatico dal foglio: disattivato su richiesta del proprietario (il foglio si importa solo a mano da Strumenti) */
async function autoSyncSheet(){ if(AUTOSYNC||!db||!S||!ADMIN()||!S.extSheetUrl||typeof XLSX==="undefined") return; AUTOSYNC=true;
  const key="turni.autosync."+CURY; try{ const last=+localStorage.getItem(key)||0; if(Date.now()-last<3*3600*1000) return; }catch(e){}
  const id=(S.extSheetUrl.match(/\/d\/([A-Za-z0-9_-]{20,})/)||[])[1]; if(!id) return;
  let changes=0, months=0, moved=0; const [y0,m0]=todayMk().split("-").map(Number);
  for(let k=0;k<=KEEP_MONTHS;k++){ const mk=mkOf(y0,m0+k), mn=monthName(mk), names=[mn.charAt(0).toUpperCase()+mn.slice(1),mn.toUpperCase(),mn];
    let res=null;
    for(const nm of names){ try{ const r=await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(nm)}`); if(!r.ok) continue; const txt=await r.text(); if(/^\s*</.test(txt)) continue;
        const wb=XLSX.read(txt,{type:"string",raw:true}), rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""}), p=parseExt(rows,mk);
        if(p.cols>=7&&!p.bad){ res=p; break; } }catch(e){} }
    if(!res) continue; months++;
    const mo=M(mk); res=skipReset(mo,res); const old=mo.ext||{}, next={};
    for(const kk in old){ const sh=kk.split("|")[2]; if(old[kk].includes(EXT_MAN)) next[kk]=[EXT_MAN]; if((sh==="N"||sh==="D")&&!res.map[kk]) next[kk]=[...(next[kk]||[]),...old[kk].filter(x=>x!==EXT_MAN)]; }
    for(const kk in res.map) next[kk]=[...res.map[kk],...((next[kk]||[]).filter(x=>x===EXT_MAN))];
    const all=new Set([...Object.keys(old),...Object.keys(next)]); let ch=0; all.forEach(kk=>{ if(JSON.stringify(old[kk]||[])!==JSON.stringify(next[kk]||[])) ch++; });
    if(ch){ mo.ext=next; syncExt(mo); changes+=ch; }
    if(sheetSave(mo,res)) changes++; SEXC.key=null;
    /* i nostri: se nel foglio sono stati spostati, la bozza si allinea al foglio (da accettare) */
    moved+=alignOwn(mo,res); }
  try{ localStorage.setItem(key,String(Date.now())); }catch(e){}
  if(changes||moved){ persist(); render(); toast([changes?`Turni degli altri anni aggiornati dal foglio: ${changes} modifiche`:"",moved?`${moved} turni dei nostri cambiati nel foglio: aggiornati nella bozza, da accettare`:""].filter(Boolean).join(". ")+(changes?". Usa «Aggiorna l'orario» per ridistribuire.":".")); } }
function extPreview(name){ const wb=UI.extWb; if(!wb) return; const ws=wb.Sheets[name];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""}), r=parseExt(rows,UI.mk); UI.extRes=r;
  const cnt={}; for(const k in r.map){ const [,pid,sh]=k.split("|"), p=postOf(pid), lab=(p?p.name:pid)+" · "+SHN[sh]; cnt[lab]=(cnt[lab]||0)+1; }
  const n=Object.keys(r.map).length, per=period(UI.mk);
  sheet(`<div class="row" style="justify-content:space-between"><h2>Turni degli altri anni</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   <label class="stack" style="gap:4px"><span class="label">Foglio</span><select id="extsheet">${wb.SheetNames.map(x=>`<option ${x===name?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
   <p class="muted" style="margin:0;font-size:.86rem">${monthName(UI.mk)} (${fmt(per.first)} – ${fmt(per.days[per.days.length-1])}): riconosciuti ${r.cols} giorni su ${per.days.length}. I turni trovati vengono segnati come coperti: il generatore non li assegna ai nostri e non li conta come scoperti.</p>
   ${n?`<div class="alerts" style="background:var(--accent-soft)"><strong>${n} turni coperti da altri anni</strong><ul>${Object.entries(cnt).sort().map(([k,v])=>`<li>${esc(k)}: ${v}</li>`).join("")}</ul></div>`:`<div class="alerts bad"><strong>Nessun turno riconosciuto</strong><span style="font-size:.85rem">Controlla di aver scelto il foglio del mese giusto.</span></div>`}
   ${r.own?`<p class="muted" style="margin:0;font-size:.82rem">Trovati nel foglio ${r.own} turni dei tuoi specializzandi: con «Salva» la bozza viene allineata al foglio (stesse sale e turni, come turni fissi), da accettare.</p>`:""}
   ${r.unknown.length?`<p class="muted" style="margin:0;font-size:.82rem">Sale non nostre, ignorate: ${r.unknown.map(esc).join(", ")}.</p>`:""}
   ${r.bad?`<p style="margin:0;font-size:.82rem;color:var(--bad)">Attenzione: in ${r.bad} colonne il giorno della settimana non corrisponde a ${monthName(UI.mk)}: forse è la scheda di un altro mese.</p>`:""}
   ${r.cols<per.days.length?`<p style="margin:0;font-size:.82rem;color:var(--bad)">Alcuni giorni del mese non sono nel foglio: lì non risulta nessun turno coperto.</p>`:""}
   <div class="row"><button class="btn primary" data-act="extsave" ${n?"":"disabled"}>Salva${Object.keys(M(UI.mk).ext||{}).length?" (sostituisce quelli caricati prima)":""}</button><button class="btn" data-act="close">Annulla</button></div>`); }

/* ---------- sheets ---------- */
const layer=document.getElementById("layer");
/* sale chiuse in blocco: si selezionano più caselle nella tabella "Per giorno" */
function selC(d,k){ return (UI.clsel&&UI.clsel.has(d+"|"+k)?" sel":"")+(CHG&&CHG.has(d+"|"+k)?" chg":"")+(anyMgr()&&drxCell(d,k)?" xchg":""); }
/* caselle della bozza diverse dall'orario pubblicato (evidenziate in arancione nella vista Bozza) */
let CHG=null; const sameCell=(a,b)=>{ const x=(a||[]).filter(v=>v).sort().join(), y=(b||[]).filter(v=>v).sort().join(); return x===y; };
/* rispetto all'orario pubblicato; se un giorno non è ancora pubblicato (prima bozza) ogni casella con persone conta come nuova */
function draftChanges(mo,force){ if(!(force?hasDraft(mo):draftView(mo))) return null; const out=new Set(), dr=mo.draft.sched||{}, pub=mo.sched||{};
  for(const d in dr){ const pd=pub[d]||{}; const keys=new Set([...Object.keys(dr[d]||{}),...Object.keys(pd)]); keys.forEach(k=>{ if(!sameCell(dr[d][k],pd[k])) out.add(d+"|"+k); }); }
  return out; }
/* chiude/riapre per tutti gli anni (config/years); per l'anno che si guarda aggiorna anche la bozza */
function applyClosed(mk,keys,close){ const mo=M(mk), cg={...(CLOSEDG[mk]||{})}; const fx=mo.fixed=mo.fixed||{}; let n=0;
  for(const dk of keys){ const [d,id,sh]=dk.split("|"), post=postOf(id); if(!post) continue; const ck=d+"|"+normRoom(post.name)+"|"+sh, k=id+"|"+sh;
    if(close){ if(isClosed(mo,d,k)) continue; cg[ck]=true; const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=[]; Object.keys(fx).filter(z=>z.startsWith(d+"|"+k+"|")).forEach(z=>delete fx[z]); n++; }
    else if(isClosed(mo,d,k)){ delete cg[ck]; if(mo.closed&&mo.closed[ck]){ mo.closed={...mo.closed}; delete mo.closed[ck]; }
      /* vecchie chiusure salvate in un altro anno (prima che fossero condivise) */
      if(MULTI) for(const y of YRS(mk)){ if(y===CURY) continue; const st=yState(y), m=st&&st.months&&st.months[mk]; if(m&&m.closed&&m.closed[ck]&&db){ const months={...st.months,[mk]:{...m,closed:{...m.closed}}}; delete months[mk].closed[ck]; saveYearMonths(y,months,[mk]).catch(()=>{}); } }
      const W=ensureDraft(mo,d); W[d]=W[d]||{}; if(!W[d][k]||!W[d][k].length) W[d][k]=[null]; n++; } }
  CLOSEDG={...CLOSEDG,[mk]:cg}; if(n&&db) saveYearsDoc().catch(()=>toast("Non riesco a salvare le sale chiuse: aggiorna le regole del database"));
  return n; }
/* Strumenti → Azzera i turni (mai indisponibilità, ferie, congressi) */
/* Azzera, Elimina i turni generati e Annulla la bozza valgono per tutti gli anni: stessa operazione sul mese degli altri anni */
function eachOtherYear(mk,fn){ if(!MULTI||!db) return 0; let n=0; for(const y of YRS(mk)){ if(y===CURY) continue; const st=yState(y); if(!st) continue;
    const months=JSON.parse(JSON.stringify(st.months||{})), m=months[mk]; if(!m||fn(m,st,y)===false) continue; n++;
    saveYearMonths(y,months,[mk]).catch(()=>toast("Non riesco a salvare il "+yLab(y)+"° anno")); } return n; }
function draftOf(m){ if(!(m.draft&&m.draft.sched)) m.draft={sched:m.sched?JSON.parse(JSON.stringify(m.sched)):{},at:new Date().toISOString(),acc:{}}; return m.draft.sched; }
function resetOther(m,days,wk,nWeeks){ if(!m.sched&&!(m.draft&&m.draft.sched)&&!Object.keys(m.ext||{}).length) return false; const dset=new Set(days), now=new Date().toISOString();
  bakReset(m,dset);
  m.ext={...(m.ext||{})}; Object.keys(m.ext).forEach(k=>{ if(dset.has(k.split("|")[0])) delete m.ext[k]; }); m.extReset={...(m.extReset||{})}; days.forEach(d=>m.extReset[d]=now);
  if(m.closed){ m.closed={...m.closed}; Object.keys(m.closed).forEach(k=>{ if(dset.has(k.split("|")[0])) delete m.closed[k]; }); }
  const W=draftOf(m), fx=m.fixed||{}; days.forEach(d=>{ const day=W[d]||(m.sched||{})[d]||{}; W[d]=Object.fromEntries(Object.keys(day).map(k=>[k,[null]])); Object.keys(fx).filter(z=>z.startsWith(d+"|")).forEach(z=>delete fx[z]); });
  m.fixed=fx; m.draft.at=now; for(let w=0;w<nWeeks;w++) if(wk===null||w===wk) delete (m.draft.acc||{})[w]; }
function clearGenOther(m,days,wk,nWeeks){ if(!m.sched&&!(m.draft&&m.draft.sched)) return false; const W=draftOf(m), fx=m.fixed||{};
  days.forEach(d=>{ const day=W[d]||{}; for(const k in day){ const pre=d+"|"+k+"|", keepP=Object.keys(fx).filter(z=>z.startsWith(pre)).map(z=>fx[z]); const arr=(day[k]||[]).filter(x=>x), keep=arr.filter(x=>keepP.includes(x));
      Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>delete fx[z]); keep.forEach((x,i)=>fx[pre+i]=x); day[k]=keep.length?keep:((day[k]||[]).length===0?[]:[null]); } });
  m.fixed=fx; m.draft.at=new Date().toISOString(); for(let w=0;w<nWeeks;w++) if(wk===null||w===wk) delete (m.draft.acc||{})[w]; }
/* copia di ciò che «Azzera tutto» toglie (coperti da altri anni, turni fissi; per l'anno che si guarda anche sale chiuse e anni degli scoperti), per poterlo riprendere */
function bakReset(m,dset,mk){ const b=m.rstBak=m.rstBak||{ext:{},fixed:{},closed:{},holes:{}}; const inD=k=>dset.has(k.split("|")[0]);
  for(const k in (m.ext||{})) if(inD(k)&&!b.ext[k]) b.ext[k]=m.ext[k]; for(const k in (m.fixed||{})) if(inD(k)&&!b.fixed[k]) b.fixed[k]=m.fixed[k];
  if(mk){ for(const k in (CLOSEDG[mk]||{})) if(inD(k)) b.closed[k]=true; for(const k in (HOLEY[mk]||{})) if(inD(k)) b.holes[k]=HOLEY[mk][k]; } }
/* riprende nella bozza l'orario pubblicato (dopo «Azzera tutto»): per il periodo scelto e per tutti gli anni */
function restOne(m,days,mk){ const dset=new Set(days), b=m.rstBak||{ext:{},fixed:{},closed:{},holes:{}}, inD=k=>dset.has(k.split("|")[0]);
  if(m.draft&&m.draft.sched){ const W=m.draft.sched; days.forEach(d=>{ if((m.sched||{})[d]) W[d]=JSON.parse(JSON.stringify(m.sched[d])); else delete W[d]; }); m.draft.at=new Date().toISOString(); }
  m.ext={...(m.ext||{})}; for(const k in b.ext) if(inD(k)){ if(!m.ext[k]) m.ext[k]=b.ext[k]; delete b.ext[k]; }
  m.fixed={...(m.fixed||{})}; for(const k in b.fixed) if(inD(k)){ if(!m.fixed[k]) m.fixed[k]=b.fixed[k]; delete b.fixed[k]; }
  if(m.extReset){ m.extReset={...m.extReset}; days.forEach(d=>delete m.extReset[d]); }
  if(mk){ let ch=false; const c={...(CLOSEDG[mk]||{})}, h={...(HOLEY[mk]||{})};
    for(const k in b.closed) if(inD(k)){ c[k]=true; delete b.closed[k]; ch=true; } for(const k in b.holes) if(inD(k)){ if(!h[k]) h[k]=b.holes[k]; delete b.holes[k]; ch=true; }
    if(ch){ CLOSEDG={...CLOSEDG,[mk]:c}; HOLEY={...HOLEY,[mk]:h}; if(db) saveYearsDoc().catch(()=>{}); } }
  /* bozza uguale al pubblicato: si toglie */
  if(m.draft&&m.draft.sched&&m.sched){ const dr=m.draft.sched, pub=m.sched, ds=new Set([...Object.keys(dr),...Object.keys(pub)]); let same=true;
    for(const d of ds){ const ks=new Set([...Object.keys(dr[d]||{}),...Object.keys(pub[d]||{})]); for(const k of ks) if(!sameCell((dr[d]||{})[k],(pub[d]||{})[k])){ same=false; break; } if(!same) break; }
    if(same) m.draft=null; } }
function restorePublished(mk,wk){ const mo=M(mk), p=period(mk), days=wk===null?p.days:p.days.slice(wk*7,wk*7+7);
  restOne(mo,days,mk); SEXC.key=null; TICK++; const oth=eachOtherYear(mk,m=>{ restOne(m,days); });
  if(!hasDraft(mo)) UI.draftView=false; histAdd(mk,"Ripreso l'orario pubblicato",(mo.draft&&mo.draft.sched)||mo.sched); persist(); render();
  toast((wk===null?"Mese":`Settimana ${wk+1}`)+": ripreso l'orario pubblicato"+(oth?" (tutti gli anni)":"")+", con turni fissi, coperti da altri anni, sale chiuse e anni degli scoperti tolti con «Azzera tutto»"); }
function resetRange(mk,wk){
    const mo=M(mk), p=period(mk), days=wk===null?p.days:p.days.slice(wk*7,wk*7+7);
    if(!hasDraft(mo)) mo.draft={sched:mo.sched?clone(mo.sched):{},at:new Date().toISOString(),acc:{}};
    const W=mo.draft.sched, fx=mo.fixed||{};
    /* via anche turni coperti da altri anni (foglio e a mano), sale chiuse e anni assegnati agli scoperti di quei giorni; mai le indisponibilità */
    const now=new Date().toISOString(), dset=new Set(days); bakReset(mo,dset,mk); mo.ext={...(mo.ext||{})}; Object.keys(mo.ext).forEach(k=>{ if(dset.has(k.split("|")[0])) delete mo.ext[k]; });
    mo.extReset={...(mo.extReset||{})}; days.forEach(d=>mo.extReset[d]=now); SEXC.key=null; TICK++;
    if(CLOSEDG[mk]){ const c={...CLOSEDG[mk]}; Object.keys(c).forEach(k=>{ if(dset.has(k.split("|")[0])) delete c[k]; }); CLOSEDG={...CLOSEDG,[mk]:c}; }
    if(HOLEY[mk]){ const h={...HOLEY[mk]}; Object.keys(h).forEach(k=>{ if(dset.has(k.split("|")[0])) delete h[k]; }); HOLEY={...HOLEY,[mk]:h}; }
    if(mo.closed){ mo.closed={...mo.closed}; Object.keys(mo.closed).forEach(k=>{ if(dset.has(k.split("|")[0])) delete mo.closed[k]; }); }
    if(db) saveYearsDoc().catch(()=>{});
    days.forEach(d=>{ W[d]={}; slotsOfDay(d).forEach(x=>{ W[d][x.key]=[null]; }); Object.keys(fx).filter(z=>z.startsWith(d+"|")).forEach(z=>delete fx[z]); });
    mo.fixed=fx; mo.draft.at=new Date().toISOString(); const n=p.days.length/7; for(let w=0;w<n;w++) if(wk===null||w===wk) delete (mo.draft.acc||{})[w];
    const oth=eachOtherYear(mk,m=>resetOther(m,days,wk,n));
    UI.draftView=true; histAdd(mk,wk===null?"Bozza azzerata (tutto il mese)":`Bozza azzerata: settimana ${wk+1}`,W); persist(); render();
    toast((wk===null?"Mese azzerato":`Settimana ${wk+1} azzerata`)+(oth?` per tutti gli anni`:"")+" nella bozza: pubblica per renderlo effettivo"); }
function clearGenerated(mk,wk,onlyMine){
    const mo=M(mk), p=period(mk), days=wk===null?p.days:p.days.slice(wk*7,wk*7+7), fx=mo.fixed||{}; let n=0;
    if(!hasDraft(mo)) mo.draft={sched:mo.sched?clone(mo.sched):{},at:new Date().toISOString(),acc:{}};
    const W=mo.draft.sched;
    /* restano solo i turni fissi (inseriti a mano o dal foglio); i fissi si rinumerano nell'ordine della casella */
    days.forEach(d=>{ const day=W[d]||{}; for(const k in day){ const pre=d+"|"+k+"|", keepP=Object.keys(fx).filter(z=>z.startsWith(pre)).map(z=>fx[z]);
        const arr=(day[k]||[]).filter(x=>x), keep=arr.filter(x=>keepP.includes(x)); n+=arr.length-keep.length;
        Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>delete fx[z]); keep.forEach((x,i)=>fx[pre+i]=x);
        day[k]=keep.length?keep:((day[k]||[]).length===0?[]:[null]); } });
    mo.fixed=fx; mo.draft.at=new Date().toISOString(); const nw=p.days.length/7; for(let w=0;w<nw;w++) if(wk===null||w===wk) delete (mo.draft.acc||{})[w];
    const oth=onlyMine?0:eachOtherYear(mk,m=>clearGenOther(m,days,wk,nw));
    UI.draftView=true; histAdd(mk,"Turni generati eliminati",W); persist(); render(); toast(`${n} turni generati tolti dalla bozza${oth?" (e quelli degli altri anni)":""}; restano quelli inseriti a mano o dal foglio`); }
function sheet(html){layer.innerHTML=`<div class="scrim" data-act="close"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;}
function closeSheet(){layer.innerHTML="";}
function prefSheet(d){ const mo=M(UI.mk), pid=UI.sel, cur=(PR(UI.mk)[pid]||{})[d]||"", u=unavOf(mo,pid,d);
  const opts={}; slotsOfDay(d).forEach(x=>{ const pl=pools(mo,x.post,x.s); if(!(pl.pri.some(r=>r.id===pid)||pl.jol.some(r=>r.id===pid))) return; if(!canDo(pid,x.s)) return; (opts[x.s]=opts[x.s]||[]).push(x.post); });
  const btn=(v,l)=>`<button data-act="pf" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`;
  sheet(`<div class="row" style="justify-content:space-between"><h2>Preferenza · ${fmt(d,true)}</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   ${u?`<p class="muted" style="margin:0;font-size:.85rem">Attenzione: quel giorno hai segnato ${FULL[u]?FULL[u].toLowerCase():"indisponibilità"}.</p>`:""}
   ${SH.filter(s=>opts[s]).map(s=>`<span class="groupname">${SHN[s]} · ${esc(S.hours[s])}</span><div class="pickers">${btn(s,s==="N"||s==="D"?SHN[s]:"Sala qualsiasi")}${s==="N"||s==="D"?"":opts[s].map(p=>btn(p.id+"|"+s,esc(p.name))).join("")}</div>`).join("")||`<p class="muted" style="margin:0">Nessun turno disponibile per te quel giorno.</p>`}
   <div class="row"><button class="btn" data-act="pf" data-v="">Nessuna preferenza</button><button class="btn primary" data-act="close">Fatto</button></div>`);
  layer.dataset.d=d; }
function daySheet(d){ const mo=M(UI.mk), u=unavOf(mo,UI.sel,d), avail=shiftsOfDay(d);
  sheet(`<div class="row" style="justify-content:space-between"><h2>${fmt(d,true)}</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   ${u==="F"||u==="C"?`<p class="muted" style="margin:0">Giorno segnato come ${u==="F"?"ferie":"congresso"}: scegliendo un turno lo sostituisci.</p>`:""}
   <span class="muted">Turni previsti il ${fmt(d)}. ${esc(resName(UI.sel))} non è disponibile per:</span>
   <div class="pickers">${avail.map(s=>`<button data-act="u" data-v="${s}" aria-pressed="${!FULL[u]&&u.includes(s)}">${SHN[s]} <span class="cnt">${esc(S.hours[s])}</span></button>`).join("")||`<span class="muted">Nessun turno previsto.</span>`}
   <button data-act="u" data-v="G" aria-pressed="${u==="G"}">Tutta la giornata</button></div>
   ${ADMIN()&&conflictsOf(UI.mk,UI.sel,d).length?`<div class="alerts bad"><strong>${esc(resName(UI.sel))} è già in turno: ${conflictsOf(UI.mk,UI.sel,d).map(c=>slotLabel(c)).join(", ")}</strong><button class="btn primary" data-act="planday" data-d="${d}">Programma un cambio</button></div>`:""}
   <div class="row"><button class="btn" data-act="u" data-v="">Disponibile</button><button class="btn primary" data-act="close">Fatto</button></div>`);
  layer.dataset.d=d; }
/* specializzandi di altri anni inseriti a mano in una casella: vanno nella bozza del loro anno (turno fisso) */
function othCell(mk,d,k){ const out=[]; if(!MULTI) return out; const [pid0,s]=k.split("|"), post=postOf(pid0); if(!post) return out;
  for(const y of YRS(mk)){ if(y===CURY) continue; const st=yState(y), m=st&&st.months&&st.months[mk]; if(!m) continue; const sc=(m.draft&&m.draft.sched)||m.sched||{};
    const py=(st.posts||[]).find(p=>normRoom(p.name)===normRoom(post.name)); if(!py) continue;
    ((sc[d]||{})[py.id+"|"+s]||[]).forEach(x=>{ const r=(st.residents||[]).find(z=>z.id===x); if(r) out.push({y,pid:x,name:`(${yLab(r.year||st.groupYear||y)}) ${r.name}`}); }); }
  return out; }
function othBusy(mk,y,pid,d){ const st=yState(y), m=st&&st.months&&st.months[mk]; if(!m) return ""; const sc=(m.draft&&m.draft.sched)||m.sched||{};
  for(const k in (sc[d]||{})) if((sc[d][k]||[]).includes(pid)){ const sh=k.split("|")[1]; return "già di "+SHN[sh].toLowerCase(); }
  for(const k in (sc[add(d,-1)]||{})) if(k.endsWith("|N")&&(sc[add(d,-1)][k]||[]).includes(pid)) return "giorno di smonto"; return ""; }
function othEdit(mk,y,d,k,pid,addIt){ const st=yState(y); if(!st||!db) return; const [pid0,s]=k.split("|"), post=postOf(pid0), py=(st.posts||[]).find(p=>normRoom(p.name)===normRoom(post.name));
  if(!py){ toast("Il "+yLab(y)+"° anno non ha questa sala"); return; }
  const months=JSON.parse(JSON.stringify(st.months||{})), m=months[mk]=months[mk]||{rot:{}}, key=py.id+"|"+s, W=draftOf(m); W[d]=W[d]||{};
  let arr=(W[d][key]||[]).filter(x=>x); const fx=m.fixed=m.fixed||{}, pre=d+"|"+key+"|", wasFx=new Set(Object.keys(fx).filter(z=>z.startsWith(pre)).map(z=>fx[z]));
  if(addIt){ if(!arr.includes(pid)) arr.push(pid); wasFx.add(pid); } else { arr=arr.filter(x=>x!==pid); wasFx.delete(pid); }
  Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>delete fx[z]); arr.forEach((x,i)=>{ if(wasFx.has(x)) fx[pre+i]=x; });
  W[d][key]=arr.length?arr:[null]; m.draft.at=new Date().toISOString(); m.draft.who={...(m.draft.who||{}),[d+"|"+key]:whoAmI()};
  const w=Math.floor(period(mk).days.indexOf(d)/7); if(m.draft.acc) delete m.draft.acc[w];
  saveYearMonths(y,months,[mk]).then(()=>{ toast(addIt?"Aggiunto nella bozza del "+yLab(y)+"° anno":"Tolto dalla bozza del "+yLab(y)+"° anno"); }).catch(()=>toast("Non riesco a salvare il "+yLab(y)+"° anno")); }
function cellSheet(d,k){ const mo=M(UI.mk), [postId,s]=k.split("|"), post=postOf(postId), arr=((editSched(mo)||{})[d]||{})[k]||[null], {per}=derive(UI.mk,viewSched(UI.mk)||undefined);
  const w=Math.floor(period(UI.mk).days.indexOf(d)/7), {pri,jol}=pools(mo,post,s), cov=covOf(post,s);
  const why=pid=>{ const p=per[pid], u=unavOf(mo,pid,d); if(!canDo(pid,s)) return s==="N"?"non abilitato alle notti":"non abilitato alle guardie";
    if(blocked(u,s)) return u==="F"?"in ferie":u==="C"?"a congresso":"indisponibile"; if(p.on[d]&&!arr.includes(pid)) return p.on[d]==="N"?"giorno di monto (ha la notte)":s==="N"?`già di ${SHN[p.on[d]].toLowerCase()}, sarebbe il monto`:`già di ${SHN[p.on[d]].toLowerCase()}`;
    if(p.on[add(d,-1)]==="N") return "giorno di smonto"; if(s==="N"&&p.on[add(d,1)]) return "lavora nel giorno di smonto";
    if(!arr.includes(pid)&&(p.wk[w]||0)>=S.maxWeek) return `già ${p.wk[w]} turni in settimana`; return ""; };
  const btn=(r,i,cur,tag)=>{const y=why(r.id), isCur=cur===r.id;return `<button class="cand ${isCur?"cur":""}" data-act="assign" data-i="${i}" data-id="${r.id}"><span><span class="name-strong">${esc(rName(r))}</span>${tag?` <span class="muted" style="font-size:.78rem">· ${esc(rotName(mo.rot[r.id]))}</span>`:""}${y&&!isCur?`<br><span class="why">${y}</span>`:""}</span><span class="chip">${per[r.id].tot} turni · ${per[r.id].N} N</span></button>`;};
  sheet(`<div class="row" style="justify-content:space-between"><div><h2>${esc(post.name)} · ${SHN[s]}</h2><span class="muted">${fmt(d,true)} · ${esc(S.hours[s])}</span></div><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   ${hasDraft(mo)?(()=>{ const pub=((effSched(UI.mk)||mo.sched||{})[d]||{})[k]||[], dr=((mo.draft.sched||{})[d]||{})[k]||[], nm=a=>a.filter(x=>x).map(resName).join(", ")||(isClosed(mo,d,k)?"Chiusa":"—"), diff=!sameCell(pub,dr);
      return `<div class="stack" style="gap:2px;font-size:.88rem;padding:8px 10px;border-radius:8px;background:${diff?"var(--chg-soft)":"var(--surface-2,transparent)"};border:1px solid ${diff?"var(--chg)":"var(--line)"}"><span><span class="muted">Orario attivo:</span> <strong>${esc(nm(pub))}</strong></span><span><span class="muted">Bozza:</span> <strong>${esc(nm(dr))}</strong>${diff?' <span style="color:var(--chg);font-weight:600">· modificato</span>':""}</span></div>`; })():""}
   ${!isClosed(mo,d,k)&&arr.filter(x=>x).length+othersIn(mo,d,k)<capOf(post,s).max?(()=>{ const cur=holeTags(UI.mk,d,k), room=capOf(post,s).max-othersIn(mo,d,k)-arr.filter(x=>x).length;
      return `<div class="stack" style="gap:6px"><span class="label">Persone mancanti di un anno${cur.length?` (${cur.length})`:""}:</span>
       ${cur.length?`<div class="row" style="gap:6px;flex-wrap:wrap">${cur.map((t,i)=>`<button class="btn sm" data-act="holedel" data-i="${i}" style="background:${ycol(t.l)};color:#fff;border-color:${ycol(t.l)}" title="Togli">${ROMAN[t.l]} anno ×</button>`).join("")}</div>`:""}
       ${cur.length<room?`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:.82rem">Aggiungi:</span>${LEVELS.map(l=>`<button class="btn sm" data-act="holeadd" data-v="${l}" style="border-color:${ycol(l)};color:${ycol(l)}">+ ${ROMAN[l]} anno</button>`).join("")}</div>`:""}</div>`; })():""}
   ${EXT(mo)[d+"|"+k]?`<p class="muted" style="margin:0;font-size:.84rem">Altri anni: ${xNames(d,k,EXT(mo)[d+"|"+k]).replace(/<br>/g,", ")}</p>`:""}
   ${anyMgr()&&drxCell(d,k)?`<p style="margin:0;font-size:.84rem;color:var(--chg);font-weight:600">Un altro anno ha modificato questa casella nella sua bozza, non ancora pubblicata${DRX.u.names.size+DRX.l.names.size?" (nomi in arancione)":""}.</p>`:""}
   ${lowerOnly(mo,d,k)?`<p class="muted" style="margin:0;font-size:.84rem;font-style:italic">Anni successivi: ${xNames(d,k,lowerOnly(mo,d,k)).replace(/<br>/g,", ")}</p>`:""}
   ${[...arr,...(multiPost(post,s)&&arr.some(x=>x)&&arr.filter(x=>x).length+othersIn(mo,d,k)<capOf(post,s).max?[undefined]:[])].map((cur,i)=>`<div class="stack" style="gap:6px"><span class="label">${cur===undefined?"Aggiungi un'altra persona":cur?`Ora: ${esc(resName(cur))}`:"Scoperto"}</span>
     ${cov!=="ALL"?`<span class="groupname">Rotazione ${esc(rotName(cov))}</span>`:`<span class="groupname">Tutti gli specializzandi</span>`}
     ${pri.map(r=>btn(r,i,cur,cov==="ALL")).join("")||`<p class="muted" style="margin:0">Nessuno in questa rotazione.</p>`}
     ${jol.length?`<span class="groupname">Jolly</span>${jol.map(r=>btn(r,i,cur,true)).join("")}`:""}
     ${(()=>{const bg=S.residents.filter(r=>isBG(mo.rot[r.id])); return bg.length?`<span class="groupname">Bambin Gesù (solo a mano)</span>${bg.map(r=>btn(r,i,cur,true)).join("")}`:"";})()}
     ${(()=>{ if(cov==="ALL") return ""; /* sempre visibili anche gli altri specializzandi (fuori rotazione), prima i disponibili */
        const inPools=new Set([...pri,...jol].map(r=>r.id)), others=S.residents.filter(r=>!inPools.has(r.id)&&!isBG(mo.rot[r.id]));
        if(!others.length) return "";
        return `<span class="groupname">Altri specializzandi (fuori rotazione)</span>${others.sort((a,b)=>!!why(a.id)-!!why(b.id)).map(r=>btn(r,i,cur,true)).join("")}`; })()}
     ${cur?`<button class="btn danger" data-act="assign" data-i="${i}" data-id="">${arr.filter(x=>x).length>1?"Togli":"Lascia scoperto"}</button>`:""}</div>`).join("")}
   ${MULTI&&ADMIN()?(()=>{ const inC=othCell(UI.mk,d,k), inSet=new Set(inC.map(x=>x.y+"|"+x.pid));
      const groups=YRS(UI.mk).filter(y=>y!==CURY).map(y=>{ const st=yState(y); return {y,res:((st&&st.residents)||[]).filter(r=>!inSet.has(y+"|"+r.id))}; }).filter(g=>g.res.length).sort((a,b)=>yLab(b.y)-yLab(a.y));
      return `<details class="stack" style="gap:6px"><summary class="groupname" style="cursor:pointer">Specializzandi di altri anni${inC.length?` (${inC.length} qui)`:""}</summary>
        ${inC.length?`<div class="stack" style="gap:4px">${inC.map(x=>`<div class="row" style="justify-content:space-between"><span class="name-strong">${esc(x.name)}</span><button class="btn sm danger" data-act="othdel" data-y="${x.y}" data-id="${x.pid}">Togli</button></div>`).join("")}</div>`:""}
        <p class="muted" style="margin:0;font-size:.8rem">Va nella bozza del suo anno (turno fisso): la pubblicano i rappresentanti di quell'anno.</p>
        ${groups.map(g=>`<span class="groupname">${ROMAN[yLab(g.y)]} anno</span>${g.res.map(r=>{ const b=othBusy(UI.mk,g.y,r.id,d); return `<button class="cand" data-act="othadd" data-y="${g.y}" data-id="${r.id}"><span><span class="name-strong">(${yLab(r.year||(yState(g.y)||{}).groupYear||g.y)}) ${esc(r.name)}</span>${b?`<br><span class="why">${b}</span>`:""}</span></button>`; }).join("")}`).join("")}</details>`; })():""}
   <div class="row">${(mo.ext||{})[d+"|"+k]&&(mo.ext[d+"|"+k]||[]).includes(EXT_MAN)?`<button class="btn" data-act="extmark" data-v="0">Togli «coperto da altri anni»</button>`:`<button class="btn" data-act="extmark" data-v="1">Coperto da altri anni</button>`}
     ${isClosed(mo,d,k)?`<button class="btn" data-act="closeroom" data-v="0">Riapri la sala</button>`:`<button class="btn" data-act="closeroom" data-v="1">Sala chiusa (questo turno)</button><button class="btn" data-act="closeroom" data-v="2">Sala chiusa tutto il giorno</button>`}</div>`);
  layer.dataset.d=d; layer.dataset.k=k; }

/* ---------- export ---------- */
/* indisponibilità, ferie, congressi (e preferenze) di tutti, per il mese: solo rappresentanti */
async function exportUnav(){ if(!ADMIN()) return; if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
  const mk=UI.mk, mo=M(mk), p=period(mk), PRF=PR(mk);
  const lab=u=>u==="F"?"Ferie":u==="C"?"Congresso":u==="G"?"Tutto il giorno":SH.filter(s=>u.includes(s)).map(s=>SHN[s]).join(" + ");
  const pl=v=>{ if(!v) return ""; const [pp,sh]=v.includes("|")?v.split("|"):[null,v]; return (pp?((postOf(pp)||{}).name||pp)+" ":"")+SHN[sh]; };
  const t1=[["Specializzando","Rotazione",...p.days.map(d=>`${DOW[isoDow(d)]} ${+d.slice(8)}/${+d.slice(5,7)}`)]];
  S.residents.forEach(r=>t1.push([rName(r),rotName(mo.rot[r.id]),...p.days.map(d=>{ const u=unavOf(mo,r.id,d); return u?(u==="F"?"FERIE":u==="C"?"CONGRESSO":u==="G"?"X":SH.filter(s=>u.includes(s)).map(s=>s==="D"?"G":s).join("")):""; })]));
  const t2=[["Specializzando","Rotazione","Data","Giorno","Tipo","Dettaglio"]];
  S.residents.forEach(r=>p.days.forEach(d=>{ const u=unavOf(mo,r.id,d), pf=(PRF[r.id]||{})[d];
    if(u) t2.push([rName(r),rotName(mo.rot[r.id]),d.split("-").reverse().join("/"),DOW[isoDow(d)],u==="F"?"Ferie":u==="C"?"Ferie congresso":"Indisponibilità",lab(u)]);
    if(pf) t2.push([rName(r),rotName(mo.rot[r.id]),d.split("-").reverse().join("/"),DOW[isoDow(d)],"Preferenza",pl(pf)]); }));
  const t3=[["Specializzando","Rotazione","Giorni di indisponibilità","Giorni di ferie","Giorni di congresso","Preferenze"]];
  S.residents.forEach(r=>{ const c=v=>p.days.filter(d=>{ const u=unavOf(mo,r.id,d); return v==="T"?(u&&u!=="F"&&u!=="C"):u===v; }).length;
    t3.push([rName(r),rotName(mo.rot[r.id]),c("T"),c("F"),c("C"),p.days.filter(d=>(PRF[r.id]||{})[d]).length]); });
  t1.push([]); t1.push(["Legenda: M mattina, P pomeriggio, N notte, G guardia, X tutto il giorno. Periodo "+fmt(p.first)+" – "+fmt(p.last)+"."]);
  const wb=XLSX.utils.book_new(), a=XLSX.utils.aoa_to_sheet(t1); a["!cols"]=[{wch:22},{wch:14},...p.days.map(()=>({wch:8}))];
  XLSX.utils.book_append_sheet(wb,a,"Calendario"); const b=XLSX.utils.aoa_to_sheet(t2); b["!cols"]=[{wch:22},{wch:14},{wch:11},{wch:6},{wch:16},{wch:24}]; XLSX.utils.book_append_sheet(wb,b,"Elenco");
  const c=XLSX.utils.aoa_to_sheet(t3); c["!cols"]=[{wch:22},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12}]; XLSX.utils.book_append_sheet(wb,c,"Riepilogo");
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"}), fname=`Indisponibilita_${monthName(mk).replace(" ","_")}${MULTI?"_"+CURY+"anno":""}.xlsx`;
  if(!downloads){toast("Il download non è disponibile in questa vista");return;}
  try{ const r=await downloads.save({filename:fname,data:new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}); if(r.status==="saved")toast("File Excel salvato"); }catch(e){ toast("Download non riuscito"); } }
/* copia di sicurezza completa (solo proprietario): documenti e raccolte del database in un file .json */
const BK_DOCS=["config/main","planner/state",...[-1,0,1,3,4,5,6].flatMap(c=>["config/y"+c,"planner/y"+c]),"config/years","config/privacy","access/allow","roles/managers"];
async function exportBackup(){ if(!OWNER||!db) return; toast("Preparo la copia di sicurezza…");
  try{ const out={type:"turni-backup",version:1,at:new Date().toISOString(),docs:{},cols:{}};
    const mdocs=[-1,0,1,2,3,4,5,6].flatMap(y=>monWindow().map(mk=>monPath(y,mk)));
    for(const p of [...BK_DOCS,...mdocs]){ try{ const sn=await db.doc(p).get(); if(sn.exists) out.docs[p]=sn.data(); }catch(e){} }
    const col=async p=>{ const r=await db.collection(p).limit(5000).get(); out.cols[p]=r.docs.map(d=>({id:d.id,data:d.data()})); return out.cols[p]; };
    const claims=await col("claims"); await col("swaps"); await col("accessRequests");
    for(const u of ["staff",...new Set(claims.map(c=>c.id))]) await col(`unav/${u}/m`);
    const json=JSON.stringify(out), now=new Date();
    const fname=`Turni_copia_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}.json`;
    if(!downloads){toast("Il download non è disponibile in questa vista");return;}
    const r=await downloads.save({filename:fname,data:new Blob([json],{type:"application/json"})}); if(r.status==="saved") toast("Copia di sicurezza salvata");
  }catch(e){ toast("Copia non riuscita: "+(e.message||e.code||e)); } }
/* Excel nel formato del foglio "BOZZA ORARI": giorni in riga 1, sale in colonna A (mattina, poi "POMERIGGIO", poi "NOTTE"),
   nomi "(anno) Cognome" di tutti gli anni (orari pubblicati + turni degli altri anni importati); domenica/festivi la guardia sta nella DEA della mattina */
function sheetRoomName(p,sh){ const k=normRoom(p.name), m=k.match(/^(tc|rm|angio)(\d)$/);
  const SN={tccemi0:"TC - CEMI 0",sala8:"RX Uro-Gen/Dig",rxscheletro:"RX Scheletro",ecocolumbus:"Eco Columbus",tccolumbus:"TC Columbus",radsen1:"RadSen1",radsen2:"RadSen2"};
  if(k==="diagsen") return sh==="P"?"DIAGSEN":"Diagn Sen II Piano"; if(k==="eco") return sh==="P"?"Eco (I)":"Eco"; if(k==="rxtorace") return sh==="P"?"Urgenze, Torace, Scheletro (I)":"RX Torace"; if(SN[k]) return SN[k];
  if(m&&m[1]==="tc") return "TC - "+m[2]; if(m&&m[1]==="rm") return `RM ${m[2]} (${m[2]==="2"?"Philips":"GE"})`; if(m&&m[1]==="angio") return "Angiografia "+m[2];
  if(k==="dea") return sh==="P"?"DEA (II)":"DEA"; return p.name; }
async function exportBozza(){ if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
  const mk=UI.mk, p=period(mk), D3=["DOM","LUN","MAR","MER","GIO","VEN","SAB"];
  const cell={}; const add=(d,rk,sh,name)=>{ const k=d+"|"+rk+"|"+sh; (cell[k]=cell[k]||[]); if(!cell[k].includes(name)) cell[k].push(name); };
  const rooms=[]; S.posts.forEach(x=>{ const rk=normRoom(x.name); if(rk&&!rooms.some(r=>r.rk===rk)) rooms.push({rk,p:x}); });
  const put=(st,y,sched)=>{ const nm={}; (st.residents||[]).forEach(r=>nm[r.id]=`(${yLab(r.year||st.groupYear||y)}) ${r.name}`); const pk={}; (st.posts||[]).forEach(x=>pk[x.id]=normRoom(x.name));
    for(const d in sched) for(const k in sched[d]){ const [pid,sh]=k.split("|"); (sched[d][k]||[]).forEach(id=>{ if(id&&nm[id]) add(d,pk[pid],sh==="D"?"M":sh,nm[id]); }); } };
  const ys=MULTI?YRS(mk):[CURY];
  for(const y of ys){ const st=y===CURY?S:yState(y); const m=st&&st.months&&st.months[mk]; if(!m) continue;
    const sc=y===CURY?(viewSched(mk)||{}):(m.sched||{}); put(st,y,sc);
    for(const kk in (m.ext||{})){ const [d,pid,sh]=kk.split("|"), px=(st.posts||[]).find(x=>x.id===pid); if(px) m.ext[kk].forEach(n=>add(d,normRoom(px.name),sh==="D"?"M":sh,n)); } }
  const sortY=a=>a.sort((x,z)=>((z.match(/^\((\d)\)/)||[])[1]||0)-((x.match(/^\((\d)\)/)||[])[1]||0));
  const rows=[["",...p.days.map(d=>`${D3[(isoDow(d)+1)%7]} ${d.slice(8)}`)]];
  const block=(sh)=>{ for(const r of rooms){ if(!SH.some(s=>s===sh)) continue; const has=p.days.some(d=>((r.p.on||{})[dayType(d)]||[]).includes(sh)||(sh==="M"&&((r.p.on||{})[dayType(d)]||[]).includes("D")));
      if(!has||sh==="N") continue; const lists=p.days.map(d=>sortY([...(cell[d+"|"+r.rk+"|"+sh]||[])])); const h=Math.max(1,...lists.map(l=>l.length));
      for(let i=0;i<h;i++) rows.push([i===0?sheetRoomName(r.p,sh):"",...lists.map(l=>l[i]||"")]); rows.push([]); } };
  block("M"); rows.push(["POMERIGGIO"]); block("P");
  const nl=p.days.map(d=>{ const all=[]; rooms.forEach(r=>(cell[d+"|"+r.rk+"|N"]||[]).forEach(n=>all.includes(n)||all.push(n))); return sortY(all); });
  const hn=Math.max(1,...nl.map(l=>l.length)); for(let i=0;i<hn;i++) rows.push([i===0?"NOTTE":"",...nl.map(l=>l[i]||"")]);
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(rows); ws["!cols"]=[{wch:16},...p.days.map(()=>({wch:16}))];
  const title=monthName(mk).charAt(0).toUpperCase()+monthName(mk).slice(1); XLSX.utils.book_append_sheet(wb,ws,title.slice(0,31));
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"}), fname=`BOZZA_ORARI_${title.replace(" ","_")}.xlsx`;
  if(!downloads){toast("Il download non è disponibile in questa vista");return;}
  try{ const r=await downloads.save({filename:fname,data:new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}); if(r.status==="saved")toast("File salvato"); }catch(e){ toast("Download non riuscito"); } }
async function exportXlsx(){
  const mo=M(UI.mk), p=period(UI.mk), {per,where}=derive(UI.mk);
  if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
  const SC=viewSched(UI.mk)||{}, cols=columns(SC,p);
  const t1=[["Data","Giorno",...cols.map(c=>`${c.post.name} ${c.s==="D"||c.s==="N"?"":SHN[c.s]+" "}(${S.hours[c.s]})`.replace("  "," "))]];
  p.days.forEach(d=>t1.push([d.split("-").reverse().join("/"),DOW[isoDow(d)]+(dayType(d)==="fes"&&isoDow(d)!==6?" (festivo)":""),...cols.map(c=>{const a=(SC[d]||{})[c.k], ex=EXT(mo)[d+"|"+c.k]||[];return a?[...a.map(x=>x?resName(x):ex.length?"":"SCOPERTO").filter(x=>x),...ex].join(", "):"";})]));
  const people=S.residents.filter(r=>inGem(mo,r.id)||(SC&&shiftsOf(SC,r.id).length));
  const lab=(c,w)=>c==="S"?"Smonto":c==="X"?"indisp.":c==="F"?"ferie":c==="C"?"congresso":c==="D"?"Guardia domenica":c==="N"?"Monto (notte)":c?`${w} ${c}`:"Libero";
  const t2=[["Specializzando","Rotazione",...p.days.map(d=>`${DOW[isoDow(d)]} ${+d.slice(8)}/${+d.slice(5,7)}`)]];
  people.forEach(r=>t2.push([rName(r),rotName(mo.rot[r.id]),...p.days.map(d=>lab(code(mo,per,r.id,d),where[r.id+"|"+d]))]));
  const t3=[["Specializzando","Rotazione","Totale","Mattine","Pomeriggi","Guardie domenica","Notti","Sabati","Domeniche/festivi"]];
  people.forEach(r=>{const x=per[r.id];t3.push([rName(r),rotName(mo.rot[r.id]),x.tot,x.M,x.P,x.D,x.N,x.sab||0,x.fes||0]);});
  t3.push([]); t3.push([`Orari: mattina ${S.hours.M}, pomeriggio ${S.hours.P}, guardia domenica ${S.hours.D}, notte ${S.hours.N}. Periodo ${fmt(p.first)} – ${fmt(p.last)}.`]);
  const wb=XLSX.utils.book_new();
  const s1=XLSX.utils.aoa_to_sheet(t1); s1["!cols"]=[{wch:11},{wch:13},...cols.map(()=>({wch:18}))];
  const s2=XLSX.utils.aoa_to_sheet(t2); s2["!cols"]=[{wch:24},{wch:13},...p.days.map(()=>({wch:10}))];
  const s3=XLSX.utils.aoa_to_sheet(t3); s3["!cols"]=[{wch:24},{wch:13},{wch:8},{wch:9},{wch:10},{wch:11},{wch:7},{wch:8},{wch:17}];
  XLSX.utils.book_append_sheet(wb,s1,"Turni per giorno"); XLSX.utils.book_append_sheet(wb,s2,"Per specializzando"); XLSX.utils.book_append_sheet(wb,s3,"Riepilogo");
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const fname=`Turni_${monthName(UI.mk).replace(" ","_")}.xlsx`;
  if(!downloads){toast("Il download non è disponibile in questa vista");return;}
  try{ const r=await downloads.save({filename:fname,data:new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}); if(r.status==="saved")toast("File Excel salvato"); }
  catch(e){ if(e&&e.code!=="cancelled"&&e.code!=="declined") toast("Download non riuscito"); }
}
function toast(t){const el=document.createElement("div");el.className="toast";el.textContent=t;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}

/* ---------- events ---------- */
function toggle(arr,v){const i=arr.indexOf(v); if(i>=0)arr.splice(i,1); else arr.push(v);}
document.getElementById("tabs").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;UI.tab=b.dataset.tab;if(UI.tab==="modturni")UI.view="giorni";UI.confirm=null;try{localStorage.setItem("turni.tab",UI.tab);}catch(_){}render();window.scrollTo(0,0);});
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-act]"); if(!el) return;
  let a=el.dataset.act;
  if(a==="close"){ if(e.target===el||el.tagName==="BUTTON"){closeSheet();render();} return; }
  if(!["planapp","claim","clrF","clrC","gen","genwk","del","delpost","clrone","clrall","clrR","clrsched","reset","clrgen","clrmine","restpub","clrext","refresh","refrot","years","accall","accw","drop","hopen","hdel","unlink","unlinku","swdel","mswgo"].includes(a)) UI.confirm=null;
  if(a==="claim"){ const pid=el.dataset.id; if(!db||!MYUID) return; if(Object.values(CLAIMS).includes(MYUID)||CLAIMDOCS.some(x=>x.u===MYUID)){ toast(OWNER?"Il tuo account è già associato a un nome: per cambiarlo prima scollegalo in Impostazioni → Account collegati":"Il tuo account è già associato a un nome: solo il proprietario può cambiarlo"); return; } if(UI.confirm!=="claim-"+pid){UI.confirm="claim-"+pid;render();return;} UI.confirm=null; db.doc("claims/"+MYUID).set({pid,at:new Date().toISOString(),email:(USER&&USER.email&&USER.email())||""}).then(()=>{CLAIMS[pid]=MYUID;try{localStorage.setItem("turni.me",pid);}catch(_){} const y=MULTI?yearOfPid(pid):null; if(y&&y!==CURY) switchYear(y); UI.sel=pid; render();}).catch(()=>toast("Non riesco a collegare il nome: hai i permessi?")); return; }
  if(a==="unlinku"){ const u=el.dataset.u; if(UI.confirm!=="unlu-"+u){UI.confirm="unlu-"+u;render();return;} UI.confirm=null;
    db.doc("claims/"+u).delete().then(()=>{ toast("Account scollegato: ora può scegliere il suo nome"); render(); }).catch(()=>toast("Non riesco a scollegare")); return; }
  if(a==="unlink"){ const pid=el.dataset.id; if(UI.confirm!=="unl-"+pid){UI.confirm="unl-"+pid;render();return;} UI.confirm=null; const u=CLAIMS[pid]; if(!u) return; db.doc("claims/"+u).delete().then(()=>{delete CLAIMS[pid];render();}).catch(()=>toast("Non riesco a scollegare")); return; }
  if(a==="swsend"){ const F=UI.sw||{}, me=myPid(); if(!F.a||!F.to||!me) return; const [ad,ak]=F.a.split("#");
    const x={id:uid()+uid(),mk:UI.mk,from:me,to:F.to,a:{d:ad,k:ak},b:F.b?{d:F.b.split("#")[0],k:F.b.split("#")[1]}:null,extra:(UI.swExtra||[]).map(e=>({d:e.d,k:e.k,giver:e.giver,taker:e.taker})),status:"pending",created:new Date().toISOString()};
    const w=swapWarnings(UI.mk,x); if(!w.ok){toast("Cambio non possibile");return;} x.warn=[...w.from,...w.to];
    swWrite(x).then(ok=>{ if(ok){UI.sw={};UI.swPrev=null;toast("Richiesta inviata a "+resName(x.to));render();} }); return; }
  if(a==="swex"){ const F=UI.sw=UI.sw||{}; F.ex=F.ex||{}; F.ex[el.dataset.id]=el.dataset.v==="1"; render(); return; }
  if(a==="rep"){ exportReport(el.dataset.all==="1"); return; }
  if(a==="repcopy"){ const list=Object.values(SW).filter(x=>x.status==="accepted"&&!x.reported).sort((p,q)=>(p.decided||"").localeCompare(q.decided||"")); const txt=reportText(list);
    const done=()=>{toast("Testo copiato: cambi segnati come riportati");markReported(list);};
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,()=>showText(txt,list)); else showText(txt,list); return; }
  if(a==="repmark"){ const list=Object.values(SW).filter(x=>x.status==="accepted"&&!x.reported); markReported(list); closeSheet(); return; }
  if(a==="mgr"&&OWNER){ const id=el.dataset.id; S.managers=S.managers||[]; toggle(S.managers,id); persist(); syncRoles(); render(); return; }
  if((a==="reqok"||a==="reqno")&&OWNER){ const r=REQS.find(x=>x.id===el.dataset.id); if(!r) return;
    const done=()=>db.doc("accessRequests/"+r.id).delete().then(()=>{REQS=REQS.filter(x=>x.id!==r.id);render();});
    if(a==="reqno"){ done().then(()=>toast("Richiesta rifiutata")); return; }
    const list=[...new Set([...ALLOW,r.email.toLowerCase()])];
    db.doc("access/allow").set({emails:list}).then(()=>{ALLOW=list; return done();}).then(()=>toast(r.email+" ora può entrare")).catch(()=>toast("Approvazione non riuscita")); return; }
  if(a==="allowsave"&&OWNER){ const v=document.getElementById("allowtxt").value; const list=[...new Set(v.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(x=>x.includes("@")))];
    db.doc("access/allow").set({emails:list}).then(()=>{ALLOW=list;toast("Elenco salvato: "+list.length+" email");render();}).catch(()=>toast("Salvataggio non riuscito")); return; }
  if(a==="swdel"&&ADMIN()){ const id=el.dataset.id; if(UI.confirm!=="swdel-"+id){UI.confirm="swdel-"+id;render();return;} UI.confirm=null;
    db.collection("swaps").doc(id).delete().then(()=>{delete SW[id];toast("Cambio eliminato dallo storico");render();}).catch(()=>toast("Eliminazione non riuscita")); return; }
  if(a==="mswex"){ const F=UI.msw=UI.msw||{}; F.ex=F.ex||{}; F.ex[el.dataset.id]=el.dataset.v==="1"; render(); return; }
  if(a==="mswgo"&&ADMIN()){ if(UI.confirm!=="mswgo"){UI.confirm="mswgo";render();return;} UI.confirm=null;
    const F=UI.msw||{}; if(!F.from||!F.a||!F.to) return; const [ad,ak]=F.a.split("#"), now=new Date().toISOString();
    const x={id:uid()+uid(),mk:UI.mk,from:F.from,to:F.to,a:{d:ad,k:ak},b:F.b?{d:F.b.split("#")[0],k:F.b.split("#")[1]}:null,extra:(UI.mExtra||[]).map(e=>({d:e.d,k:e.k,giver:e.giver,taker:e.taker})),status:"accepted",manual:true,by:myPid()||"owner",created:now,decided:now};
    const w=swapWarnings(UI.mk,x); if(!w.ok){toast("Cambio non possibile");return;}
    x.forced=[...w.from.map(t=>"per "+resName(x.from)+": "+t),...w.to.map(t=>"per "+resName(x.to)+": "+t)];
    swWrite(x).then(okk=>{ if(okk){ UI.msw={}; toast("Cambio applicato"); consolidate(); render(); } }); return; }
  if(a==="planday"){ const d=el.dataset.d; if(!maybePlan(UI.mk,UI.sel,d)) toast("Nessun conflitto"); return; }
  if(a==="planc"){ const [pid,d]=el.dataset.id.split("~"); if(!maybePlan(UI.mk,pid,d)) toast("Conflitto già risolto"); return; }
  if(a==="planreq"||a==="planapp"){ const P=UI.plan; if(!P) return; const c=P.list[+el.dataset.c], o=P.opts[+el.dataset.c][+el.dataset.o]; if(!c||!o) return;
    if(a==="planapp"&&UI.confirm!=="planapp-"+el.dataset.c+"-"+el.dataset.o){ UI.confirm="planapp-"+el.dataset.c+"-"+el.dataset.o; planSheet(P.mk,P.list); return; }
    UI.confirm=null; const now=new Date().toISOString();
    const x={id:uid()+uid(),mk:P.mk,from:c.pid,to:o.pid,a:{d:c.d,k:c.k},b:o.x.b?{...o.x.b}:null,extra:(o.x.extra||[]).map(e=>({d:e.d,k:e.k,giver:e.giver,taker:e.taker})),created:now,by:myPid()||"owner",reason:"indisponibilità"};
    x.to=o.pid; if(o.leave) x.reason="indisponibilità (turno lasciato scoperto)";
    if(o.kind==="catena"){ x.needs=[o.pid,o.third]; x.acc=[]; }
    if(a==="planapp"){ x.status="accepted"; x.manual=true; x.decided=now; x.forced=[...o.w.holes,...o.w.from.map(t=>"per "+resName(c.pid)+": "+t),...o.w.to.map(t=>"per "+resName(o.pid)+": "+t)]; }
    else { x.status="pending"; x.warn=[...o.w.holes,...o.w.from,...o.w.to]; }
    swWrite(x).then(ok=>{ if(!ok) return; toast(a==="planapp"?"Cambio applicato":"Richiesta inviata a "+resName(o.pid)); closeSheet(); consolidate(); render(); }); return; }
  if(a==="swopen"){ answerSheet(el.dataset.id); return; }
  if(a==="swacc"||a==="swrej"||a==="swcancel"||a==="swinvalid"){ const x=SW[el.dataset.id]; if(!x) return;
    const nx={...x,decided:new Date().toISOString()};
    if(a==="swacc"){ const w=swapWarnings(x.mk,x);
      if(!w.ok){nx.status="invalid";}
      else if(x.needs&&[...new Set([...(x.acc||[]),myPid()])].length<x.needs.length){ nx.acc=[...new Set([...(x.acc||[]),myPid()])]; delete nx.decided; nx.status="pending"; }
      else { nx.status="accepted"; if(x.needs) nx.acc=[...x.needs]; nx.forced=[...w.holes,...w.to.map(t=>"per "+resName(x.to)+": "+t),...w.from.map(t=>"per "+resName(x.from)+": "+t)]; } }
    else nx.status=a==="swrej"?"rejected":a==="swcancel"?"cancelled":"invalid";
    swWrite(nx).then(ok=>{ if(ok){ closeSheet(); toast(nx.status==="accepted"?"Cambio accettato: orario aggiornato":nx.status==="pending"?"Hai accettato: si attende la conferma dell'altro collega":nx.status==="rejected"?"Cambio rifiutato":"Richiesta chiusa"); render(); consolidate(); } }); return; }
  if(a==="clrF"||a==="clrC"){ if(UI.confirm!==a){UI.confirm=a;render();return;} UI.confirm=null;
    clearUnav([UI.sel],a==="clrF"?"F":"C"); toast((a==="clrF"?"Ferie":"Ferie congresso")+" di "+resName(UI.sel)+" eliminate"); render(); return; }
  if(a==="clrext"){ if(UI.confirm!==a){UI.confirm=a;render();return;} UI.confirm=null; const mo=M(UI.mk); mo.ext={}; syncExt(mo); persist(); render(); toast("Turni degli altri anni rimossi: quei turni tornano da coprire"+(mo.generated?" (rigenera per assegnarli)":"")); return; }
  if(a==="covy"){ const k=el.dataset.k, y=+el.dataset.y; const cur=Array.isArray(COVY[k])?[...COVY[k]]:[...(COV_DEF[k]||LEVELS)];
    const i=cur.indexOf(y); if(i>=0) cur.splice(i,1); else cur.push(y); cur.sort();
    const next={...COVY,[k]:cur}; COVY=next; EXTC.key=null; render();
    saveYearsDoc().catch(()=>toast("Non riesco a salvare: le regole del database vanno aggiornate"));
    return; }
  if(a==="rflag"){ const r=resOf(el.dataset.id); if(!r) return; const f=el.dataset.f; r[f]=!canDo(r.id,f==="nights"?"N":"D"); persist(); render(); return; }
  if(a==="privsw"){ if(!ADMIN()) return; db.doc("config/privacy").set({hideUnav:HIDEUNAV,hideSwaps:!HIDESWAPS,updated:new Date().toISOString()}).then(()=>toast(!HIDESWAPS?"Cambi degli altri nascosti agli specializzandi":"Cambi di nuovo visibili a tutti")).catch(()=>toast("Non riesco a salvare: aggiorna le regole del database")); return; }
  if(a==="swmine"){ UI.swMine=el.dataset.v==="1"; render(); return; }
  if(a==="privtog"){ if(!ADMIN()) return; db.doc("config/privacy").set({hideUnav:!HIDEUNAV,hideSwaps:HIDESWAPS,updated:new Date().toISOString()}).then(()=>toast(!HIDEUNAV?"Indisponibilità degli altri nascoste agli specializzandi":"Indisponibilità di nuovo visibili a tutti")).catch(()=>toast("Non riesco a salvare: aggiorna le regole del database")); return; }
  if(a==="umodeon"){ setUserMode(true); UI.tab="turni"; render(); toast("Modalità specializzando: per tornare vai in Impostazioni"); return; }
  if(a==="umodeoff"){ setUserMode(false); render(); toast("Modalità rappresentante attiva"); return; }
  if(a==="year"){ switchYear(+el.dataset.v); render(); return; }
  if(a==="years"){ if(UI.confirm!=="years"){UI.confirm="years";render();return;} UI.confirm=null;
    if(S.multiYear){ S.multiYear=false; persist(); toast("Più anni disattivato: dati degli altri anni conservati"); render(); return; }
    el.disabled=true; el.textContent="Creazione degli anni…"; enableYears().then(()=>{ toast("Più anni attivo: scegli l'anno in alto"); render(); }).catch(e=>{ toast("Errore: "+(e.message||e)); render(); }); return; }
  if(a==="extmark"){ TICK++; const mo=M(UI.mk), d=layer.dataset.d, k=layer.dataset.k, kk=d+"|"+k; mo.ext={...(mo.ext||{})};
    if(el.dataset.v==="1"){ mo.ext[kk]=[...(mo.ext[kk]||[]).filter(x=>x!==EXT_MAN),EXT_MAN];
      if(extCovered(mo,d,k)){ const fx=mo.fixed=mo.fixed||{}; Object.keys(fx).filter(z=>z.startsWith(kk+"|")).forEach(z=>delete fx[z]); const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=[]; } }
    else { const l=(mo.ext[kk]||[]).filter(x=>x!==EXT_MAN); if(l.length) mo.ext[kk]=l; else delete mo.ext[kk]; }
    syncExt(mo); persist(); closeSheet(); render(); return; }
  if(a==="closeroom"){ const d=layer.dataset.d, k=layer.dataset.k, [pid,sh]=k.split("|"), post=postOf(pid);
    const shs=el.dataset.v==="2"?["M","P"].filter(x=>((post.on||{})[dayType(d)]||[]).includes(x)):[sh]; if(!shs.includes(sh)) shs.push(sh);
    const n=applyClosed(UI.mk,shs.map(x=>d+"|"+pid+"|"+x),el.dataset.v!=="0"); persist(); closeSheet(); render();
    toast(el.dataset.v==="0"?"Sala riaperta per tutti gli anni (nella bozza)":"Sala chiusa per tutti gli anni: nessuno assegnato (nella bozza, da accettare)"); return; }
  if(a==="chseen"){ const {pid,list}=myChanges(); const last=list.reduce((m,c)=>c.at>m?c.at:m,""); try{ localStorage.setItem("turni.chseen."+pid,last); }catch(e){} render(); return; }
  if(a==="forcerot"){ UI.forceRot=layer.dataset.d+"|"+layer.dataset.k; cellSheet(layer.dataset.d,layer.dataset.k); return; }
  if(a==="holeadd"){ const dk=layer.dataset.d+"|"+layer.dataset.k; addHoleTag(UI.mk,dk,+el.dataset.v); cellSheet(layer.dataset.d,layer.dataset.k); render(); return; }
  if(a==="holedel"){ const dk=layer.dataset.d+"|"+layer.dataset.k, i=+el.dataset.i; editHoleTags(UI.mk,dk,t=>t.filter((x,j)=>j!==i)); cellSheet(layer.dataset.d,layer.dataset.k); render(); return; }
  if(a==="holesel"){ const n=setHoleTag(UI.mk,[...UI.clsel],+el.dataset.v); UI.clsel=null; render(); toast(n?(+el.dataset.v?`${n} turni scoperti assegnati al ${ROMAN[+el.dataset.v]} anno`:`${n} turni scoperti senza anno`):"Nessuna modifica"); return; }
  if(a==="optopen"){ UI.optOpen=!UI.optOpen; render(); return; }
  if(a==="toolsopen"){ UI.toolsOpen=!UI.toolsOpen; render(); return; }
  if(a==="pubwk"){ UI.pubWk=!UI.pubWk; render(); return; }
  if(a==="prep"){ const mo=M(UI.mk);
    if(!mo.sched&&!hasDraft(mo)){ generate(UI.mk); histAdd(UI.mk,"Bozza generata (tutto il mese)",mo.draft.sched); persist(); render(); toast("Bozza pronta: controllala e pubblicala dalla barra in basso"); return; }
    const r=refreshSched(UI.mk); if(r.past){ toast("Il mese è già passato: non c'è niente da aggiornare"); return; } if(hasDraft(mo)) histAdd(UI.mk,"Bozza preparata",mo.draft.sched); persist(); render();
    toast(`Bozza pronta: ${r.added} turni assegnati, ${r.removed} tolti per indisponibilità${r.wrong?`, ${r.wrong} tolti perché fuori rotazione`:""}, ${r.covered} lasciati ad altri anni, ${r.moved} spostati tra sale`); return; }
  if(a==="daywk"){ UI.dayWk=UI.dayWk||{}; UI.dayWk[UI.mk]=el.dataset.v==="all"?"all":+el.dataset.v; render(); return; }
  if(a==="filt"){ UI.filt=el.dataset.v; render(); return; }
  if(a==="dview"){ UI.draftView=el.dataset.v==="1"; render(); return; }
  if(a==="accall"){ if(UI.confirm!=="accall"){UI.confirm="accall";render();return;} UI.confirm=null; const n=period(UI.mk).days.length/7, acc=(M(UI.mk).draft||{}).acc||{};
    acceptDraft(UI.mk,Array.from({length:n},(_,w)=>w).filter(w=>!acc[w])); persist(); consolidate(); render(); toast("Orario pubblicato"); return; }
  if(a==="accw"){ const w=+el.dataset.w; if(UI.confirm!=="accw-"+w){UI.confirm="accw-"+w;render();return;} UI.confirm=null;
    acceptDraft(UI.mk,[w]); persist(); render(); toast(`Settimana ${w+1} pubblicata`); return; }
  if(a==="drop"){ if(UI.confirm!=="drop"){UI.confirm="drop";render();return;} UI.confirm=null; delete M(UI.mk).draft; const oth=eachOtherYear(UI.mk,m=>{ if(!m.draft) return false; delete m.draft; }); persist(); render(); toast(`Bozza eliminata${oth?" per tutti gli anni":""} (una copia resta nello storico)`); return; }
  if(a==="hist"){ const mk=UI.mk; UI.hist=UI.hist||{}; if(UI.hist[mk]&&UI.hist[mk]!=="loading"){ delete UI.hist[mk]; render(); return; } UI.hist[mk]="loading"; render();
    db.collection(`hist/y${CURY}_${mk}/v`).limit(100).get().then(r=>{ UI.hist[mk]=r.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.at||"").localeCompare(a.at||"")); render(); })
      .catch(()=>{ UI.hist[mk]=[]; toast("Storico non disponibile: aggiorna le regole del database"); render(); }); return; }
  if(a==="hdel"){ const i=+el.dataset.i, list=(UI.hist||{})[UI.mk]||[], h=list[i]; if(!h) return; if(UI.confirm!=="hdel-"+i){UI.confirm="hdel-"+i;render();return;} UI.confirm=null;
    db.doc(`hist/y${CURY}_${UI.mk}/v/${h.id}`).delete().then(()=>{ list.splice(i,1); toast("Eliminata dallo storico"); render(); }).catch(()=>toast("Non riesco a eliminarla: aggiorna le regole del database")); return; }
  if(a==="hopen"){ const i=+el.dataset.i, h=((UI.hist||{})[UI.mk]||[])[i]; if(!h) return; if(UI.confirm!=="hopen-"+i){UI.confirm="hopen-"+i;render();return;} UI.confirm=null;
    let sc=null; try{ sc=JSON.parse(h.state); }catch(e){} if(sc&&sc.rot&&("fixed" in sc)) sc=sc.sched||(sc.draft&&sc.draft.sched); if(!sc){ toast("Questa voce non contiene un orario"); return; } M(UI.mk).draft={sched:sc,at:new Date().toISOString(),acc:{},from:h.at}; UI.draftView=true; persist(); render(); toast("Bozza ripristinata dallo storico"); return; }
  if(a==="refrot"){ if(!UI.refRot) return; if(UI.confirm!=="refrot"){UI.confirm="refrot";render();return;} UI.confirm=null;
    const r=refreshSched(UI.mk,UI.refRot); if(hasDraft(M(UI.mk))) histAdd(UI.mk,"Bozza aggiornata: "+rotName(UI.refRot),M(UI.mk).draft.sched); persist(); render(); toast(`${rotName(UI.refRot)} aggiornata: ${r.removed} tolti per indisponibilità, ${r.covered} liberati perché coperti da altri anni, ${r.added} nuovi assegnati, ${r.moved} spostati tra sale`); return; }
  if(a==="refresh"){ if(UI.confirm!=="refresh"){UI.confirm="refresh";render();return;} UI.confirm=null;
    const r=refreshSched(UI.mk); if(hasDraft(M(UI.mk))) histAdd(UI.mk,"Bozza aggiornata",M(UI.mk).draft.sched); persist(); render(); toast(`Orario aggiornato: ${r.removed} tolti per indisponibilità, ${r.covered} liberati perché coperti da altri anni, ${r.added} nuovi assegnati, ${r.moved} spostati tra sale della stessa metodica`); return; }
  if(a==="nightlink"){ UI.extKind="nights"; a="extlink"; }
  else if(a==="extlink") UI.extKind="rooms";
  if(a==="nightsave"){ const r=UI.nightRes; if(!r) return; const x=applyNights(UI.mk,r); UI.nightRes=null; UI.extWb=null; persist(); closeSheet(); render();
    toast(`Inseriti ${x.pins} turni fissi dei nostri e ${x.cov} turni coperti da altri anni (nella bozza)`); return; }
  if(a==="extlink"){ sheet(`<div class="row" style="justify-content:space-between"><h2>Turni degli altri anni</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
     <label class="stack" style="gap:4px"><span class="label">Link del foglio Google</span><input id="extUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(S.extSheetUrl||"")}"></label>
     <p class="muted" style="margin:0;font-size:.84rem">${UI.extKind==="nights"?"Apri la scheda delle notti e guardie (es. «Guardie/Notti NOV-GEN») e copia il link dalla barra degli indirizzi (deve contenere <code>gid=</code>).":""} Apri la scheda del mese giusto e copia il link dalla barra degli indirizzi (contiene <code>gid=</code>). Se il link non indica la scheda, si usa quella chiamata «${esc(monthName(UI.mk))}». Il foglio deve essere condiviso come «Chiunque abbia il link può visualizzare».</p>
     <p id="extErr" style="margin:0;font-size:.85rem;color:var(--bad)"></p>
     <div class="row"><button class="btn primary" data-act="extfetch">Leggi il foglio</button><button class="btn" data-act="close">Annulla</button></div>`); return; }
  if(a==="extfetch"){ const url=(document.getElementById("extUrl")||{}).value||"", id=(url.match(/\/d\/([A-Za-z0-9_-]{20,})/)||[])[1], gid=(url.match(/[#&?]gid=(\d+)/)||[])[1];
    if(!id){ toast("Link non valido: deve essere un link di Google Fogli"); return; }
    if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
    S.extSheetUrl=url.trim(); persist();
    const mn=monthName(UI.mk), title=mn.charAt(0).toUpperCase()+mn.slice(1);
    const src=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&`+(gid?`gid=${gid}`:`sheet=${encodeURIComponent(title)}`);
    el.disabled=true; el.textContent="Lettura in corso…";
    fetch(src).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }).then(txt=>{
      if(/^\s*</.test(txt)) throw new Error("accesso negato");
      UI.extWb=XLSX.read(txt,{type:"string",raw:true}); const n=UI.extWb.SheetNames[0]; if(UI.extKind==="nights") nightsPreview(n); else extPreview(n);
    }).catch(err=>{ el.disabled=false; el.textContent="Leggi il foglio";
      const box=document.getElementById("extErr"); if(box) box.textContent="Non riesco a leggere il foglio ("+err.message+"). Controlla che sia condiviso come «Chiunque abbia il link può visualizzare», oppure scaricalo in Excel e usa «da file»."; });
    return; }
  if(a==="extsave"){ const mo=M(UI.mk), r=UI.extRes; if(!r) return; const man={}; for(const k in (mo.ext||{})) if((mo.ext[k]||[]).includes(EXT_MAN)) man[k]=[EXT_MAN];
    mo.ext={...r.map}; for(const k in man) mo.ext[k]=[...(mo.ext[k]||[]),EXT_MAN]; if(mo.extReset){ mo.extReset={...mo.extReset}; (r.colDays||[]).forEach(d=>delete mo.extReset[d]); } sheetSave(mo,r); SEXC.key=null; syncExt(mo); const mv=alignOwn(mo,r); UI.extRes=null; UI.extWb=null; persist(); closeSheet(); render();
    toast(`${Object.keys(r.map).length} turni coperti da altri anni salvati`+(mv?`; ${mv} turni dei nostri aggiornati nella bozza come nel foglio (da accettare)`:"")+((mo.generated||hasDraft(mo))?". Usa «Aggiorna l'orario» per ridistribuire":"")); return; }
  if(a==="clrone"||a==="clrall"||a==="clrsched"){ if(UI.confirm!==a){UI.confirm=a;render();return;} UI.confirm=null;
    if(a==="clrsched"){ const mo=M(UI.mk); mo.sched=null; mo.generated=null; mo.fixed={}; delete mo.draft; toast("Turni e bozza eliminati"); }
    else { const mode=UI.umode||"T"; clearUnav(a==="clrone"?[UI.sel]:S.residents.map(r=>r.id),mode); toast(a==="clrone"?"Eliminate per "+resName(UI.sel):"Eliminate per tutti"); }
    persist(); render(); return; }
  if(a==="mtoday"){goMonth(todayMk());return;}
  if(a==="mprev"||a==="mnext"){const [y,m]=UI.mk.split("-").map(Number); const nk=mkOf(y,m+(a==="mnext"?1:-1)); if(nk<oldestMk()||nk>newestMk()){ toast("Si possono vedere solo i 3 mesi precedenti e i 3 successivi"); return; } goMonth(nk); return;}
  if(a==="goto"){UI.tab=el.dataset.tab;render();return;}
  if(a==="sel"){UI.sel=el.dataset.id;UI.selTouched=true;try{localStorage.setItem("turni.me",UI.sel);}catch(_){}render();return;}
  if(a==="day"&&db&&!canEditUnav(UI.sel)){ toast(unavDenyMsg(UI.sel)); return; }
  if(a==="day"){ const mode=UI.umode||"T"; if(mode==="T"){daySheet(el.dataset.d);return;}
    if(mode==="R"){ if(!canPref(UI.sel)){ toast("Le preferenze sono solo per 3° e 4° anno"); return; } if(db&&!canEditUnav(UI.sel)){ toast(unavDenyMsg(UI.sel)); return; } prefSheet(el.dataset.d); return; }
    const mo=M(UI.mk), d=el.dataset.d; mo.unav[UI.sel]={...(mo.unav[UI.sel]||{})};
    if(unavOf(mo,UI.sel,d)===mode) delete mo.unav[UI.sel][d]; else mo.unav[UI.sel][d]=mode; saveUnav(UI.mk,UI.sel); render(); maybePlan(UI.mk,UI.sel,d); return; }
  if(a==="umode"){UI.umode=el.dataset.v;render();return;}
  if(a==="pf"){ const d=layer.dataset.d, v=el.dataset.v; const cur={...(PR(UI.mk)[UI.sel]||{})}; if(v) cur[d]=v; else delete cur[d]; PR(UI.mk)[UI.sel]=cur;
    saveUnav(UI.mk,UI.sel); closeSheet(); render(); return; }
  if(a==="clrR"){ if(UI.confirm!==a){UI.confirm=a;render();return;} UI.confirm=null; PR(UI.mk)[UI.sel]={}; saveUnav(UI.mk,UI.sel); toast("Preferenze eliminate"); render(); return; }
  if(a==="u"){ const d=layer.dataset.d, mo=M(UI.mk), v=el.dataset.v; mo.unav[UI.sel]={...(mo.unav[UI.sel]||{})};
    let u=unavOf(mo,UI.sel,d);
    if(v==="") u=""; else if(v==="G") u=u==="G"?"":"G";
    else { if(FULL[u])u=""; u=u.includes(v)?u.replace(v,""):u+v; u=SH.filter(s=>u.includes(s)).join(""); const av=shiftsOfDay(d); if(av.length&&av.every(s=>u.includes(s)))u="G"; }
    if(u) mo.unav[UI.sel][d]=u; else delete mo.unav[UI.sel][d];
    saveUnav(UI.mk,UI.sel); daySheet(d); render(); return; }
  if(a==="genwk"){ const mo=M(UI.mk), p=period(UI.mk), wk=UI.genWk===""||UI.genWk===undefined?null:+UI.genWk;
    const has=hasDraft(mo)&&(wk===null?p.days:p.days.slice(wk*7,wk*7+7)).some(d=>Object.values((mo.draft.sched||{})[d]||{}).some(a=>a.some(x=>x)));
    if(has&&UI.confirm!=="genwk"){UI.confirm="genwk";render();return;} UI.confirm=null;
    generate(UI.mk, wk===null?undefined:wk); histAdd(UI.mk,wk===null?"Bozza generata (tutto il mese)":`Bozza generata: settimana ${wk+1}`,mo.draft.sched); persist(); render(); toast("Bozza pronta: controllala e pubblicala dalla barra in basso"); return; }
  if(a==="gen"){ const mo=M(UI.mk); if(mo.sched&&UI.confirm!=="gen"){UI.confirm="gen";render();return;}
    UI.confirm=null; generate(UI.mk); persist(); render(); toast("Turni generati"); return; }
  if(a==="xlsx"){ if(ADMIN()) exportXlsx(); return;}
  if(a==="xunav"){exportUnav();return;}
  if(a==="backup"){exportBackup();return;}
  if(a==="xbozza"){exportBozza();return;}
  if(a==="view"){UI.view=el.dataset.v;render();return;}
  if(a==="cell"&&UI.clsel){ const kk=el.dataset.d+"|"+el.dataset.k; if(UI.clsel.has(kk)) UI.clsel.delete(kk); else UI.clsel.add(kk);
    /* solo la casella e il contatore: niente ridisegno */
    el.classList.toggle("sel",UI.clsel.has(kk)); const c=document.getElementById("clselN"); if(c) c.textContent=UI.clsel.size; document.querySelectorAll(".clselbtn").forEach(b=>b.disabled=!UI.clsel.size); return; }
  if(a==="clsel"){ UI.clsel=UI.clsel?null:new Set(); render(); return; }
  if(a==="clapply"){ const n=applyClosed(UI.mk,[...UI.clsel],el.dataset.v==="1"); UI.clsel=null; persist(); render();
    toast(n?(el.dataset.v==="1"?`${n} turni chiusi (nella bozza, da accettare)`:`${n} turni riaperti (nella bozza)`):"Nessuna modifica"); return; }
  if(a==="cell"){ if(hasDraft(M(UI.mk))) UI.draftView=true;cellSheet(el.dataset.d,el.dataset.k);return;}
  if(a==="othadd"||a==="othdel"){ othEdit(UI.mk,+el.dataset.y,layer.dataset.d,layer.dataset.k,el.dataset.id,a==="othadd"); closeSheet(); render(); return; }
  if(a==="restpub"){ if(UI.confirm!=="restpub"){UI.confirm="restpub";render();return;} UI.confirm=null; restorePublished(UI.mk,UI.rstWk===""||UI.rstWk===undefined||UI.rstWk===null?null:+UI.rstWk); return; }
  if(a==="assign"){ const mo=M(UI.mk), d=layer.dataset.d, k=layer.dataset.k, i=+el.dataset.i, id=el.dataset.id||null;
    const W=ensureDraft(mo,d); mo.draft.who={...(mo.draft.who||{}),[d+"|"+k]:whoAmI()}; /* chi ha modificato la casella (per il messaggio di cambio) */ W[d]=W[d]||{}; W[d][k]=W[d][k]||[null]; const arr=W[d][k], fx=mo.fixed=mo.fixed||{}, pre=d+"|"+k+"|";
    if(id){ arr[i]=id; fx[pre+i]=id; }
    else if(arr.filter(x=>x).length>1){ /* più persone: si toglie solo questa e si riallineano i turni fissi */
      const pins=arr.map((x,j)=>fx[pre+j]===x&&x?x:null); arr.splice(i,1); pins.splice(i,1);
      Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>delete fx[z]); pins.forEach((x,j)=>{ if(x) fx[pre+j]=x; }); }
    else { arr[i]=null; delete fx[pre+i]; }
    persist(); closeSheet(); render(); return; }
  if(a==="reset"){ if(UI.confirm!=="reset"){UI.confirm="reset";render();return;} UI.confirm=null; resetRange(UI.mk,UI.rstWk===""||UI.rstWk===undefined||UI.rstWk===null?null:+UI.rstWk); return; }
  if(a==="clrgen"){ if(UI.confirm!=="clrgen"){UI.confirm="clrgen";render();return;} UI.confirm=null; clearGenerated(UI.mk,UI.rstWk===""||UI.rstWk===undefined||UI.rstWk===null?null:+UI.rstWk); return; }
  if(a==="clrmine"){ if(UI.confirm!=="clrmine"){UI.confirm="clrmine";render();return;} UI.confirm=null; clearGenerated(UI.mk,UI.rstWk===""||UI.rstWk===undefined||UI.rstWk===null?null:+UI.rstWk,true); return; }
  if(a==="manualstart"){ const mo=M(UI.mk); if(!hasDraft(mo)){ const sc={}; period(UI.mk).days.forEach(d=>{ sc[d]={}; slotsOfDay(d).forEach(x=>{ sc[d][x.key]=extCovered(mo,d,x.key)?[]:[null]; }); }); mo.draft={sched:mo.sched?clone(mo.sched):sc,at:new Date().toISOString(),acc:{}}; } UI.draftView=true;
    UI.view="giorni"; persist(); render(); return; }
  if(a==="del"){ const id=el.dataset.id; if(UI.confirm!=="del-"+id){UI.confirm="del-"+id;render();return;}
    S.residents=S.residents.filter(r=>r.id!==id); UI.confirm=null; persist(); render(); return; }
  if(a==="addpost"){ S.posts.push({id:uid(),name:"Nuova postazione",cover:"ALL",on:{fer:["M"],sab:[],fes:[]}}); persist(); render(); return; }
  if(a==="delpost"){ const id=el.dataset.id; if(UI.confirm!=="delp-"+id){UI.confirm="delp-"+id;render();return;}
    S.posts=S.posts.filter(p=>p.id!==id); UI.confirm=null; persist(); render(); return; }
  if(a==="pall"){ const p=postOf(el.dataset.id); p.all=p.all||[]; toggle(p.all, el.dataset.v); persist(); render(); return; }
  if(a==="pon"){ const p=postOf(el.dataset.id); p.on[el.dataset.t]=p.on[el.dataset.t]||[]; toggle(p.on[el.dataset.t], el.dataset.v); persist(); render(); return; }
  if(a==="jolly"){ const r=S.rotations.find(x=>x.id===el.dataset.id); r.jolly=!r.jolly; persist(); render(); return; }
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.cap&&ADMIN()){ const [rn,sh,ix]=t.dataset.cap.split("|"), cur=[...capRaw(rn,sh)]; cur[+ix]=Math.max(+ix?1:0,Math.min(9,parseInt(t.value,10)||0)); if(cur[1]<cur[0]) cur[+ix?0:1]=cur[+ix];
    CAPS={...CAPS,[rn]:{...(CAPS[rn]||{}),[sh]:cur}}; TICK++; if(db) saveYearsDoc().catch(()=>toast("Non riesco a salvare")); render(); return; }
  if(t.dataset&&t.dataset.ycol&&ADMIN()){ YCOL={...YCOL,[t.dataset.ycol]:t.value}; if(db) saveYearsDoc().catch(()=>toast("Non riesco a salvare il colore")); render(); return; }
  if(t.id==="extfile"&&ADMIN()&&t.files&&t.files[0]){ if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
    const fr=new FileReader(); fr.onload=()=>{ try{ const wb=XLSX.read(fr.result,{type:"array"}); UI.extWb=wb;
        const want=monthName(UI.mk).toLowerCase(), name=wb.SheetNames.find(n=>n.trim().toLowerCase()===want)||wb.SheetNames.find(n=>n.toLowerCase().includes(want.split(" ")[0]))||wb.SheetNames[0];
        extPreview(name); }catch(err){ toast("File non leggibile: "+err.message); } };
    fr.readAsArrayBuffer(t.files[0]); t.value=""; return; }
  if(t.id==="extsheet"){ extPreview(t.value); return; }
  if(t.id==="nightsheet"){ nightsPreview(t.value); return; }
  if(t.id==="nightfile"&&ADMIN()&&t.files&&t.files[0]){ if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
    const fr=new FileReader(); fr.onload=()=>{ try{ const wb=XLSX.read(fr.result,{type:"array",cellDates:true}); UI.extWb=wb; UI.extKind="nights";
        const ab=MESI[+UI.mk.slice(5)-1].slice(0,3).toLowerCase(), cands=wb.SheetNames.filter(n=>/nott/i.test(n));
        const inRange=n=>{ const m=n.toLowerCase().match(/([a-z]{3})\s*-\s*([a-z]{3})/); if(!m) return false; const ab3=MESI.map(x=>x.slice(0,3)); let i=ab3.indexOf(m[1]); const e=ab3.indexOf(m[2]); if(i<0||e<0) return false; for(let k=0;k<12;k++){ if(ab3[i]===ab) return true; if(i===e) break; i=(i+1)%12; } return false; };
        nightsPreview(cands.find(inRange)||cands[0]||wb.SheetNames[0]); }catch(err){ toast("File non leggibile: "+err.message); } };
    fr.readAsArrayBuffer(t.files[0]); t.value=""; return; }
  if(t.id==="impfile"&&OWNER&&t.files&&t.files[0]){ const fr=new FileReader(); fr.onload=async()=>{ try{
      const x=JSON.parse(fr.result); const at=new Date().toISOString();
      if(x.type==="turni-backup"){ toast("Ripristino della copia in corso…");
        let ko=0; for(const p in (x.docs||{})){ try{ await db.doc(p).set(x.docs[p]); }catch(e){ ko++; } }
        for(const p in (x.cols||{})){ if(p==="accessRequests") continue; for(const d of x.cols[p]){ try{ await db.collection(p).doc(d.id).set(d.data); }catch(e){ ko++; } } }
        toast(ko?`Copia ripristinata, ${ko} elementi non scritti: ricarico`:"Copia di sicurezza ripristinata: ricarico"); setTimeout(()=>location.reload(),1800); return; }
      if(x.config) await db.doc("config/main").set({state:typeof x.config==="string"?x.config:JSON.stringify(x.config),updated:at});
      if(x.planner) await db.doc("planner/state").set({state:typeof x.planner==="string"?x.planner:JSON.stringify(x.planner),updated:at});
      for(const u of (x.unav||[])) await db.collection("unav/staff/m").doc(u.mk+"_"+u.pid).set({mk:u.mk,pid:u.pid,days:u.days||{},updated:at});
      for(const w of (x.swaps||[])) await db.collection("swaps").doc(w.id).set(w);
      toast("Dati importati: ricarico"); setTimeout(()=>location.reload(),1200);
    }catch(err){ toast("File non valido o salvataggio non riuscito"); } }; fr.readAsText(t.files[0]); return; }
  if(t.dataset.msw){ const F=UI.msw=UI.msw||{}; const k=t.dataset.msw; F[k]=t.value; if(k==="from") F.a=""; if(k==="to") F.b=""; F.ex={}; UI.confirm=null; render(); return; }
  if(t.dataset.refrot){ UI.refRot=t.value; UI.confirm=null; render(); return; }
  if(t.dataset.genwk){ UI.genWk=t.value; UI.confirm=null; render(); return; }
  if(t.dataset.rstwk){ UI.rstWk=t.value; UI.confirm=null; render(); return; }
  if(t.dataset.who){ UI.who=t.value; render(); return; }
  if(t.dataset.sw){ const F=UI.sw=UI.sw||{}; F[t.dataset.sw]=t.value; if(t.dataset.sw==="to") F.b=""; F.ex={}; UI.swPrev=null; render(); return; }
  if(t.dataset.rot){ const mo=M(UI.mk); if(t.value) mo.rot[t.dataset.rot]=t.value; else delete mo.rot[t.dataset.rot]; persist(); render(); }
  if(t.dataset.rname){ const r=S.residents.find(x=>x.id===t.dataset.rname); const v=t.value.trim(); if(r&&v){ r.name=v; sortRes(S.residents); persist(); render(); } return; }
  if(t.dataset.pname){ postOf(t.dataset.pname).name=t.value.trim()||"Postazione"; persist(); }
  if(t.dataset.pcov){ postOf(t.dataset.pcov).cover=t.value; persist(); }
  if(t.dataset.hour){ S.hours[t.dataset.hour]=t.value.trim(); persist(); }
  if(t.dataset.lim){ S[t.dataset.lim]=Math.max(0,parseInt(t.value)||0); persist(); }
});
document.addEventListener("submit",e=>{ if(e.target.id!=="addform")return; e.preventDefault();
  const n=document.getElementById("newname").value.trim(), y=parseInt(document.getElementById("newyear").value)||2; if(!n)return;
  S.residents.push({id:uid(),name:n,year:y}); sortRes(S.residents); persist(); render(); setTimeout(()=>document.getElementById("newname").focus(),0); });
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&layer.innerHTML){closeSheet();render();}});

/* ---------- boot ---------- */
render();
(async()=>{
  const claude=window.claude;
  const [d1,d2,u1]=await Promise.all([claude?claude.use("db"):null, claude?claude.use("downloads"):null, claude?claude.use("user"):null]);
  db=d1; downloads=d2;
  OWNER = u1 ? await u1.isOwner().catch(()=>false) : !db; REALOWNER=OWNER;
  try{ if(localStorage.getItem("turni.usermode")==="1"){ UI.userMode=true; OWNER=false; } }catch(e){}
  USER=u1; MYUID = u1 ? await u1.id().catch(()=>null) : null;
  if(db){ docRef=db.doc("planner/state"); cfgRef=db.doc("config/main");
    /* RAW[anno] = {cfg, mon} come arrivano dal database (undefined = non ancora arrivato) */
    const rebuild=()=>{ const R=RAW[CURY]||{}, rawCfg=R.cfg, rawMon=R.mon; if(rawCfg===undefined||rawMon===undefined) return; if(S&&(saveT||saving)) return;
      const mon=rawMon?JSON.parse(rawMon):null, cfg=rawCfg?JSON.parse(rawCfg):(mon?(({months,...c})=>c)(mon):null);
      S=load(cfg?JSON.stringify({...cfg,months:(mon&&mon.months)||{}}):null);
      const sp=splitS(); lastCfg=rawCfg?sp.cfg:""; lastMon=rawMon&&!(!rawCfg&&mon&&mon.residents)?sp.mon:"";
      if(MS[CURY]){ const L={}; for(const mk in (S.months||{})) L[mk]=JSON.stringify(S.months[mk]); MS[CURY].last=L; }
      setSync(cfg?"Salvato":OWNER?"Nessun dato ancora":"In attesa dei dati");
      if(OWNER&&(migrated||!rawCfg&&cfg)){migrated=false;persist();}
      for(const yy in MS) if(MS[yy].legacy&&!MS[yy].legacy.split) splitMonths(+yy);
      checkMulti(); pruneOld(); runSheetAlign(); if(HIDEUNAV) recomputeUnav(); filterSW(); consolidate(); autoInvalidate(); syncRoles(); autoYear(); if(!layer.innerHTML) render(); };
    REBUILD=rebuild;
    const subY={};
    const watchYear=y=>{ if(subY[y]) return; subY[y]=true; RAW[y]=RAW[y]||{}; const d=yDocs(y); MS[y]=MS[y]||{legacy:undefined,m:{},mu:{},last:{}};
      const after=(k,raw)=>{ if(y===CURY) rebuild(); else { if(y===2) checkMulti(); if(raw===null&&k==="cfg") ensureCohorts(); syncRoles(); autoYear(); if(S&&!layer.innerHTML) render(); } };
      const lost=()=>setSync("Connessione persa: ricarica la pagina");
      db.doc(d.cfg).onSnapshot(snap=>{ const raw=snap.exists?snap.data().state:null; if(raw===RAW[y].cfg) return; RAW[y].cfg=raw; RAWV++; after("cfg",raw); },lost);
      /* mesi: vecchio documento + un documento per ciascuno dei 7 mesi visibili */
      const monChanged=()=>{ const a=assembleMon(y); if(a===undefined) return; if(!a.split) splitMonths(y); if(a.raw===RAW[y].mon) return; RAW[y].mon=a.raw; RAWV++; after("mon",a.raw); };
      db.doc(d.mon).onSnapshot(snap=>{ MS[y].legacy=snap.exists?{raw:snap.data().state||null,split:!!snap.data().split,at:snap.data().updated||""}:null; monChanged(); },lost);
      monWindow().forEach(mk=>db.doc(monPath(y,mk)).onSnapshot(snap=>{ MS[y].m[mk]=snap.exists?(snap.data().state||null):null; MS[y].mu[mk]=snap.exists?(snap.data().updated||""):""; monChanged(); },()=>{ MS[y].m[mk]=null; monChanged(); })); };
    /* più anni acceso/spento: lo decide il config dell'anno 2 */
    const checkMulti=()=>{ const st2=yState(2); const on=!!(st2&&st2.multiYear); if(on===MULTI) return; MULTI=on; EXTC.key=null;
      if(MULTI){ ALLY().forEach(watchYear); ensureCohorts(); } else if(CURY!==2) switchYear(2); watchCov(); filterSW(); };
    let covSub=false;
    const watchCov=()=>{ if(covSub) return; covSub=true; db.doc("config/years").onSnapshot(sn=>{ let c={}, cl={}, yc={}, hy={}; try{ const o=JSON.parse((sn.exists&&sn.data().state)||"{}"); c=o.coverage||{}; cl=o.closed||{}; yc=o.colors||{}; hy=o.holes||{}; CAPS=o.caps||{}; }catch(e){}
      COVY=c; CLOSEDG=cl; YCOL=yc; HOLEY=hy; TICK++; RAWV++; EXTC.key=null;
      /* sale nuove: di base solo al 1° anno (TC Columbus al 3°), finché tu o un rappresentante non le cambiate */
      const DEF=COV_DEF;
      const miss=Object.keys(DEF).filter(k=>!Array.isArray(COVY[k]));
      if(miss.length&&(OWNER||ADMIN())){ const next={...COVY}; miss.forEach(k=>next[k]=DEF[k]); COVY=next; saveYearsDoc().catch(()=>{}); }
      if(S&&!layer.innerHTML) render(); },()=>{}); };
    watchYear(2); watchCov();
    db.collection("swaps").limit(1000).onSnapshot(qs=>{ for(const k in SWALL) delete SWALL[k];
      for(const doc of qs.docs){ const x=doc.data(); if(x&&x.id&&x.a) SWALL[x.id]=x; }
      filterSW(); consolidate(); autoInvalidate(); if(S&&!layer.innerHTML) render(); }, ()=>{});
    /* claims/<account> = {pid}: ognuno può scrivere solo il proprio; se due account scelgono lo stesso nome vale il primo */
    db.collection("claims").limit(500).onSnapshot(qs=>{ for(const k in CLAIMS) delete CLAIMS[k];
      const list=qs.docs.map(doc=>({u:doc.id,...(doc.data()||{})})).filter(x=>x.pid).sort((a,b)=>(a.at||"").localeCompare(b.at||""));
      for(const x of list) if(!CLAIMS[x.pid]) CLAIMS[x.pid]=x.u; CLAIMDOCS=list;
      syncSubs(list.map(x=>x.u)); recomputeUnav(); syncRoles(); autoYear(); if(S&&!layer.innerHTML) render(); }, ()=>{});
    syncSubs([]);
    db.doc("config/privacy").onSnapshot(sn=>{ const d=(sn.exists&&sn.data())||{}, v=!!d.hideUnav, w=!!d.hideSwaps; if(v===HIDEUNAV&&w===HIDESWAPS) return;
      const ch=v!==HIDEUNAV; HIDEUNAV=v; HIDESWAPS=w; if(ch) recomputeUnav(); if(S&&!layer.innerHTML) render(); },()=>{});
    if(OWNER) db.collection("accessRequests").limit(200).onSnapshot(qs=>{ REQS=qs.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.email).sort((a,b)=>(a.at||"").localeCompare(b.at||"")); 
      const t=document.querySelector('#tabs button[data-tab="imp"]'); if(t) t.textContent=REQS.length?`Impostazioni (${REQS.length})`:"Impostazioni";
      if(REQS.length&&!UI.reqToast){ UI.reqToast=true; toast(REQS.length===1?"Nuova richiesta di accesso in Impostazioni":REQS.length+" richieste di accesso in Impostazioni"); }
      if(S&&!layer.innerHTML&&UI.tab==="imp") render(); },()=>{});
    if(OWNER) db.doc("access/allow").onSnapshot(sn=>{ ALLOW=sn.exists?((sn.data()||{}).emails||[]):[]; if(S&&!layer.innerHTML&&UI.tab==="imp") render(); },()=>{});
  } else {
    let raw=null; try{raw=localStorage.getItem("turni.state"); const u=JSON.parse(localStorage.getItem("turni.unav")||"{}"); Object.assign(UNAV,u);}catch(e){}
    S=load(raw); lastJSON=raw||""; setSync("Salvataggio solo su questo dispositivo"); render();
  }
})();
})();

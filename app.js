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
/* gestori: specializzandi scelti dal proprietario che possono usare tutte le funzioni di gestione */
function ADMIN(){ return OWNER||(!!S&&(S.managers||[]).includes(myPid())); }
const SW={}, SWALL={}, CLAIMS={}; let CLAIMDOCS=[]; let ALLOW=[], lastRoles="", REQS=[];
/* ---------- più anni (opzionale e reversibile) ----------
   l'anno 2 usa i documenti di sempre (config/main, planner/state); gli altri config/yN e planner/yN.
   Si attiva con S.multiYear nel config dell'anno 2: spento, l'app è identica a prima. */
const YEARS=[1,2,3,4], RAW={}; let CURY=2, MULTI=false, RAWV=0, REBUILD=null, YAUTO=false;
function yDocs(y){ return y===2?{cfg:"config/main",mon:"planner/state"}:{cfg:"config/y"+y,mon:"planner/y"+y}; }
const PARSED={};
/* anni che coprono ogni sala: elenco unico per tutti (config/years), lo modificano proprietario e gestori di qualsiasi anno.
   chiave = nome sala normalizzato; senza indicazione la sala è di tutti gli anni */
let COVY={};
function yearsFor(p){ const v=COVY[normRoom(p.name)]; return Array.isArray(v)?v:YEARS; }
function postActive(p){ return !MULTI||yearsFor(p).includes(CURY); }
function yState(y){ if(y===CURY&&S) return S; const r=RAW[y]; if(!r||r.cfg===undefined||r.mon===undefined) return null;
  const key=(r.cfg||"")+"\u0001"+(r.mon||""); if(PARSED[y]&&PARSED[y].key===key) return PARSED[y].st;
  let st=null; try{ const c=r.cfg?JSON.parse(r.cfg):null, m=r.mon?JSON.parse(r.mon):null; if(c) st={...c,months:(m&&m.months)||{}}; }catch(e){}
  PARSED[y]={key,st}; return st; }
function yearOfPid(pid){ for(const y of YEARS){ const st=yState(y); if(st&&(st.residents||[]).some(r=>r.id===pid)) return y; } return null; }
function myAnyPid(){ if(!MYUID) return null; for(const pid in CLAIMS) if(CLAIMS[pid]===MYUID&&(MULTI?yearOfPid(pid):S&&S.residents.some(r=>r.id===pid))) return pid; return null; }
/* cambi: si mostrano solo quelli dell'anno che si sta guardando */
function filterSW(){ for(const k in SW) delete SW[k]; const ids=new Set(S?S.residents.map(r=>r.id):[]);
  for(const k in SWALL){ const x=SWALL[k]; if(!MULTI||ids.has(x.from)||ids.has(x.to)) SW[k]=x; } }
/* cascata: i turni degli anni superiori (4 → 3 → 2 → 1) contano come "coperti da altri anni" per l'anno che si guarda */
const EXTC={key:null,map:{}};
function autoExt(mk,lower){ const out={};
  for(const y of YEARS){ if(lower?y>=CURY:y<=CURY) continue; const st=yState(y); const m2=st&&st.months&&st.months[mk]; if(!m2||!m2.sched) continue;
    const mine={}; S.posts.forEach(p=>mine[normRoom(p.name)]=p); const pmap={}; (st.posts||[]).forEach(p=>pmap[p.id]=mine[normRoom(p.name)]);
    const nm={}; (st.residents||[]).forEach(r=>nm[r.id]=`(${r.year||st.groupYear||y}) ${r.name}`);
    for(const d in m2.sched) for(const k in m2.sched[d]){ const [pid,sh]=k.split("|"), my=pmap[pid]; if(!my||!((my.on||{})[dayType(d)]||[]).includes(sh)) continue;
      (m2.sched[d][k]||[]).forEach(x=>{ if(!x||!nm[x]) return; const kk=d+"|"+my.id+"|"+sh; (out[kk]=out[kk]||[]).push(nm[x]); }); } }
  return out; }
/* anni sotto (generati dopo nella cascata): solo da vedere, non cambiano la generazione */
const LOWC={key:null,map:{}};
function LOWER(mo){ if(!MULTI||!S) return {}; const key=mo.mk+"|"+CURY+"|"+RAWV+"|"+S.posts.map(p=>p.id+":"+p.name).join(",");
  if(LOWC.key!==key){ LOWC.key=key; LOWC.map=autoExt(mo.mk,true); } return LOWC.map; }
function EXT(mo){ const own=mo.ext||{}; if(!MULTI||!S) return own;
  const key=mo.mk+"|"+CURY+"|"+RAWV+"|"+S.posts.map(p=>p.id+":"+p.name).join(",");
  if(EXTC.key!==key){ EXTC.key=key; EXTC.map=autoExt(mo.mk); }
  const auto=EXTC.map; if(!Object.keys(auto).length) return own;
  const out={...auto}; for(const k in own) out[k]=[...(auto[k]||[]),...own[k]]; return out; }
function syncRoles(){ if(!OWNER||!db||!S) return; const uidsOf=st=>[...new Set(((st&&st.managers)||[]).map(p=>CLAIMS[p]).filter(Boolean))].sort();
  const st2=yState(2); if(!st2) return; const doc={uids:uidsOf(st2)};
  if(MULTI){ for(const y of [1,3,4]){ const st=yState(y); if(!st) return; doc["y"+y]=uidsOf(st); } }
  const k=JSON.stringify(doc); if(k===lastRoles) return; lastRoles=k; db.doc("roles/managers").set(doc).catch(()=>{lastRoles="";}); } let MYUID=null, USER=null;
const UNAV={}; /* mk → pid → {data: codice} — un documento per specializzando e mese */
/* preferenze di turno (3° e 4° anno), nello stesso documento delle indisponibilità: mk → pid → {data: "M" | "TC1|M" …} */
const PREF={}; function PR(mk){return PREF[mk]||(PREF[mk]={});}
function canPref(pid){ const r=resOf(pid); return !!r&&yearOfRes(r)>=3; }
function UN(mk){return UNAV[mk]||(UNAV[mk]={});}
const now=new Date();
const UI={tab:"turni", mk:mkOf(now.getFullYear(), now.getMonth()+2), sel:null, view:null, confirm:null};
try{const t=localStorage.getItem("turni.tab"); if(t) UI.tab=t; const me=localStorage.getItem("turni.me"); if(me) UI.sel=me;}catch(e){}

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
function period(mk){ const [y,m]=mk.split("-").map(Number);
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
function rName(r){ const y=r.year||S.groupYear||2; return `(${y}) ${r.name}`; }
function postOf(id){return S.posts.find(p=>p.id===id);}
function isExt(rot){return !rot||S.externals.some(x=>x.id===rot);}
/* chi è fuori sede (es. Bambin Gesù) può essere inserito nei turni dal gestore: conta come jolly */
function incl(mo,pid){ return false; }
/* chi è al Bambin Gesù non entra mai nei turni generati, ma un gestore può assegnarlo a mano */
function isBG(rot){ return rot==="BG"; }
function inGem(mo,pid){ return !isExt(mo.rot[pid])||incl(mo,pid); }
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
/* chi può coprire una postazione: primari, poi jolly */
function covOf(post,s){ return (post.all||[]).includes(s)?"ALL":post.cover; }
function pools(mo,post,s){ const inG=S.residents.filter(r=>inGem(mo,r.id)), cov=covOf(post,s);
  if(cov==="ALL") return {pri:inG,jol:[]};
  return {pri:inG.filter(r=>mo.rot[r.id]===cov), jol:isJolly(cov)?[]:inG.filter(r=>mo.rot[r.id]!==cov&&(isJolly(mo.rot[r.id])||incl(mo,r.id)))}; }

let saveT=null, saving=false, pending=false, lastJSON="";
function setSync(t){document.getElementById("sync").textContent=t;}
const uT={}, uBusy={};
/* ognuno scrive solo nel proprio spazio unav/<suo account>; il gestore scrive anche in unav/staff per chi non ha ancora collegato il nome */
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
  for(const k in keep){ const i=k.indexOf("_"); UN(k.slice(0,i))[k.slice(i+1)]=keep[k]; if(keepP[k]) PR(k.slice(0,i))[k.slice(i+1)]=keepP[k]; } }
function syncSubs(uids){ const want=new Set(["staff",...uids]);
  for(const u of want) if(!SUBS[u]) SUBS[u]=db.collection(`unav/${u}/m`).limit(1000).onSnapshot(qs=>{ SRC[u]={}; for(const doc of qs.docs){ const x=doc.data(); if(x&&x.mk&&x.pid) SRC[u][doc.id]=x; } recomputeUnav(); if(S&&!layer.innerHTML) render(); },()=>{});
  for(const u in SUBS) if(!want.has(u)){ try{SUBS[u]();}catch(e){} delete SUBS[u]; delete SRC[u]; } }
/* associazione account → nome: definitiva per lo specializzando, la cambia solo il proprietario */
function linkPanel(){ const groups=MULTI?YEARS.map(y=>[y,((yState(y)||{}).residents)||[]]).filter(g=>g[1].length):[[null,S.residents]];
  const anyFree=groups.some(g=>g[1].some(r=>!CLAIMS[r.id]));
  return `<div class="panel" style="border:2px solid var(--accent)"><h2>Associa l'account: chi sei?</h2>
   <p style="margin:0;font-size:.9rem">Tocca il tuo cognome e conferma. <strong>La scelta è definitiva</strong>: potrà cambiarla solo chi gestisce il tool. Da quel momento potrai modificare solo le tue indisponibilità e rispondere ai cambi rivolti a te.</p>
   ${groups.map(([gy,list])=>`${gy?`<span class="groupname">${gy}° anno</span>`:""}<div class="pickers">${list.map(r=>{const taken=!!CLAIMS[r.id]; const conf=UI.confirm==="claim-"+r.id;
     return `<button data-act="claim" data-id="${r.id}" ${taken?"disabled":""} ${conf?'style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)"':""}>${conf?"Confermo: sono "+esc(gy?`(${r.year||gy}) ${r.name}`:rName(r)):esc(gy?`(${r.year||gy}) ${r.name}`:rName(r))}${taken?' <span class="cnt">già associato</span>':""}</button>`;}).join("")}</div>`).join("")}
   ${anyFree?"":`<p class="muted" style="margin:0">Tutti i nomi sono già associati: se il tuo è stato preso per errore, avvisa chi gestisce il tool.</p>`}</div>`; }
/* un account = una sola persona: se è già associato (anche in un altro anno) non si sceglie più */
function claimPanel(why){ const pid=myAnyPid(); const mine=CLAIMDOCS.find(x=>x.u===MYUID);
  if(!pid&&mine&&!OWNER) return `<div class="panel" style="border:2px solid var(--bad)"><h2>Associazione da sistemare</h2><p style="margin:0;font-size:.9rem">Il tuo account risulta già associato a un nome (${esc(rNameAny(mine.pid))}) che appartiene a un altro collega o non esiste più. Chiedi al proprietario di scollegarti: poi potrai scegliere il tuo nome.</p></div>`;
  if(!pid) return linkPanel(); const y=MULTI?yearOfPid(pid):null;
  return `<div class="panel"><p style="margin:0;font-size:.9rem">Il tuo account è associato a <strong>${esc(rNameAny(pid))}</strong>${y&&y!==CURY?` del ${y}° anno: qui puoi solo guardare. Per le tue indisponibilità e i tuoi cambi scegli in alto il ${y}° anno.`:"."}</p>${y&&y!==CURY?`<div class="row"><button class="btn primary" data-act="year" data-v="${y}">Vai al ${y}° anno</button></div>`:""}</div>`; }
function rNameAny(pid){ for(const y of YEARS){ const st=yState(y); const r=st&&(st.residents||[]).find(x=>x.id===pid); if(r) return `(${r.year||st.groupYear||y}) ${r.name}`; } return resName(pid); }
function claimPanelOld(why){ return `<div class="panel"><h2>Chi sei?</h2><p class="muted" style="margin:0;font-size:.88rem">${why}</p>
  <div class="pickers">${S.residents.map(r=>{const taken=CLAIMS[r.id]&&CLAIMS[r.id]!==MYUID;return `<button data-act="claim" data-id="${r.id}" ${taken?"disabled":""}>${esc(rName(r))}${taken?' <span class="cnt">già collegato</span>':""}</button>`;}).join("")}</div></div>`; }
function saveUnav(mk,pid){ const k=mk+"_"+pid; if(db&&!canEditUnav(pid,mk)){ toast(unavDenyMsg(pid,mk)); return; } clearTimeout(uT[k]); setSync("Modifiche in corso…");
  uT[k]=setTimeout(async()=>{ delete uT[k];
    if(!db){ try{localStorage.setItem("turni.unav",JSON.stringify(UNAV));}catch(e){} setSync("Salvato su questo dispositivo"); return; }
    if(uBusy[k]){ saveUnav(mk,pid); return; } uBusy[k]=true;
    try{ await unavRef(mk,pid).set({mk,pid,days:UN(mk)[pid]||{},pref:PR(mk)[pid]||{},updated:new Date().toISOString()}); setSync("Salvato"); }
    catch(e){ setSync(e&&e.code==="invalid_argument"?"Non hai i permessi per salvare: chiedi a chi gestisce i turni di invitarti":"Salvataggio non riuscito, riprova"); }
    uBusy[k]=false; },400); }
function persist(){ if(!ADMIN()) return; clearTimeout(saveT); setSync("Modifiche in corso…"); saveT=setTimeout(()=>{saveT=null;flush();},500); }
/* impostazioni del tool (config/main: solo il proprietario) separate dai mesi (planner/state: proprietario e gestori) */
let cfgRef=null, lastCfg="", lastMon="";
function splitS(){ const {months,...cfg}=S; return {cfg:JSON.stringify(cfg), mon:JSON.stringify({months})}; }
async function flush(){
  if(!docRef){ const json=JSON.stringify(S); try{localStorage.setItem("turni.state",json);}catch(e){} setSync("Salvato su questo dispositivo"); return; }
  const {cfg,mon}=splitS(); if(cfg===lastCfg&&mon===lastMon){setSync("Salvato");return;}
  if(saving){pending=true;return;} saving=true;
  try{
    const at=new Date().toISOString();
    if(ADMIN()&&cfg!==lastCfg){ await cfgRef.set({state:cfg,updated:at}); lastCfg=cfg; }
    if(ADMIN()&&mon!==lastMon){ await docRef.set({state:mon,updated:at}); lastMon=mon; }
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
  return st; }

/* ---------- generazione ---------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function newStat(){return {on:{},tot:0,M:0,P:0,D:0,N:0,we:0,wk:{},wn:{},pc:{},last:{}};}
/* abilitazione a notti e guardie: per specializzando (r.nights / r.guards); se non indicata, sì tranne il 1° anno */
function resOf(pid){ return S.residents.find(r=>r.id===pid); }
function yearOfRes(r){ return +(r.year||S.groupYear||2); }
function canDoR(r,s,st){ if(s!=="N"&&s!=="D") return true; const v=s==="N"?r.nights:r.guards; return v===undefined?+(r.year||(st||S).groupYear||2)!==1:!!v; }
function canDo(pid,s){ const r=resOf(pid); return r?canDoR(r,s,S):true; }
/* notti e guardie equilibrate tra gli anni: quota per persona = notti (o guardie) del mese ÷ abilitati presenti di tutti gli anni */
function nightQuota(mk,sh){ if(!MULTI||!hasLowerYear()) return null; const days=period(mk).days; let need=0, people=0, mine=0, union={};
  for(const y of YEARS){ const st=yState(y); if(!st) continue; const rot=(((st.months||{})[mk])||{}).rot||{}, ext=new Set((st.externals||[]).map(x=>x.id));
    const n=(st.residents||[]).filter(r=>rot[r.id]&&!ext.has(rot[r.id])&&canDoR(r,sh,st)).length; people+=n; if(y===CURY) mine=n;
    (st.posts||[]).forEach(p=>{ const k=normRoom(p.name); if(k&&yearsFor(p).includes(y)&&!union[k]) union[k]=p; }); }
  for(const d of days){ const t=dayType(d); for(const k in union) if(((union[k].on||{})[t]||[]).includes(sh)) need++; }
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
   "Genera" e "Aggiorna" scrivono una bozza (mo.draft) che vedono solo i gestori dell'anno; con "Accetta" (tutta o settimana
   per settimana) passa nell'orario pubblicato (mo.sched), che vedono tutti e che passa agli altri anni. Ogni bozza e ogni
   accettazione si salvano nello storico (hist/y<anno>_<mese>/v), leggibile solo dai gestori di quell'anno. */
function hasDraft(mo){ return !!(mo.draft&&mo.draft.sched); }
function draftView(mo){ return ADMIN()&&hasDraft(mo)&&UI.draftView!==false; }
function workSched(mo){ return draftView(mo)?mo.draft.sched:mo.sched; }
/* le modifiche a mano vanno sempre nella bozza (creata dal pubblicato se serve) e la settimana toccata torna da accettare */
function ensureDraft(mo,d){ if(!hasDraft(mo)){ const n=period(mo.mk).days.length/7, acc={}; if(mo.sched) for(let w=0;w<n;w++) acc[w]=true; mo.draft={sched:clone(mo.sched||{}),at:new Date().toISOString(),acc}; }
  if(d&&mo.draft.acc){ const w=Math.floor(period(mo.mk).days.indexOf(d)/7); if(w>=0) delete mo.draft.acc[w]; } UI.draftView=true; return mo.draft.sched; }
function editSched(mo){ return hasDraft(mo)?mo.draft.sched:mo.sched; }
function viewSched(mk){ const mo=M(mk); return draftView(mo)?clone(mo.draft.sched):effSched(mk); }
function histAdd(mk,kind,sched){ if(!db||!sched) return; const by=myPid()?resName(myPid()):(OWNER?"proprietario":"");
  db.collection(`hist/y${CURY}_${mk}/v`).doc().set({mk,kind,by,at:new Date().toISOString(),state:JSON.stringify(sched)}).catch(()=>{}); }
function acceptDraft(mk,weeks){ const mo=M(mk); if(!hasDraft(mo)) return 0; const p=period(mk), n=p.days.length/7; mo.sched=mo.sched||{};
  for(const w of weeks) p.days.slice(w*7,w*7+7).forEach(d=>{ if(mo.draft.sched[d]) mo.sched[d]=clone(mo.draft.sched[d]); });
  mo.draft.acc={...(mo.draft.acc||{})}; weeks.forEach(w=>mo.draft.acc[w]=true); mo.generated=new Date().toISOString();
  const all=Array.from({length:n},(_,w)=>w).every(w=>mo.draft.acc[w]);
  histAdd(mk,weeks.length===n?"Accettata (tutto il mese)":`Accettata: ${weeks.map(w=>"settimana "+(w+1)).join(", ")}`,mo.draft.sched);
  if(all) delete mo.draft; return weeks.length; }
/* equilibrio tra gli anni (con più anni attivo): un anno che ha anni sotto di sé nella cascata si ferma alla quota
   media settimanale per persona (turni da coprire in tutte le sale ÷ specializzandi presenti di tutti gli anni), così il resto va agli anni successivi */
function hasLowerYear(){ return MULTI&&YEARS.some(y=>y<CURY&&(((yState(y)||{}).residents)||[]).length); }
function fairMonth(mk){ if(!MULTI) return null;
  const days=period(mk).days, union={}; let people=0;
  for(const y of YEARS){ const st=yState(y); if(!st) continue; const rot=(((st.months||{})[mk])||{}).rot||{}, ext=new Set((st.externals||[]).map(x=>x.id));
    people+=(st.residents||[]).filter(r=>rot[r.id]&&!ext.has(rot[r.id])).length;
    (st.posts||[]).forEach(p=>{ const k=normRoom(p.name); if(k&&yearsFor(p).includes(y)&&!union[k]) union[k]=p; }); }
  if(!people) return null;
  let demand=0; for(const d of days){ const t=dayType(d); for(const k in union) demand+=((union[k].on||{})[t]||[]).length; }
  return Math.max(1,Math.ceil(demand/people)); }
function generate(mk,wk,only2){ /* only2: Set di pid a cui si possono dare turni nuovi (aggiorna per rotazione) */
  const mo=M(mk), {days}=period(mk), rand=rng(Date.now()%2147483647), only=wk!==undefined&&wk!==null, base=(hasDraft(mo)?mo.draft.sched:mo.sched)||{};
  const sched={}, st={}, slots=[], nDone={N:0,D:0};
  S.residents.forEach(r=>{st[r.id]=newStat();st[r.id].jit=rand();});
  /* notte dell'ultimo giorno del mese precedente: il primo lunedì è smonto */
  { const [y,m]=mk.split("-").map(Number), pk=mkOf(y,m-1); if(S.months[pk]){ const ps=effSched(pk)||{}, last=add(days[0],-1); for(const k in (ps[last]||{})) (ps[last][k]||[]).forEach(pid=>{ if(pid&&st[pid]) st[pid].on[last]=k.split("|")[1]; }); } }
  days.forEach((d,i)=>{ const t=dayType(d), w=Math.floor(i/7);
    if(only&&w!==wk){ sched[d]=clone(base[d]||{});
      slotsOfDay(d).forEach(x=>{ if(!sched[d][x.key]) sched[d][x.key]=[null];
        sched[d][x.key].forEach(pid=>{ const p=pid&&st[pid]; if(!p) return; p.on[d]=x.s; p.tot++; p[x.s]++; p.pc[x.post.id]=(p.pc[x.post.id]||0)+1; p.last[d]=x.post.id;
          if(t!=="fer")p.we++; p.wk[w]=(p.wk[w]||0)+1; if(x.s==="N")p.wn[w]=(p.wn[w]||0)+1; }); });
      return; }
    sched[d]={};
    slotsOfDay(d).forEach(x=>{ if(extCovered(mo,d,x.key)||(multiPost(x.post)&&othersIn(mo,d,x.key)>=ROOM_MAX&&!(mo.fixed||{})[d+"|"+x.key+"|0"])){ sched[d][x.key]=[]; return; }
      sched[d][x.key]=[null]; slots.push({d,i,w,t,post:x.post,s:x.s,key:x.key,ext:extHas(mo,d,x.key)}); }); });
  const pri=x=>x.s==="N"?0:x.s==="D"?1:(x.t!=="fer"?2:3);
  slots.forEach(x=>x.r=rand()); slots.sort((a,b)=>pri(a)-pri(b)||a.i-b.i||a.r-b.r);
  const pick=(sl,cands,cap,forceG,mcap)=>{ let best=null,bk=null; if(mcap===undefined) mcap=mMain;
    for(const r of cands){ if(only2&&!only2.has(r.id)) continue; const p=st[r.id];
      if(sl.s==="N"&&capN&&(p.N>=capN.per||nDone.N>=capN.year)) continue; if(sl.s==="D"&&capD&&(p.D>=capD.per||nDone.D>=capD.year)) continue; if(!ok(mo,p,r.id,sl.d,sl.s,sl.w,cap,forceG)) continue; if(mcap&&p.tot>=mcap) continue;
      const j=p.jit+rand()*0.5;
      const mp=(sl.s==="M"||sl.s==="P")?p[sl.s]-(sl.s==="M"?p.P:p.M):0, pc=p.pc[sl.post.id]||0, same=p.last[sl.d]===undefined&&p.last[add(sl.d,-1)]===sl.post.id?1:0;
      const key= sl.s==="N"?[p.N,p.tot,j] : sl.s==="D"?[p.we,p.tot,j] : sl.t!=="fer"?[p.we,p.tot,mp,pc+same,j] : [p.tot,mp,pc+same,j];
      if(forceG) key.unshift(p.g||0);
      if(!best||cmp(key,bk)<0){best=r;bk=key;} }
    return best; };
  const put=(sl,r,more)=>{ const p=st[r.id]; if(more) sched[sl.d][sl.key].push(r.id); else sched[sl.d][sl.key][0]=r.id; p.on[sl.d]=sl.s; p.tot++; p[sl.s]++; p.pc[sl.post.id]=(p.pc[sl.post.id]||0)+1; p.last[sl.d]=sl.post.id;
    if(sl.t!=="fer")p.we++; p.wk[sl.w]=(p.wk[sl.w]||0)+1; if(sl.s==="N")p.wn[sl.w]=(p.wn[sl.w]||0)+1; if(sl.s==="N"||sl.s==="D") nDone[sl.s]++; };
  /* prima si resta entro i turni ideali (es. 5, con un riposo in settimana), poi si arriva al massimo solo dove serve */
  /* ogni giorno si riempiono per prime le sale/turni finora meno coperti: i buchi si distribuiscono in modo omogeneo */
  /* turni inseriti a mano (fissi): si mettono per primi e il generatore non li tocca */
  const fx=mo.fixed||{};
  slots.forEach(sl=>{ const pre=sl.d+"|"+sl.key+"|", ids=Object.keys(fx).filter(k=>k.startsWith(pre)).sort((a,b)=>+a.split("|").pop()-+b.split("|").pop()).map(k=>fx[k]).filter(pid=>st[pid]);
    ids.forEach((pid,n)=>put(sl,{id:pid},n>0)); });
  /* quota mensile per persona uguale per tutti gli anni: gli anni con anni sotto si fermano lì; le persone in più in TC/RM non la superano mai */
  const capN=nightQuota(mk,"N"), capD=nightQuota(mk,"D");
  const fair=fairMonth(mk), mMain=fair&&hasLowerYear()?fair:null, maxCap=S.maxWeek, soft=S.targetWeek||S.maxWeek, fill={}, byDay=days.map(()=>[]);
  slots.forEach(sl=>byDay[sl.i].push(sl));
  /* preferenze di turno (3° e 4° anno): si provano per prime, rispettando tutte le regole e le quote */
  { const PRF=PR(mk);
    const order=S.residents.filter(r=>PRF[r.id]&&canPref(r.id)&&inGem(mo,r.id)&&(!only2||only2.has(r.id))).sort((a,b)=>st[a.id].jit-st[b.id].jit);
    for(const r of order) for(const d of Object.keys(PRF[r.id]).sort()){ const code=PRF[r.id][d]; if(!code) continue;
      const [pid0,sh]=code.includes("|")?code.split("|"):[null,code];
      const cands=slots.filter(sl=>sl.d===d&&sl.s===sh&&(!pid0||sl.post.id===pid0)&&!sched[d][sl.key][0]).filter(sl=>{ const pl=pools(mo,sl.post,sl.s); return pl.pri.some(x=>x.id===r.id)||pl.jol.some(x=>x.id===r.id); });
      cands.sort((a,b)=>(a.ext-b.ext)||((fill[a.key]||0)-(fill[b.key]||0)));
      for(const sl of cands){ if(pick(sl,[r],maxCap,false,sl.ext?fair:undefined)){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; break; } } } }
  for(const [grp,cap] of [["pri",soft],["jol",soft],["pri",maxCap],["jol",maxCap]])
    for(const pr of [0,1,2,3]) for(const list of ((pr<2&&(capN||capD))?byDay.map(l=>({l,o:rand()})).sort((a,b)=>a.o-b.o).map(x=>x.l):byDay)){
      const todo=list.filter(sl=>pri(sl)===pr&&!sl.ext&&!sched[sl.d][sl.key][0]);
      todo.forEach(sl=>sl.r=rand());
      todo.sort((a,b)=>(fill[a.key]||0)-(fill[b.key]||0)||a.r-b.r);
      for(const sl of todo){ const r=pick(sl,pools(mo,sl.post,sl.s)[grp],cap); if(r){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; } } }
  /* regola prioritaria: chi ha segnato "tutta la giornata" viene inserito lo stesso se il turno resterebbe scoperto
     (ferie, congressi e indisponibilità di singoli turni restano vincolanti); si distribuisce tra chi è stato forzato meno */
  /* TC/RM dove c'è già un altro anno: si coprono dopo, con chi resta entro i turni ideali */
  for(const grp of ["pri","jol"]) for(const list of byDay){
    const todo=list.filter(sl=>sl.ext&&!sched[sl.d][sl.key][0]); todo.forEach(sl=>sl.r=rand()); todo.sort((a,b)=>(fill[a.key]||0)-(fill[b.key]||0)||a.r-b.r);
    for(const sl of todo){ const r=pick(sl,pools(mo,sl.post,sl.s)[grp],soft,false,fair); if(r){ put(sl,r); fill[sl.key]=(fill[sl.key]||0)+1; } } }
  for(const grp of ["pri","jol"]) for(const sl of slots){ if(sl.ext||sched[sl.d][sl.key][0]) continue;
    const r=pick(sl,pools(mo,sl.post,sl.s)[grp],maxCap,true); if(r){ put(sl,r); st[r.id].g=(st[r.id].g||0)+1; } }
  /* chi è in rotazione TC/RM ed è libero (entro i turni ideali) va comunque in TC/RM come persona in più, nella sala meno affollata */
  const ours=(d,k)=>(sched[d][k]||[]).filter(x=>x).length, cnt=(d,k)=>ours(d,k)+othersIn(mo,d,k), Y=curYear();
  byDay.forEach(list=>{ if(!list.length) return; const {d,i,w,t}=list[0]; if(t==="fes") return;
    const people=S.residents.filter(r=>inGem(mo,r.id)&&(!only2||only2.has(r.id))).map(r=>({r,o:rand()})).sort((a,b)=>a.o-b.o).map(x=>x.r);
    for(const r of people){ const rot=mo.rot[r.id], p=st[r.id]; if(fair&&p.tot>=fair) continue;
      const posts=S.posts.filter(x=>multiPost(x)&&x.cover===rot&&postActive(x)); if(!posts.length) continue;
      /* prima le sale vuote, poi le meno affollate; a parità si bilancia mattina/pomeriggio e la sala */
      const opts=[]; for(const sh of ["M","P"]){ if(!ok(mo,p,r.id,d,sh,w,soft)) continue;
        posts.forEach(x=>{ const k=x.id+"|"+sh; if(!(x.on[t]||[]).includes(sh)||!sched[d][k]) return; const c=cnt(d,k), o=ours(d,k);
          if(c>=ROOM_MAX||(o>0&&!sameYearOk(Y))) return; opts.push({post:x,sh,c,o,mp:p[sh]-p[sh==="M"?"P":"M"],pc:p.pc[x.id]||0}); }); }
      if(!opts.length) continue; opts.sort((a,b)=>(a.o>0)-(b.o>0)||a.c-b.c||a.mp-b.mp||a.pc-b.pc);
      const {post,sh}=opts[0], key=post.id+"|"+sh; put({d,i,w,t,post,s:sh,key},r,!!sched[d][key][0]); } });
  const at=new Date().toISOString(); mo.draft={sched,at,acc:{}}; UI.draftView=true; if(only){ mo.weeksGen=mo.weeksGen||{}; mo.weeksGen[wk]=at; }
}
/* ridistribuzione nelle sale della stessa metodica (TC, RM): per ogni giorno e turno, finché una sala ha almeno 2 persone
   più di un'altra si sposta una persona, preferendo i più giovani (1°, poi 2°, 3°, 4° anno). Si spostano solo i turni che
   si possono modificare: dell'anno che si guarda; con più anni attivo, il proprietario anche quelli degli altri anni.
   I turni fissi (inseriti a mano) non si spostano. */
function rebalanceRooms(mk,onlyPids,onlyCover){ const days=period(mk).days, sch={}, posts={}, fixedOf={}, mon={}, Ys=MULTI?YEARS:[CURY];
  for(const y of Ys){ const st=y===CURY?S:yState(y); if(!st) continue; const m=(st.months||{})[mk]; if(!m) continue; const src=(m.draft&&m.draft.sched)||m.sched; if(!src) continue;
    sch[y]=y===CURY?src:JSON.parse(JSON.stringify(src)); fixedOf[y]=m.fixed||{}; mon[y]=st; posts[y]={};
    (st.posts||[]).forEach(p=>{ posts[y][normRoom(p.name)]=p; }); }
  const canMove=y=>y===CURY||(OWNER&&MULTI), yearOf=y=>(y===CURY?curYear():y);
  const groups={}; S.posts.filter(p=>multiPost(p)&&(!onlyCover||p.cover===onlyCover||isJolly(onlyCover))).forEach(p=>{ (groups[p.cover]=groups[p.cover]||[]).push(normRoom(p.name)); });
  const sheetExt=MULTI?{}:(M(mk).ext||{});
  let moved=0; const changed=new Set();
  for(const d of days){ const t=dayType(d); if(t==="fes") continue;
    for(const sh of ["M","P"]) for(const g in groups){
      for(let guard=0;guard<12;guard++){
        const rooms=groups[g].filter(rn=>{ const p=posts[CURY]&&posts[CURY][rn]; return p&&((p.on||{})[t]||[]).includes(sh); }); if(rooms.length<2) break;
        const occ={}, tot={};
        rooms.forEach(rn=>{ occ[rn]=[]; for(const y in sch){ const p=posts[y][rn]; if(!p) continue; const key=p.id+"|"+sh, arr=((sch[y][d]||{})[key])||[];
            arr.forEach((pid,i)=>{ if(pid) occ[rn].push({y:+y,pid,key,i}); }); }
          const pc=posts[CURY][rn]; tot[rn]=occ[rn].length+((sheetExt[d+"|"+pc.id+"|"+sh])||[]).length; });
        const order=[...rooms].sort((a,b)=>tot[b]-tot[a]), A=order[0];
        const targets=[...rooms].sort((a,b)=>tot[a]-tot[b]);
        let done=false;
        for(const B of targets){ if(tot[A]-tot[B]<2) break;
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
  /* per gli altri anni le modifiche diventano una loro bozza: le accettano i loro gestori */
  for(const y of changed){ if(y===CURY||!db) continue; const st=mon[y], months={...(st.months||{})}; months[mk]={...months[mk],draft:{...((months[mk]||{}).draft||{}),sched:sch[y],at:new Date().toISOString(),acc:{}}};
    db.doc(yDocs(y).mon).set({state:JSON.stringify({months}),updated:new Date().toISOString()}).catch(()=>toast("Non riesco a salvare l'orario del "+y+"° anno")); }
  return moved; }
/* aggiorna: i turni già assegnati restano (fissi solo per questa generazione), si tolgono quelli in conflitto con indisponibilità/ferie/congressi e si ricopre il resto */
function refreshSched(mk,rot){ const mo=M(mk), base0=hasDraft(mo)?mo.draft.sched:mo.sched; if(!base0) return {removed:0,added:0,covered:0,moved:0};
  const inRot=rot?new Set(S.residents.filter(r=>mo.rot[r.id]===rot).map(r=>r.id)):null;
  const old=clone(base0), keep={}, fx=mo.fixed||{}; let removed=0, covered=0;
  for(const d in old) for(const k in old[d]) (old[d][k]||[]).forEach((pid,i)=>{ if(!pid) return;
    if(fx[d+"|"+k+"|"+i]===pid||(inRot&&!inRot.has(pid))){ keep[d+"|"+k+"|"+i]=pid; return; }
    if(blocked(unavOf(mo,pid,d),k.split("|")[1])) removed++;
    /* turno ora coperto da un altro anno (DEA, Angio, notti, guardie): si libera e il carico si ridistribuisce */
    else if(extCovered(mo,d,k)) covered++;
    else keep[d+"|"+k+"|"+i]=pid; });
  const saved=mo.fixed, wg=mo.weeksGen; mo.fixed={...keep,...(saved||{})};
  try{ generate(mk,undefined,inRot); } finally { mo.fixed=saved||{}; mo.weeksGen=wg; }
  let added=0; const nw=mo.draft.sched; for(const d in nw) for(const k in nw[d]){ const before=(old[d]||{})[k]||[];
    (nw[d][k]||[]).forEach(pid=>{ if(pid&&!before.includes(pid)) added++; }); }
  const moved=rebalanceRooms(mk,inRot,rot);
  return {removed,added,covered,moved}; }
function derive(mk,override){
  const mo=M(mk), {days}=period(mk), per={}; S.residents.forEach(r=>per[r.id]=newStat());
  const holes=[], issues=[], where={}, SC=override||effSched(mk);
  if(!SC) return {per,holes,issues,where};
  days.forEach((d,i)=>{const w=Math.floor(i/7),t=dayType(d);
    slotsOfDay(d).forEach(({post,s,key})=>{ const arr=(SC[d]||{})[key]||[null];
      if(!arr.some(x=>x)&&!roomCovered(mo,d,key)) holes.push({d,post:post.name,s});
      if(multiPost(post)){ const o=arr.filter(x=>x); if(o.length>1) issues.push(`${post.name} ${SHN[s].toLowerCase()} il ${fmt(d)}: ${o.length} dello stesso anno (${o.map(resName).join(", ")})${sameYearOk(curYear())?"":" — non previsto per questo anno"}`);
        if(o.length+othersIn(mo,d,key)>ROOM_MAX) issues.push(`${post.name} ${SHN[s].toLowerCase()} il ${fmt(d)}: ${o.length+othersIn(mo,d,key)} persone (massimo ${ROOM_MAX})`); }
      arr.forEach(pid=>{ if(!pid) return; const p=per[pid]; if(!p)return;
        if(p.on[d]) issues.push(`${resName(pid)}: ${p.on[d]==="N"||s==="N"?"lavora di giorno il "+fmt(d)+", giorno di monto":"due turni il "+fmt(d)}`);
        p.on[d]=s; where[pid+"|"+d]=post.name; p.pc[post.name]=(p.pc[post.name]||0)+1; p.tot++; p[s]++; if(t!=="fer")p.we++; if(t==="sab")p.sab=(p.sab||0)+1; if(t==="fes")p.fes=(p.fes||0)+1; p.wk[w]=(p.wk[w]||0)+1; if(s==="N")p.wn[w]=(p.wn[w]||0)+1;
        if(!canDo(pid,s)) issues.push(`${resName(pid)}: ${s==="N"?"notte":"guardia"} il ${fmt(d)}, ma non è abilitato/a ${s==="N"?"alle notti":"alle guardie"}`);
        {const u=unavOf(mo,pid,d); if(blocked(u,s)) issues.push(`${resName(pid)}: ${u==="F"?"in ferie":u==="C"?"a congresso":u==="G"?"indisponibile tutto il giorno, inserito perché il turno sarebbe rimasto scoperto,":"indisponibile"} ${fmt(d)} (${SHN[s]})`);}
        const rot=mo.rot[pid];
        if(isExt(rot)&&!isBG(rot)) issues.push(`${resName(pid)}: in turno il ${fmt(d)} ma è ${rot?"a "+rotName(rot):"senza rotazione"}`);
        else if(!isBG(rot)&&covOf(post,s)!=="ALL"&&rot!==covOf(post,s)&&!(isJolly(rot)&&!isJolly(covOf(post,s)))) issues.push(`${resName(pid)}: in ${post.name} il ${fmt(d)} ma la rotazione è ${rotName(rot)}`);
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
function columns(SC,p){ const cols=[]; S.posts.forEach(post=>SH.forEach(s=>{ const k=post.id+"|"+s; if(p.days.some(d=>(SC[d]||{})[k])) cols.push({post,s,k}); })); return cols; }

/* ---------- cambi turno ---------- */
/* orario effettivo = turni generati + cambi accettati non ancora consolidati dal gestore */
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
      if(post){ const cov=covOf(post,s), rot=mo.rot[pid]; if(cov!=="ALL"&&rot!==cov&&!isBG(rot)&&!(isJolly(rot)&&!isJolly(cov))) out.push(`copre ${esc(post.name)} il ${fmt(d)}, fuori dalla sua rotazione (${esc(rotName(rot))})`); } } });
  for(const d in on){ if(on[d].length>1) out.push(on[d].includes("N")?`lavora di giorno il ${fmt(d)}, giorno di monto (ha la notte)`:`doppio turno il ${fmt(d)} (${on[d].map(s=>SHN[s]).join(" + ")})`);
    if(on[d].includes("N")&&on[add(d,1)]) out.push(`lavora il ${fmt(add(d,1))}, giorno di smonto`); }
  for(const w in wk) if(wk[w]>S.maxWeek) out.push(`${wk[w]} turni nella settimana dal ${fmt(period(mk).days[w*7])} (max ${S.maxWeek})`);
  for(const w in wn) if(wn[w]>S.maxNightsWeek) out.push(`${wn[w]} notti nella settimana dal ${fmt(period(mk).days[w*7])} (max ${S.maxNightsWeek})`);
  return out; }
function swapWarnings(mk,x){ const before=effSched(mk); if(!before) return {ok:false};
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
function yearBar(){ if(!MULTI) return ""; return `<div class="pickers" style="margin-bottom:2px">${YEARS.map(y=>`<button data-act="year" data-v="${y}" aria-pressed="${y===CURY}">${y}° anno</button>`).join("")}</div>`; }
function switchYear(y){ if(!db||y===CURY||!REBUILD) return true; if(saveT||saving){ toast("Attendi il salvataggio e riprova"); return false; }
  CURY=y; docRef=db.doc(yDocs(y).mon); cfgRef=db.doc(yDocs(y).cfg); S=null; UI.who=null; UI.sel=null; UI.confirm=null; EXTC.key=null; LOWC.key=null;
  try{ localStorage.setItem("turni.year",String(y)); }catch(e){}
  REBUILD(); if(!S) render(); return true; }
/* all'avvio con più anni: si apre l'anno di chi entra (una volta) */
function autoYear(){ if(!MULTI||YAUTO||!MYUID) return; const pid=Object.keys(CLAIMS).find(p=>CLAIMS[p]===MYUID);
  let y=pid?yearOfPid(pid):null; if(!y){ try{ y=+localStorage.getItem("turni.year")||null; }catch(e){} }
  if(pid&&!y) return; /* dati degli anni non ancora arrivati */
  YAUTO=true; if(y&&YEARS.includes(y)&&y!==CURY) switchYear(y); }
/* nomi per anno ricavati dal foglio "Elenco Spec" (anno accademico 2026/27: (2)→3°, (3)→4°) */
const YSEED={1:[],3:["Alcini","Avenoso","Battistella","Breccia","Capone","De Blasi","De Filippis","Del Prete","Della Valle","Di Certo","Kosta","Marino","Mastrodonato","Monterisi","Pica","Pozzebon","Quarta G.","Quatrale","Seri","Sparagna","Spinilli","Tancredi","Tomassetti","Trogu","Villa"],
  4:["Ariano","Azzaro","Cerquiglini","Chianura","Cigliese","Collura","Corinto","D'Aniello","Di Maio","Ferrari","Fiorillo","Gulotta","Imbemba","Isufi","Lia","Marzano","Morettoni","Napoletano","Parisi","Pentassuglia","Quarta A.","Sama","Villone","Zhang"]};
async function enableYears(){ if(!OWNER||!db||CURY!==2) return; const base=JSON.parse(splitS().cfg);
  for(const y of [1,3,4]){ const snap=await db.doc(yDocs(y).cfg).get(); if(snap.exists) continue;
    const residents=YSEED[y].map(n=>({id:uid(),name:n,year:y})); sortRes(residents);
    const cfg={...base,residents,managers:[],groupYear:y}; delete cfg.multiYear;
    if(y===4) cfg.externals=[...(cfg.externals||[]),{id:"SE",name:"Sede Esterna"}]; if(y===3) cfg.externals=[...(cfg.externals||[]),{id:"IT",name:"Isola Tiberina"}];
    const at=new Date().toISOString();
    await db.doc(yDocs(y).cfg).set({state:JSON.stringify(cfg),updated:at}); await db.doc(yDocs(y).mon).set({state:JSON.stringify({months:{}}),updated:at}); }
  S.multiYear=true; persist(); }
function render(){
  if(!ADMIN()&&(UI.tab==="mese"||UI.tab==="imp")) UI.tab="turni";
  document.querySelectorAll("#tabs button").forEach(b=>{b.setAttribute("aria-selected",b.dataset.tab===UI.tab); b.hidden=!ADMIN()&&(b.dataset.tab==="mese"||b.dataset.tab==="imp");});
  if(!S){app.innerHTML=`<div class="empty">Caricamento dati…</div>`;return;}
  const yLoaded=!MULTI||YEARS.every(y=>yState(y)||(RAW[y]&&RAW[y].cfg===null));
  const needLink=db&&MYUID&&yLoaded&&(MULTI||S.residents.length)&&!myAnyPid();
  if(needLink&&!OWNER){ app.innerHTML=`<section class="view">${claimPanel("")}</section>`; return; }
  app.innerHTML=`<section class="view">${yearBar()}${needLink?linkPanel():""}${({mese:vMese,indisp:vIndisp,turni:vTurni,cambi:vCambi,imp:vImp}[UI.tab]||vMese)()}</section>`;
}
/* mese il cui periodo (primo lunedì → ultima domenica) contiene la data di oggi */
function todayMk(){ const t=new Date(), today=ymd(new Date(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())));
  for(const dm of [0,1,-1]){ const mk=mkOf(t.getFullYear(),t.getMonth()+1+dm), p=period(mk); if(today>=p.first&&today<=p.last) return mk; }
  return mkOf(t.getFullYear(),t.getMonth()+1); }
function monthBar(){ const p=period(UI.mk), tm=todayMk();
  return `<div class="monthbar"><button class="btn icon" data-act="mprev" aria-label="Mese precedente">‹</button>
  <span class="name">${monthName(UI.mk)}</span><button class="btn icon" data-act="mnext" aria-label="Mese successivo">›</button>
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
  if(!OWNER&&me&&!UI.selTouched) UI.sel=me;
  if(!UI.sel||!S.residents.find(r=>r.id===UI.sel)) UI.sel=S.residents[0].id;
  const ro=db&&!canEditUnav(UI.sel), dl=unavDeadline(UI.mk), closed=todayIso()>dl;
  const dlBox=`<div class="${closed?"alerts":"okline"}" style="${closed?"":"font-weight:500;color:var(--muted)"}">${closed?`<strong>Modifiche chiuse</strong><span style="font-size:.86rem">Indisponibilità, ferie e congressi di ${monthName(UI.mk)} si potevano inserire fino a ${fmt(dl,true)}.${ADMIN()?" Tu puoi ancora modificarle, anche per gli altri.":" Per cambiare qualcosa chiedi a chi gestisce i turni."}</span>`:`Puoi inserire o modificare indisponibilità, ferie e congressi di ${monthName(UI.mk)} fino a <strong>${fmt(dl,true)}</strong>.`}</div>`;
  const m=+UI.mk.slice(5);
  const cnt=id=>mode==="R"?Object.entries(PR(UI.mk)[id]||{}).filter(([d,v])=>v&&d>=p.first&&d<=p.last).length:Object.entries(mo.unav[id]||{}).filter(([d,u])=>d>=p.first&&d<=p.last&&(mode==="T"?!(u==="F"||u==="C"):u===mode)).length;
  const MODES=[["T","Indisponibilità turni"],["F","Ferie"],["C","Ferie congresso"],...(S.residents.some(r=>canPref(r.id))?[["R","Preferenze di turno"]]:[])];
  if(mode==="R"&&!canPref(UI.sel)){ const f=S.residents.find(r=>canPref(r.id)&&(r.id===me||ADMIN())); if(f&&!UI.selTouched) UI.sel=f.id; }
  const hint={T:"Tocca un giorno: compaiono i turni previsti quel giorno da segnare come non disponibili.",F:"Tocca i giorni di ferie: si segna l'intera giornata. Tocca di nuovo per togliere.",C:"Tocca i giorni di congresso: si segna l'intera giornata. Tocca di nuovo per togliere.",R:canPref(UI.sel)?"Tocca un giorno e scegli il turno che preferisci (e se vuoi la sala). Il 4° anno viene sistemato per primo, poi il 3°: le preferenze si rispettano se le regole lo permettono; quelle non rispettate vengono segnalate ai gestori.":"Le preferenze di turno sono solo per 3° e 4° anno."}[mode];
  const pr=presence(UI.mk), myRot=mo.rot[UI.sel], lowDays=new Set(pr.filter(x=>x.rot.id===myRot).map(x=>x.d));
  const tot=(id,v)=>Object.entries(mo.unav[id]||{}).filter(([d,u])=>d>=p.first&&d<=p.last&&u===v).length;
  return monthBar()+(otherYear?claimPanel(""):"")+(OWNER||otherYear?"":`<div class="panel" style="gap:4px"><h2>Compila le tue indisponibilità</h2><p class="muted" style="margin:0;font-size:.88rem">Scegli il tuo nome, poi segna i turni in cui non ci sei, le ferie e i congressi. Si salva da solo e tutti vedono le stesse informazioni.</p></div>`)+`
  <div class="pickers" role="tablist">${MODES.map(([k,l])=>`<button data-act="umode" data-v="${k}" aria-pressed="${mode===k}">${l}</button>`).join("")}</div>
  <div class="panel"><span class="label">Specializzando</span>
   <div class="pickers">${S.residents.map(r=>`<button data-act="sel" data-id="${r.id}" aria-pressed="${r.id===UI.sel}">${esc(rName(r))}${cnt(r.id)?`<span class="cnt">${cnt(r.id)}</span>`:""}</button>`).join("")}</div></div>
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
    <div class="row">${!ADMIN()?(mo.generated?`<button class="btn primary" data-act="xlsx">Scarica Excel</button>`:""):(mo.sched||hasDraft(mo))?`<button class="btn primary" data-act="xlsx">Scarica Excel</button>${clrBtn("clrsched","Elimina tutti i turni")}`:""}</div></div>
    ${ADMIN()?(()=>{ const nw=p.days.length/7, cur=UI.genWk??"";
      const filled=w=>p.days.slice(w*7,w*7+7).some(d=>Object.values((workSched(mo)||{})[d]||{}).some(a=>a.some(x=>x)));
      return `<div class="row" style="gap:8px"><label class="row" style="gap:6px"><span class="label">Genera</span><select id="genWk" data-genwk="1"><option value="" ${cur===""?"selected":""}>Tutto il mese</option>${Array.from({length:nw},(_,w)=>`<option value="${w}" ${String(cur)===String(w)?"selected":""}>Settimana ${w+1}: ${fmt(p.days[w*7])} – ${fmt(p.days[w*7+6])}${filled(w)?" ✓":""}</option>`).join("")}</select></label>
       <button class="btn ${UI.confirm==="genwk"?"confirm":""}" data-act="genwk">${UI.confirm==="genwk"?"Tocca di nuovo: sovrascrive questa parte":cur===""?"Genera il mese":"Genera la settimana"}</button></div>
       <p class="muted" style="margin:0;font-size:.82rem">Generando una settimana, le altre restano come sono e vengono considerate per equità, riposi, monto e smonto.</p>
       ${(mo.sched||hasDraft(mo))?`<div class="row" style="gap:8px"><button class="btn ${UI.confirm==="refresh"?"confirm":""}" data-act="refresh">${UI.confirm==="refresh"?"Tocca di nuovo: aggiorna i turni":"Aggiorna l'orario"}</button></div>
       <div class="row" style="gap:8px"><select id="refRot" data-refrot="1" aria-label="Rotazione"><option value="">Rotazione…</option>${S.rotations.map(r=>`<option value="${r.id}" ${UI.refRot===r.id?"selected":""}>${esc(r.name)}</option>`).join("")}</select><button class="btn ${UI.confirm==="refrot"?"confirm":""}" data-act="refrot" ${UI.refRot?"":"disabled"}>${UI.confirm==="refrot"?"Tocca di nuovo: aggiorna la rotazione":"Aggiorna la rotazione"}</button></div>
       <p class="muted" style="margin:0;font-size:.82rem">«Aggiorna la rotazione» fa lo stesso solo per chi è nella rotazione scelta: gli altri non vengono toccati.</p>
       <p class="muted" style="margin:0;font-size:.82rem">Tiene fermi i turni già assegnati; toglie quelli in conflitto con indisponibilità, ferie o congressi e quelli ora coperti da altri anni; poi ridistribuisce: ricopre i turni scoperti dando la precedenza a chi ha meno turni e pareggia le persone tra le sale della stessa metodica (TC, RM), spostando prima i più giovani.</p>`:""}
       <div class="row" style="gap:8px"><button class="btn" data-act="nightlink">Notti e guardie programmate da link</button><label class="btn">Notti e guardie da file<input type="file" id="nightfile" accept=".xlsx,.xls,.csv" hidden></label></div>
       <div class="row" style="gap:8px"><button class="btn" data-act="extlink">Turni degli altri anni da link</button><label class="btn">Turni degli altri anni da file<input type="file" id="extfile" accept=".xlsx,.xls,.csv" hidden></label>${Object.keys(mo.ext||{}).length?`<span class="chip">${Object.keys(mo.ext).length} turni coperti da altri anni</span>${clrBtn("clrext","Rimuovi")}`:""}</div>`; })():""}
    ${noRot.length?`<p class="muted" style="margin:0;font-size:.85rem">Senza rotazione questo mese: ${noRot.map(r=>esc(rName(r))).join(", ")}.</p>`:""}</div>`;
  if(!mo.generated&&!ADMIN()) return head+`<div class="panel empty"><h2>Turni non ancora pubblicati</h2><p>Appena verranno generati li vedrai qui.</p></div>`;
  const nW=p.days.length/7, acc=(mo.draft&&mo.draft.acc)||{};
  const draft=ADMIN()?(hasDraft(mo)?`<div class="panel" style="border:2px solid var(--accent)"><div class="row" style="justify-content:space-between"><h2>Bozza${mo.draft.at?` del ${new Date(mo.draft.at).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"})}`:""}</h2>
      <span class="pickers sm"><button data-act="dview" data-v="1" aria-pressed="${draftView(mo)}">Bozza</button><button data-act="dview" data-v="0" aria-pressed="${!draftView(mo)}">Pubblicato</button></span></div>
     <p class="muted" style="margin:0;font-size:.84rem">La bozza la vedete solo tu e i gestori di quest'anno. Accettandola (tutta o una settimana alla volta) diventa l'orario pubblicato: lo vedono tutti e passa agli altri anni.</p>
     <div class="row" style="gap:6px"><button class="btn ${UI.confirm==="accall"?"confirm":"primary"}" data-act="accall">${UI.confirm==="accall"?"Tocca di nuovo: pubblica":"Accetta tutta la bozza"}</button>
      ${Array.from({length:nW},(_,w)=>acc[w]?`<span class="chip tag-F">Sett. ${w+1} accettata</span>`:`<button class="btn ${UI.confirm==="accw-"+w?"confirm":""}" data-act="accw" data-w="${w}">${UI.confirm==="accw-"+w?"Tocca di nuovo":`Accetta sett. ${w+1} (${fmt(p.days[w*7]).slice(4)})`}</button>`).join("")}
      ${clrBtn("drop","Elimina la bozza")}</div>
     <div class="row"><button class="btn" data-act="hist">Storico bozze</button></div>${histBox(UI.mk)}</div>`
    :`<div class="row"><button class="btn" data-act="hist">Storico bozze</button></div>${histBox(UI.mk)}`):"";
  if(!mo.sched&&!hasDraft(mo)) return head+draft+`<div class="panel empty"><h2>Pronto per generare</h2><p>Controlla rotazioni e indisponibilità, poi scegli sopra se generare tutto il mese o una settimana. Potrai cambiare a mano ogni turno toccandolo.</p><p>Se alcuni turni sono già decisi, inseriscili prima a mano: la generazione non li tocca.</p><button class="btn" data-act="manualstart">Inserisci turni a mano</button></div>`;
  let alerts="";
  let holesBox="";
  if(holes.length&&ADMIN()&&(mo.generated||draftView(mo))){ const g={}; holes.forEach(h=>{const k=fmt(h.d);(g[k]=g[k]||[]).push(`${h.post} ${h.s}`);});
    holesBox=`<div class="alerts bad"><strong>${holes.length} turni scoperti</strong><span style="font-size:.84rem">Non c'è nessuno disponibile entro i limiti. Puoi alzare il massimo settimanale, togliere postazioni oppure coprirli a mano.</span><ul>${Object.entries(g).slice(0,10).map(([k,v])=>`<li>${k}: ${v.join(", ")}</li>`).join("")}${Object.keys(g).length>10?`<li>… e altri ${Object.keys(g).length-10} giorni</li>`:""}</ul></div>`; }
  if(issues.length) alerts+=`<div class="alerts"><strong>Da controllare</strong><ul>${issues.slice(0,15).map(i=>`<li>${esc(i)}</li>`).join("")}</ul></div>`;
  const pr=presence(UI.mk); alerts+=presenceBox(pr);
  if(ADMIN()&&(mo.generated||draftView(mo))&&!holes.length&&!issues.length&&!pr.length) alerts=`<div class="okline">Tutte le postazioni coperte, nessun conflitto.</div>`;
  const tabs=`<div class="pickers"><button data-act="view" data-v="nome" aria-pressed="${UI.view==="nome"}">Per nome</button><button data-act="view" data-v="giorni" aria-pressed="${UI.view==="giorni"}">Per giorno</button><button data-act="view" data-v="persone" aria-pressed="${UI.view==="persone"}">Per specializzando</button><button data-act="view" data-v="conti" aria-pressed="${UI.view==="conti"}">Conteggi</button></div>`;
  let body="";
  const people=S.residents.filter(r=>inGem(mo,r.id)||(SC&&shiftsOf(SC,r.id).length));
  if(UI.view==="giorni"){
    /* filtro per metodica: sale della rotazione (solo mattina/pomeriggio) oppure notti e guardie */
    const F=UI.filt||"", cols=columns(SC,p).filter(c=>!F||(F==="NG"?(c.s==="N"||c.s==="D"):(c.post.cover===F&&(c.s==="M"||c.s==="P")))), used=S.posts.filter(x=>cols.some(c=>c.post===x));
    body=`<div class="pickers sm" style="margin-bottom:6px"><button data-act="filt" data-v="" aria-pressed="${!F}">Tutte</button>${S.rotations.filter(r=>S.posts.some(x=>x.cover===r.id)).map(r=>`<button data-act="filt" data-v="${r.id}" aria-pressed="${F===r.id}">${esc(r.name)}</button>`).join("")}<button data-act="filt" data-v="NG" aria-pressed="${F==="NG"}">Notti e guardie</button></div>`;
    body+=`<div class="scroll"><table class="grid"><thead><tr><th class="sticky" rowspan="2">Giorno</th>${used.map(x=>`<th class="roomh" colspan="${cols.filter(c=>c.post===x).length}">${esc(x.name)}</th>`).join("")}</tr>
     <tr>${cols.map(c=>`<th><span class="chip sh-${c.s}">${c.s} ${esc(S.hours[c.s])}</span></th>`).join("")}</tr></thead><tbody>
     ${p.days.map((d,i)=>{const t=dayType(d);return `<tr class="${t==="sab"?"we":""} ${t==="fes"?"fes":""} ${i%7===0&&i?"weekstart":""}"><td class="date sticky">${fmt(d)}</td>${cols.map(c=>{const arr=(SC[d]||{})[c.k];
       if(!arr) return `<td class="cell none">·</td>`;
       const ex=EXT(mo)[d+"|"+c.k], lw=LOWER(mo)[d+"|"+c.k], exh=(ex?`<span class="muted" style="font-size:.72rem;display:block">${ex.map(esc).join("<br>")}</span>`:"")+(lw?`<span class="muted" style="font-size:.72rem;display:block;font-style:italic">${lw.map(esc).join("<br>")}</span>`:"");
       if(!arr.length) return `<td class="cell" ${ADMIN()?`data-act="cell" data-d="${d}" data-k="${c.k}"`:`style="cursor:default"`} title="Coperto da altri anni">${exh||`<span class="muted">—</span>`}</td>`;
       return `<td class="cell ${SWMARK[UI.mk]&&SWMARK[UI.mk].has(d+"|"+c.k)?"swapped":""}" ${ADMIN()?`data-act="cell"`:`style="cursor:default"`} data-d="${d}" data-k="${c.k}">${arr.map((pid,ai)=>pid?`<span class="who">${esc(resName(pid))}</span>${ADMIN()&&(mo.fixed||{})[d+"|"+c.k+"|"+ai]===pid?`<span class="muted" style="font-size:.7rem;display:block">fisso</span>`:""}`:(ex||lw&&multiPost(c.post)||arr.some(v=>v)?"":`<span class="hole">scoperto</span>`)).join("")}${exh}</td>`;}).join("")}</tr>`;}).join("")}</tbody></table></div>`;
  } else if(UI.view==="nome"){
    if(!UI.who) UI.who=myPid()||"";
    const pid=UI.who, rows=[];
    if(pid) p.days.forEach(d=>{ const c=code(mo,per,pid,d), sh=shiftsOf({[d]:SC[d]||{}},pid);
      if(sh.length) sh.forEach(x=>{ const [postId,s]=x.k.split("|"), post=postOf(postId); rows.push({d,s,txt:`${post?esc(post.name):""}`,h:S.hours[s],sw:SWMARK[UI.mk]&&SWMARK[UI.mk].has(d+"|"+x.k)}); });
      else if(c==="S") rows.push({d,s:"S"}); else if(c==="F"||c==="C"||c==="X") rows.push({d,s:c}); });
    const x=pid?per[pid]:null;
    const lab={M:"Mattina",P:"Pomeriggio",N:"Notte",D:"Guardia",S:"Smonto",F:"Ferie",C:"Ferie congresso",X:"Indisponibile"};
    const cls={M:"sh-M",P:"sh-P",N:"sh-N",D:"sh-D",S:"",F:"tag-F",C:"tag-C",X:""};
    body=`<div class="panel"><label class="stack" style="gap:4px"><span class="label">Nome</span><select id="whoSel" data-who="1"><option value="">Scegli…</option>${S.residents.map(r=>`<option value="${r.id}" ${pid===r.id?"selected":""}>${esc(rName(r))}</option>`).join("")}</select></label>
     ${pid?`<div class="row" style="gap:6px"><span class="chip">${esc(rotName(mo.rot[pid]))}</span><span class="chip">${x.tot} turni</span><span class="chip sh-M">${x.M} M</span><span class="chip sh-P">${x.P} P</span><span class="chip sh-N">${x.N} N</span><span class="chip sh-D">${x.D} G</span><span class="chip">${x.sab||0} sabati</span><span class="chip">${x.fes||0} dom/festivi</span></div>`:""}</div>
     ${pid?(rows.length?`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Giorno</th><th>Turno</th><th>Sala</th><th>Orario</th></tr></thead><tbody>${rows.map(r=>`<tr class="${dayType(r.d)==="sab"?"we":""} ${dayType(r.d)==="fes"?"fes":""}"><td class="date sticky">${fmt(r.d)}</td><td><span class="chip ${cls[r.s]}">${lab[r.s]}</span>${r.s==="N"?' <span class="muted" style="font-size:.78rem">monto</span>':""}${r.sw?' <span style="color:var(--accent);font-weight:700">↔</span>':""}</td><td>${r.txt||""}</td><td class="num">${r.h?esc(r.h):""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="panel empty"><p>Nessun turno per ${esc(resName(pid))} in questo mese.</p></div>`):`<div class="panel empty"><p>Scegli un nome per vedere solo i suoi turni.</p></div>`}`;
  } else if(UI.view==="persone"){
    body=`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Specializzando</th>${p.days.map(d=>`<th class="code" style="${dayType(d)==="fes"?"color:var(--bad)":dayType(d)==="sab"?"color:var(--accent)":""}">${DOW[isoDow(d)][0]}<br>${+d.slice(8)}</th>`).join("")}</tr></thead><tbody>
     ${people.map(r=>`<tr><td class="sticky"><span class="name-strong">${esc(rName(r))}</span><br><span class="muted" style="font-size:.75rem">${esc(rotName(mo.rot[r.id]))}</span></td>${p.days.map(d=>{const c=code(mo,per,r.id,d);return c==="N"?`<td class="code monto"><div class="mn"><span class="mt">monto</span><span class="nt">Notte</span></div></td>`:`<td class="code ${c}">${label(c,where[r.id+"|"+d])}</td>`;}).join("")}</tr>`).join("")}</tbody></table></div>
     <div class="legend"><span><span class="chip sh-M">Mattina</span></span><span><span class="chip sh-P">Pomeriggio</span></span><span><span class="chip sh-N">Notte</span></span><span><span class="chip sh-D">Guardia dom/festivi</span></span><span><span class="chip tag-F">Ferie</span></span><span><span class="chip tag-C">Congresso</span></span><span>monto = giorno della notte, non si lavora di giorno · smonto = giorno dopo, non si lavora</span><span>✕ = indisponibile</span><span>G = guardia domenica</span></div>`;
  } else {
    body=`<div class="scroll"><table class="grid"><thead><tr><th class="sticky">Specializzando</th><th>Rotazione</th><th>Totale</th><th>Mattine</th><th>Pomeriggi</th><th>Guardie</th><th>Notti</th><th>Sabati</th><th>Dom/festivi</th><th>Max/sett.</th><th>Sett. oltre ${S.targetWeek}</th><th>Sale</th></tr></thead><tbody>
     ${people.map(r=>{const x=per[r.id];return `<tr><td class="sticky name-strong">${esc(rName(r))}</td><td>${esc(rotName(mo.rot[r.id]))}</td><td class="num">${x.tot}</td><td class="num">${x.M}</td><td class="num">${x.P}</td><td class="num">${x.D}</td><td class="num">${x.N}</td><td class="num">${x.sab||0}</td><td class="num">${x.fes||0}</td><td class="num">${Math.max(0,...Object.values(x.wk))}</td><td class="num">${Object.values(x.wk).filter(v=>v>S.targetWeek).length||""}</td><td style="white-space:nowrap;font-size:.78rem">${Object.entries(x.pc).sort((a,b)=>a[0].localeCompare(b[0],"it",{numeric:true})).map(([k,v])=>`${esc(k)} ${v}`).join(" · ")}</td></tr>`;}).join("")}</tbody></table></div>`;
  }
  if(UI.view==="conti"){ const cov={}; p.days.forEach(d=>{ for(const k in (SC[d]||{})){ const c=cov[k]||(cov[k]={f:0,n:0}); (SC[d][k]||[]).forEach(x=>{c.n++; if(x)c.f++;}); } });
    const shown=S.posts.filter(x=>SH.some(s=>cov[x.id+"|"+s]));
    const pct=c=>c?`${Math.round(c.f/c.n*100)}% <span class="muted">(${c.f}/${c.n})</span>`:"";
    body+=`<h3 style="margin-top:6px">Copertura per sala</h3><div class="scroll"><table class="grid"><thead><tr><th class="sticky">Sala</th>${SH.map(s=>`<th><span class="chip sh-${s}">${SHN[s]}</span></th>`).join("")}</tr></thead><tbody>${shown.map(x=>`<tr><td class="sticky name-strong">${esc(x.name)}</td>${SH.map(s=>`<td class="num">${pct(cov[x.id+"|"+s])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; }
  return head+draft+alerts+tabs+body+holesBox;
}
function code(mo,per,pid,d){ const p=per[pid]; if(p&&p.on[d]) return p.on[d]; if(p&&p.on[add(d,-1)]==="N") return "S"; const u=unavOf(mo,pid,d); return u==="G"?"X":u==="F"?"F":u==="C"?"C":""; }
function label(c,postName){ if(c==="S")return "smonto"; if(c==="X")return "✕"; if(c==="F")return "ferie"; if(c==="C")return "congr."; if(c==="D")return "G"; if(c==="N")return "monto"; if(c)return esc(postName||"")+" "+c; return ""; }

function vImp(){
  const covOpts=[...S.rotations.map(r=>[r.id,r.name]),["ALL","Tutti"]];
  const groups=[]; S.posts.forEach(p=>{ const g=p.cover; if(!groups.includes(g)) groups.push(g); });
  const mg=S.managers||[];
  const mgPanel=`<div class="panel"><h2>Gestori</h2>
   <p class="muted" style="margin:0;font-size:.85rem">${OWNER?"I gestori possono usare tutte le funzioni come te: rotazioni, impostazioni, generazione e modifica dei turni, cambi manuali e cambi da inserire. Non possono modificare le indisponibilità degli altri, scegliere i gestori o scollegare gli account. Si possono scegliere solo specializzandi che hanno già collegato il nome.":"Questo elenco lo modifica solo il proprietario del tool."}</p>
   <div class="pickers">${S.residents.filter(r=>CLAIMS[r.id]||mg.includes(r.id)).map(r=>`<button ${OWNER?`data-act="mgr" data-id="${r.id}"`:"disabled"} aria-pressed="${mg.includes(r.id)}">${esc(rName(r))}</button>`).join("")||`<span class="muted">Nessuno ha ancora collegato il nome.</span>`}</div></div>`;
  const reqPanel=OWNER&&REQS.length?`<div class="panel" style="border:2px solid var(--accent)"><h2>Richieste di accesso <span class="chip">${REQS.length}</span></h2>
   <div class="list">${REQS.map(r=>`<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(r.email)}</span><span class="muted" style="font-size:.78rem">${new Date(r.at).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"})}</span></span><span class="row" style="gap:6px"><button class="btn primary" data-act="reqok" data-id="${esc(r.id)}">Approva</button><button class="btn danger" data-act="reqno" data-id="${esc(r.id)}">Rifiuta</button></span></div>`).join("")}</div></div>`:"";
  const allowPanel=OWNER?`<div class="panel"><h2>Email autorizzate</h2><p class="muted" style="margin:0;font-size:.85rem">Solo queste email possono entrare nell'app (tu entri sempre). Una per riga. Dopo averle salvate, manda il link ai colleghi: si registrano con la stessa email e una password a scelta.</p>
   <textarea id="allowtxt" rows="6" style="width:100%;font:.88rem var(--f-mono);color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px">${esc(ALLOW.join("\n"))}</textarea>
   <div class="row"><button class="btn primary" data-act="allowsave">Salva elenco</button><span class="muted" style="font-size:.85rem">${ALLOW.length} email autorizzate</span></div></div>`:"";
  const importPanel=OWNER?`<div class="panel"><h2>Importa dati</h2><p class="muted" style="margin:0;font-size:.85rem">Carica il file di esportazione dal vecchio tool (.json): sostituisce impostazioni e turni e aggiunge indisponibilità e cambi. I collegamenti nome-account vanno rifatti.</p>
   <input type="file" id="impfile" accept=".json,application/json"></div>`:"";
  const yearsPanel=OWNER&&db&&CURY===2?`<div class="panel"><h2>Più anni</h2><p class="muted" style="margin:0;font-size:.85rem">${S.multiYear?"Attivo: in alto scegli l'anno. Ogni anno ha nomi, sale, rotazioni e gestori propri (si impostano qui, scegliendo l'anno). Si genera a cascata: prima il 4°, poi il 3° vede i turni del 4° come già coperti, e così via. Disattivando, l'app torna com'era: i dati degli altri anni restano salvati e ricompaiono se lo riattivi.":"Aggiunge 1°, 3° e 4° anno, ognuno con i propri dati. I vostri dati (2° anno) non vengono toccati e disattivando si torna esattamente a come è ora. Nomi presi da «Elenco Spec»: (2)→3° anno, (3)→4° anno; il 1° anno è vuoto."}</p>
   <div class="row"><button class="btn ${UI.confirm==="years"?"confirm":S.multiYear?"danger":"primary"}" data-act="years">${UI.confirm==="years"?"Tocca di nuovo per confermare":S.multiYear?"Disattiva più anni":"Attiva più anni"}</button></div></div>`:"";
  const covPanel=MULTI&&ADMIN()?(()=>{ const rows=[], seen=new Set();
    YEARS.forEach(y=>((yState(y)||{}).posts||[]).forEach(p=>{ const k=normRoom(p.name); if(!k||seen.has(k)) return; seen.add(k); rows.push({k,name:p.name,p}); }));
    return `<div class="panel"><h2>Anni che coprono ogni sala</h2><p class="muted" style="margin:0;font-size:.85rem">Elenco unico per tutti gli anni: lo modificate tu e i gestori di qualsiasi anno. Un anno genera turni solo nelle sale dove è segnato. Vale per le sale con lo stesso nome in tutti gli anni.</p>
     <div class="list">${rows.map(r=>{ const ys=yearsFor(r.p); return `<div class="item"><span class="name-strong">${esc(r.name)}</span><span class="pickers sm">${YEARS.map(y=>`<button data-act="covy" data-k="${esc(r.k)}" data-y="${y}" aria-pressed="${ys.includes(y)}">${y}°</button>`).join("")}</span></div>`; }).join("")}</div></div>`; })():"";
  return reqPanel+yearsPanel+covPanel+mgPanel+allowPanel+linkedPanel()+importPanel+`
  <div class="panel"><h2>Specializzandi</h2>
   <form class="row" id="addform"><input id="newname" placeholder="Cognome Nome" style="flex:1 1 12em" autocomplete="off"><select id="newyear" aria-label="Anno">${[1,2,3,4].map(y=>`<option ${y===2?"selected":""}>${y}° anno</option>`).join("")}</select><button class="btn primary" type="submit">Aggiungi</button></form>
   <div class="list">${S.residents.map(r=>`<div class="item"><input id="rname-${r.id}" data-rname="${r.id}" value="${esc(r.name)}" aria-label="Nome" style="font-weight:600;width:100%"><span class="pickers sm" style="flex:none"><button data-act="rflag" data-id="${r.id}" data-f="nights" aria-pressed="${canDo(r.id,"N")}">Notti</button><button data-act="rflag" data-id="${r.id}" data-f="guards" aria-pressed="${canDo(r.id,"D")}">Guardie</button></span><button class="btn danger ${UI.confirm==="del-"+r.id?"confirm":""}" data-act="del" data-id="${r.id}">${UI.confirm==="del-"+r.id?"Conferma":"Rimuovi"}</button></div>`).join("")||`<p class="muted" style="margin:0">Ancora nessuno.</p>`}</div></div>
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>Postazioni da coprire</h2><button class="btn" data-act="addpost">Aggiungi postazione</button></div>
   <p class="muted" style="margin:0;font-size:.85rem">Una persona per turno. "Dom/festivi" comprende anche i festivi infrasettimanali.</p>
   ${S.posts.map(p=>`<div class="post">
     <div class="top"><input id="pname-${p.id}" data-pname="${p.id}" value="${esc(p.name)}" aria-label="Nome postazione">
      <select id="pcov-${p.id}" data-pcov="${p.id}" aria-label="Chi la copre">${covOpts.map(([v,l])=>`<option value="${v}" ${p.cover===v?"selected":""}>${v==="ALL"?"Tutti":"Rotazione "+esc(l)}</option>`).join("")}</select>
      <button class="btn danger ${UI.confirm==="delp-"+p.id?"confirm":""}" data-act="delpost" data-id="${p.id}">${UI.confirm==="delp-"+p.id?"Conferma":"Togli"}</button></div>
     <div class="row" style="gap:8px"><span style="font-size:.82rem;width:6.5em">Coperti da tutti</span><div class="pickers sm">${SH.map(s=>`<button data-act="pall" data-id="${p.id}" data-v="${s}" aria-pressed="${(p.all||[]).includes(s)}">${SHN[s]}</button>`).join("")}</div></div>
     <div class="stack" style="gap:6px">${DT.map(([t,l])=>`<div class="row" style="gap:8px"><span style="font-size:.82rem;width:6.5em">${l}</span><div class="pickers sm">${SH.map(s=>`<button data-act="pon" data-id="${p.id}" data-t="${t}" data-v="${s}" aria-pressed="${(p.on[t]||[]).includes(s)}">${SHN[s]}</button>`).join("")}</div></div>`).join("")}</div>
   </div>`).join("")}</div>
  <div class="panel"><h2>Rotazioni jolly</h2><p class="muted" style="margin:0;font-size:.85rem">Chi è in queste rotazioni copre le sale delle altre rotazioni (non jolly) quando chi è in rotazione non basta.</p>
   <div class="pickers">${S.rotations.map(r=>`<button data-act="jolly" data-id="${r.id}" aria-pressed="${!!r.jolly}">${esc(r.name)}</button>`).join("")}</div></div>
  <div class="panel"><h2>Orari e limiti</h2>
   <div class="row">${SH.map(s=>`<label class="row" style="gap:6px"><span class="chip sh-${s}">${SHN[s]}</span><input id="hour-${s}" data-hour="${s}" value="${esc(S.hours[s])}" style="width:6.5em"></label>`).join("")}</div>
   <div class="row"><label class="row" style="gap:8px">Turni ideali a settimana <input type="number" min="1" max="14" id="targetweek" data-lim="targetWeek" value="${S.targetWeek}"></label><label class="row" style="gap:8px">Turni max a settimana <input type="number" min="1" max="14" id="maxweek" data-lim="maxWeek" value="${S.maxWeek}"></label>
   <label class="row" style="gap:8px">Presenza minima per rotazione (%) <input type="number" min="0" max="100" id="minpres" data-lim="minPresence" value="${S.minPresence}"></label>
   <label class="row" style="gap:8px">Notti max a settimana <input type="number" min="0" max="7" id="maxn" data-lim="maxNightsWeek" value="${S.maxNightsWeek}"></label></div>
   <p class="muted" style="margin:0;font-size:.85rem">Regole fisse: un solo turno al giorno, mai due turni consecutivi; il giorno della notte è il monto e il giorno dopo è lo smonto: in nessuno dei due si lavora di giorno. Il tool resta entro i turni ideali (così chi lavora il sabato ha un riposo in settimana) e arriva al massimo solo per coprire i buchi. Le settimane vanno da lunedì a domenica. La presenza minima si controlla da lunedì a sabato e conta come assenti solo ferie e congressi.</p></div>`;
}


function vCambi(){ if(!S.residents.length) return monthBar()+noRes();
  const mk=UI.mk, mo=M(mk), SC=effSched(mk), me=myPid(), all=swapsOf(mk);
  let h=monthBar();
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
      const F=UI.sw=UI.sw||{}; const mine=shiftsOf(SC,me);
      if(F.a&&!mine.some(x=>x.d+"#"+x.k===F.a)) F.a="";
      const others=S.residents.filter(r=>r.id!==me&&inGem(mo,r.id));
      const theirs=F.to?shiftsOf(SC,F.to):[];
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
      h+=`<div class="panel"><h2>Chiedi un cambio</h2>
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
  const done=all.filter(x=>x.status!=="pending").reverse();
  h+=`<div class="panel"><h2>Storico cambi di ${monthName(mk)}</h2>${done.length?`<div class="stack" style="gap:8px">${done.map(x=>swCard(x,false,false,ADMIN()&&(x.status!=="accepted"||x.applied))).join("")}</div>`:`<p class="muted" style="margin:0">Nessun cambio per ora.</p>`}</div>`;
  return h; }
function linkedPanel(){ let h=""; if(OWNER){ const bad=CLAIMDOCS.filter(x=>CLAIMS[x.pid]!==x.u||!(MULTI?yearOfPid(x.pid):S.residents.some(r=>r.id===x.pid)));
    if(bad.length) h+=`<div class="panel" style="border:2px solid var(--bad)"><h2>Associazioni da sistemare</h2><p class="muted" style="margin:0;font-size:.85rem">Account associati a un nome già preso da un altro account o a un nome che non esiste più. Scollegali: potranno scegliere di nuovo il proprio nome.</p>
      <div class="list">${bad.map(x=>`<div class="item"><span class="stack" style="gap:2px"><span class="name-strong">${esc(x.email||("account "+x.u.slice(0,6)+"…"))}</span><span class="muted" style="font-size:.8rem">scelto: ${esc(rNameAny(x.pid))}${CLAIMS[x.pid]&&CLAIMS[x.pid]!==x.u?" · già preso da un altro account":" · nome inesistente"}</span></span><button class="btn danger ${UI.confirm==="unlu-"+x.u?"confirm":""}" data-act="unlinku" data-u="${x.u}">${UI.confirm==="unlu-"+x.u?"Conferma":"Scollega"}</button></div>`).join("")}</div></div>`; const linked=S.residents.filter(r=>CLAIMS[r.id]);
    h+=`<div class="panel"><h2>Account collegati</h2><p class="muted" style="margin:0;font-size:.85rem">${linked.length} su ${S.residents.length}. Se qualcuno ha toccato il nome sbagliato, scollegalo.</p>${linked.length?`<div class="list">${linked.map(r=>`<div class="item"><span class="name-strong">${esc(rName(r))}</span><button class="btn danger ${UI.confirm==="unl-"+r.id?"confirm":""}" data-act="unlink" data-id="${r.id}">${UI.confirm==="unl-"+r.id?"Conferma":"Scollega"}</button></div>`).join("")}</div>`:""}</div>`; } return h; }
function warnBox(w,me,other){ return `<div class="alerts"><strong>Il cambio forza queste regole</strong><ul>${w.from.map(t=>`<li><strong>per te</strong>: ${t}</li>`).join("")}${w.to.map(t=>`<li><strong>per ${esc(resName(other))}</strong>: ${t}</li>`).join("")}</ul><span style="font-size:.85rem">${esc(resName(other))} vedrà questo avviso e dovrà confermarlo.</span></div>`; }
/* cambio inserito direttamente da un gestore: niente richiesta, si applica subito e finisce nello storico e nei cambi da inserire */
function manualPanel(mk,SC,mo){ const F=UI.msw=UI.msw||{}; const inG=S.residents.filter(r=>inGem(mo,r.id));
  const shA=F.from?shiftsOf(SC,F.from):[]; const inG2=S.residents.filter(r=>inGem(mo,r.id)||(isBG(mo.rot[r.id])&&shiftsOf(SC,r.id).length)); if(F.a&&!shA.some(x=>x.d+"#"+x.k===F.a)) F.a="";
  const shB=F.to?shiftsOf(SC,F.to):[];
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
  return `<div class="panel"><h2>Inserisci un cambio manuale</h2><p class="muted" style="margin:0;font-size:.85rem">Solo per i gestori: il cambio si applica subito, senza chiedere conferma agli specializzandi, e compare nello storico e nei cambi da inserire.</p>
   <label class="stack" style="gap:4px"><span class="label">Chi cede</span>${sel("mswFrom","from",inG2.map(r=>[r.id,esc(rName(r))]),F.from,"Scegli…")}</label>
   <label class="stack" style="gap:4px"><span class="label">Il turno che cede</span>${sel("mswA","a",shA.map(x=>[x.d+"#"+x.k,slotLabel(x)]),F.a,"Scegli…",!F.from)}</label>
   <label class="stack" style="gap:4px"><span class="label">A chi</span>${sel("mswTo","to",S.residents.filter(r=>r.id!==F.from&&(inGem(mo,r.id)||isBG(mo.rot[r.id]))).map(r=>[r.id,esc(rName(r))+(isBG(mo.rot[r.id])?" · Bambin Gesù":"")]),F.to,"Scegli…")}</label>
   <label class="stack" style="gap:4px"><span class="label">In cambio prende</span>${sel("mswB","b",shB.map(x=>[x.d+"#"+x.k,slotLabel(x)]),F.b,"Niente: cessione del turno",!F.to)}</label>
   ${links?`<span class="label">Turni collegati alla notte</span>${links}`:""}${prev}
   <div class="row"><button class="btn primary ${UI.confirm==="mswgo"?"confirm":""}" data-act="mswgo" ${ok?"":"disabled"}>${UI.confirm==="mswgo"?"Tocca di nuovo per applicare":"Applica il cambio"}</button></div></div>`; }
function swCard(x,inbox,mineOut,canDel){ const st={pending:["In attesa","chip"],accepted:[x.manual?"Inserito":"Accettato","chip tag-F"],rejected:["Rifiutato","chip"],cancelled:["Annullato","chip"],invalid:["Non più valido","chip"]}[x.status]||["?","chip"];
  const txt=`<strong>${esc(resName(x.from))}</strong> cede <span class="name-strong">${slotLabel(x.a)}</span> a <strong>${esc(resName(x.to))}</strong>${x.b?` e prende <span class="name-strong">${slotLabel(x.b)}</span>`:" senza nulla in cambio"}${(x.extra||[]).map(e=>`<br><span style="font-size:.85rem">+ ${slotLabel(e)} passa da ${esc(resName(e.giver))} a ${esc(resName(e.taker))} (monto/smonto)</span>`).join("")}`;
  const manual=x.manual?`<span class="muted" style="font-size:.8rem">Inserito dal gestore${x.by&&x.by!=="owner"?" "+esc(resName(x.by)):""}${x.reason?" · per "+esc(x.reason):""}</span>`:(x.reason?`<span class="muted" style="font-size:.8rem">Proposto dal gestore per ${esc(x.reason)} di ${esc(resName(x.from))}</span>`:"");
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
    if(!effSched(x.mk)) continue; const w=swapWarnings(x.mk,x); if(w.ok) continue;
    INVAL.add(x.id); swWrite({...x,status:"invalid",decided:new Date().toISOString(),reason:"annullata: uno dei turni nel frattempo è cambiato"}); } }
function answerSheet(id){ const x=SW[id], me=myPid(); if(!x) return;
  const w=swapWarnings(x.mk,x); UI.swRole="to";
  if(!w.ok&&effSched(x.mk)){ if(!INVAL.has(x.id)){ INVAL.add(x.id); swWrite({...x,status:"invalid",decided:new Date().toISOString(),reason:"annullata: uno dei turni nel frattempo è cambiato"}); }
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
function multiPost(p){ return !!p&&(p.cover==="TC"||p.cover==="RM"); }
function extCovered(mo,d,key){ return !!EXT(mo)[d+"|"+key] && !multiPost(postOf(key.split("|")[0])) && !(mo.fixed||{})[d+"|"+key+"|0"]; }
const EXT_MAN="Altri anni (inserito a mano)";
function extHas(mo,d,key){ return !!EXT(mo)[d+"|"+key]; }
/* sale TC/RM: al massimo 3 persone in tutto (anni diversi); stesso anno insieme solo per 2° e 3° anno, segnalato */
const ROOM_MAX=3;
function curYear(){ return +(S.groupYear||2); }
function sameYearOk(y){ return y===2||y===3; }
function othersIn(mo,d,key){ return (EXT(mo)[d+"|"+key]||[]).length+(LOWER(mo)[d+"|"+key]||[]).length; }
function roomCovered(mo,d,key){ return extHas(mo,d,key)||(multiPost(postOf(key.split("|")[0]))&&!!LOWER(mo)[d+"|"+key]); }
/* allinea l'orario già presente: i turni coperti da altri anni restano vuoti (non buchi), gli altri tornano da coprire */
function syncExt(mo){ for(const sc of [mo.sched,hasDraft(mo)?mo.draft.sched:null]){ if(!sc) continue;
  for(const d in sc) for(const k in sc[d]){ const a=sc[d][k];
    if(extCovered(mo,d,k)){ if(!a.some(x=>x)) sc[d][k]=[]; }
    else if(!a.length) sc[d][k]=[null]; } } }
function normRoom(x){ return String(x||"").toLowerCase().replace(/\(.*?\)/g,"").replace(/angiografia/g,"angio").replace(/[^a-z0-9]/g,""); }
/* foglio: riga 1 = giorni ("LUN 05"), colonna A = sala (le righe sotto senza nome sono la stessa sala),
   prima della riga "POMERIGGIO" mattina, dopo pomeriggio; riga "NOTTE" = notti; domenica e festivi DEA = guardia */
function parseExt(rows,mk){
  const days=period(mk).days, hdr=rows[0]||[], col={}; let last=-1;
  for(let c=1;c<hdr.length;c++){ const m=String(hdr[c]||"").match(/(\d{1,2})/); if(!m) continue; const n=+m[1];
    for(let i=last+1;i<days.length;i++) if(D(days[i]).getUTCDate()===n){ col[c]=days[i]; last=i; break; } }
  const postBy={}; S.posts.forEach(p=>{ postBy[normRoom(p.name)]=p; postBy[normRoom(p.id)]=postBy[normRoom(p.id)]||p; });
  const nightPost=S.posts.find(p=>Object.values(p.on||{}).some(a=>(a||[]).includes("N")));
  const ours=new Set(S.residents.map(r=>r.name.trim().toLowerCase()));
  const map={}, unknown=new Set(); let sec="M", room=null, own=0;
  for(let r=1;r<rows.length;r++){ const row=rows[r]||[], a=String(row[0]||"").trim();
    if(/^pomeriggio/i.test(a)){ sec="P"; room=null; continue; }
    if(a){ if(/^notte/i.test(a)) room={night:true}; else { const p=postBy[normRoom(a)]; room=p?{post:p}:null; if(!p) unknown.add(a); } }
    if(!room) continue;
    for(const c in col){ const v=String(row[c]??"").trim(); if(!v) continue; const d=col[c], t=dayType(d);
      let post=room.night?nightPost:room.post, sh=room.night?"N":sec;
      if(!room.night&&t==="fes"&&(post.on.fes||[]).includes("D")) sh="D";
      if(!post||!(post.on[t]||[]).includes(sh)) continue;
      if(ours.has(v.replace(/^\(\s*\d\s*\)\s*/,"").trim().toLowerCase())){ own++; continue; }
      const k=d+"|"+post.id+"|"+sh; map[k]=map[k]||[]; if(!map[k].includes(v)) map[k].push(v); } }
  return {map,unknown:[...unknown],own,cols:Object.keys(col).length}; }
function extPreview(name){ const wb=UI.extWb; if(!wb) return; const ws=wb.Sheets[name];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""}), r=parseExt(rows,UI.mk); UI.extRes=r;
  const cnt={}; for(const k in r.map){ const [,pid,sh]=k.split("|"), p=postOf(pid), lab=(p?p.name:pid)+" · "+SHN[sh]; cnt[lab]=(cnt[lab]||0)+1; }
  const n=Object.keys(r.map).length, per=period(UI.mk);
  sheet(`<div class="row" style="justify-content:space-between"><h2>Turni degli altri anni</h2><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   <label class="stack" style="gap:4px"><span class="label">Foglio</span><select id="extsheet">${wb.SheetNames.map(x=>`<option ${x===name?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
   <p class="muted" style="margin:0;font-size:.86rem">${monthName(UI.mk)} (${fmt(per.first)} – ${fmt(per.days[per.days.length-1])}): riconosciuti ${r.cols} giorni su ${per.days.length}. I turni trovati vengono segnati come coperti: il generatore non li assegna ai nostri e non li conta come scoperti.</p>
   ${n?`<div class="alerts" style="background:var(--accent-soft)"><strong>${n} turni coperti da altri anni</strong><ul>${Object.entries(cnt).sort().map(([k,v])=>`<li>${esc(k)}: ${v}</li>`).join("")}</ul></div>`:`<div class="alerts bad"><strong>Nessun turno riconosciuto</strong><span style="font-size:.85rem">Controlla di aver scelto il foglio del mese giusto.</span></div>`}
   ${r.own?`<p class="muted" style="margin:0;font-size:.82rem">${r.own} turni dei nostri specializzandi presenti nel foglio sono stati ignorati.</p>`:""}
   ${r.unknown.length?`<p class="muted" style="margin:0;font-size:.82rem">Sale non nostre, ignorate: ${r.unknown.map(esc).join(", ")}.</p>`:""}
   ${r.cols<per.days.length?`<p style="margin:0;font-size:.82rem;color:var(--bad)">Alcuni giorni del mese non sono nel foglio: lì non risulta nessun turno coperto.</p>`:""}
   <div class="row"><button class="btn primary" data-act="extsave" ${n?"":"disabled"}>Salva${Object.keys(M(UI.mk).ext||{}).length?" (sostituisce quelli caricati prima)":""}</button><button class="btn" data-act="close">Annulla</button></div>`); }

/* ---------- sheets ---------- */
const layer=document.getElementById("layer");
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
function cellSheet(d,k){ const mo=M(UI.mk), [postId,s]=k.split("|"), post=postOf(postId), arr=((editSched(mo)||{})[d]||{})[k]||[null], {per}=derive(UI.mk,viewSched(UI.mk)||undefined);
  const w=Math.floor(period(UI.mk).days.indexOf(d)/7), {pri,jol}=pools(mo,post,s), cov=covOf(post,s);
  const why=pid=>{ const p=per[pid], u=unavOf(mo,pid,d); if(!canDo(pid,s)) return s==="N"?"non abilitato alle notti":"non abilitato alle guardie";
    if(blocked(u,s)) return u==="F"?"in ferie":u==="C"?"a congresso":"indisponibile"; if(p.on[d]&&!arr.includes(pid)) return p.on[d]==="N"?"giorno di monto (ha la notte)":s==="N"?`già di ${SHN[p.on[d]].toLowerCase()}, sarebbe il monto`:`già di ${SHN[p.on[d]].toLowerCase()}`;
    if(p.on[add(d,-1)]==="N") return "giorno di smonto"; if(s==="N"&&p.on[add(d,1)]) return "lavora nel giorno di smonto";
    if(!arr.includes(pid)&&(p.wk[w]||0)>=S.maxWeek) return `già ${p.wk[w]} turni in settimana`; return ""; };
  const btn=(r,i,cur,tag)=>{const y=why(r.id), isCur=cur===r.id;return `<button class="cand ${isCur?"cur":""}" data-act="assign" data-i="${i}" data-id="${r.id}"><span><span class="name-strong">${esc(rName(r))}</span>${tag?` <span class="muted" style="font-size:.78rem">· ${esc(rotName(mo.rot[r.id]))}</span>`:""}${y&&!isCur?`<br><span class="why">${y}</span>`:""}</span><span class="chip">${per[r.id].tot} turni · ${per[r.id].N} N</span></button>`;};
  sheet(`<div class="row" style="justify-content:space-between"><div><h2>${esc(post.name)} · ${SHN[s]}</h2><span class="muted">${fmt(d,true)} · ${esc(S.hours[s])}</span></div><button class="btn icon" data-act="close" aria-label="Chiudi">×</button></div>
   ${EXT(mo)[d+"|"+k]?`<p class="muted" style="margin:0;font-size:.84rem">Altri anni: ${EXT(mo)[d+"|"+k].map(esc).join(", ")}</p>`:""}
   ${LOWER(mo)[d+"|"+k]?`<p class="muted" style="margin:0;font-size:.84rem;font-style:italic">Anni successivi: ${LOWER(mo)[d+"|"+k].map(esc).join(", ")}</p>`:""}
   ${[...arr,...(multiPost(post)&&arr.some(x=>x)?[undefined]:[])].map((cur,i)=>`<div class="stack" style="gap:6px"><span class="label">${cur===undefined?"Aggiungi un'altra persona":cur?`Ora: ${esc(resName(cur))}`:"Scoperto"}</span>
     ${cov!=="ALL"?`<span class="groupname">Rotazione ${esc(rotName(cov))}</span>`:`<span class="groupname">Tutti gli specializzandi</span>`}
     ${pri.map(r=>btn(r,i,cur,cov==="ALL")).join("")||`<p class="muted" style="margin:0">Nessuno in questa rotazione.</p>`}
     ${jol.length?`<span class="groupname">Jolly</span>${jol.map(r=>btn(r,i,cur,true)).join("")}`:""}
     ${(()=>{const bg=S.residents.filter(r=>isBG(mo.rot[r.id])); return bg.length?`<span class="groupname">Bambin Gesù (solo a mano)</span>${bg.map(r=>btn(r,i,cur,true)).join("")}`:"";})()}
     ${cur?`<button class="btn danger" data-act="assign" data-i="${i}" data-id="">${arr.filter(x=>x).length>1?"Togli":"Lascia scoperto"}</button>`:""}</div>`).join("")}
   <div class="row">${(mo.ext||{})[d+"|"+k]&&(mo.ext[d+"|"+k]||[]).includes(EXT_MAN)?`<button class="btn" data-act="extmark" data-v="0">Togli «coperto da altri anni»</button>`:`<button class="btn" data-act="extmark" data-v="1">Coperto da altri anni</button>`}</div>`);
  layer.dataset.d=d; layer.dataset.k=k; }

/* ---------- export ---------- */
async function exportXlsx(){
  const mo=M(UI.mk), p=period(UI.mk), {per,where}=derive(UI.mk);
  if(typeof XLSX==="undefined"){toast("Libreria Excel non caricata, riprova tra poco");return;}
  const SC=viewSched(UI.mk)||{}, cols=columns(SC,p);
  const t1=[["Data","Giorno",...cols.map(c=>`${c.post.name} ${c.s==="D"||c.s==="N"?"":SHN[c.s]+" "}(${S.hours[c.s]})`.replace("  "," "))]];
  p.days.forEach(d=>t1.push([d.split("-").reverse().join("/"),DOW[isoDow(d)]+(dayType(d)==="fes"&&isoDow(d)!==6?" (festivo)":""),...cols.map(c=>{const a=(SC[d]||{})[c.k], ex=EXT(mo)[d+"|"+c.k]||[];return a?[...a.map(x=>x?resName(x):ex.length?"":"SCOPERTO").filter(x=>x),...ex].join(", "):"";})]));
  const people=S.residents.filter(r=>inGem(mo,r.id)||(SC&&shiftsOf(SC,r.id).length));
  const lab=(c,w)=>c==="S"?"Smonto":c==="X"?"indisp.":c==="F"?"ferie":c==="C"?"congresso":c==="D"?"Guardia domenica":c==="N"?"Monto (notte)":c?`${w} ${c}`:"";
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
document.getElementById("tabs").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;UI.tab=b.dataset.tab;UI.confirm=null;try{localStorage.setItem("turni.tab",UI.tab);}catch(_){}render();window.scrollTo(0,0);});
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-act]"); if(!el) return;
  let a=el.dataset.act;
  if(a==="close"){ if(e.target===el||el.tagName==="BUTTON"){closeSheet();render();} return; }
  if(!["planapp","claim","clrF","clrC","gen","genwk","del","delpost","clrone","clrall","clrR","clrsched","clrext","refresh","refrot","years","accall","accw","drop","hopen","hdel","unlink","unlinku","swdel","mswgo"].includes(a)) UI.confirm=null;
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
  if(a==="covy"){ const k=el.dataset.k, y=+el.dataset.y; const cur=Array.isArray(COVY[k])?[...COVY[k]]:[...YEARS];
    const i=cur.indexOf(y); if(i>=0) cur.splice(i,1); else cur.push(y); cur.sort();
    const next={...COVY,[k]:cur}; COVY=next; EXTC.key=null; render();
    db.doc("config/years").set({state:JSON.stringify({coverage:next}),updated:new Date().toISOString()}).catch(()=>toast("Non riesco a salvare: le regole del database vanno aggiornate"));
    return; }
  if(a==="rflag"){ const r=resOf(el.dataset.id); if(!r) return; const f=el.dataset.f; r[f]=!canDo(r.id,f==="nights"?"N":"D"); persist(); render(); return; }
  if(a==="year"){ switchYear(+el.dataset.v); render(); return; }
  if(a==="years"){ if(UI.confirm!=="years"){UI.confirm="years";render();return;} UI.confirm=null;
    if(S.multiYear){ S.multiYear=false; persist(); toast("Più anni disattivato: dati degli altri anni conservati"); render(); return; }
    el.disabled=true; el.textContent="Creazione degli anni…"; enableYears().then(()=>{ toast("Più anni attivo: scegli l'anno in alto"); render(); }).catch(e=>{ toast("Errore: "+(e.message||e)); render(); }); return; }
  if(a==="extmark"){ const mo=M(UI.mk), d=layer.dataset.d, k=layer.dataset.k, kk=d+"|"+k; mo.ext={...(mo.ext||{})};
    if(el.dataset.v==="1"){ mo.ext[kk]=[...(mo.ext[kk]||[]).filter(x=>x!==EXT_MAN),EXT_MAN];
      if(!multiPost(postOf(k.split("|")[0]))){ const fx=mo.fixed=mo.fixed||{}; Object.keys(fx).filter(z=>z.startsWith(kk+"|")).forEach(z=>delete fx[z]); const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=[]; } }
    else { const l=(mo.ext[kk]||[]).filter(x=>x!==EXT_MAN); if(l.length) mo.ext[kk]=l; else delete mo.ext[kk]; }
    syncExt(mo); persist(); closeSheet(); render(); return; }
  if(a==="filt"){ UI.filt=el.dataset.v; render(); return; }
  if(a==="dview"){ UI.draftView=el.dataset.v==="1"; render(); return; }
  if(a==="accall"){ if(UI.confirm!=="accall"){UI.confirm="accall";render();return;} UI.confirm=null; const n=period(UI.mk).days.length/7, acc=(M(UI.mk).draft||{}).acc||{};
    acceptDraft(UI.mk,Array.from({length:n},(_,w)=>w).filter(w=>!acc[w])); persist(); consolidate(); render(); toast("Bozza accettata: orario pubblicato"); return; }
  if(a==="accw"){ const w=+el.dataset.w; if(UI.confirm!=="accw-"+w){UI.confirm="accw-"+w;render();return;} UI.confirm=null;
    acceptDraft(UI.mk,[w]); persist(); render(); toast(`Settimana ${w+1} accettata e pubblicata`); return; }
  if(a==="drop"){ if(UI.confirm!=="drop"){UI.confirm="drop";render();return;} UI.confirm=null; delete M(UI.mk).draft; persist(); render(); toast("Bozza eliminata (una copia resta nello storico, da cui puoi eliminarla)"); return; }
  if(a==="hist"){ const mk=UI.mk; UI.hist=UI.hist||{}; if(UI.hist[mk]&&UI.hist[mk]!=="loading"){ delete UI.hist[mk]; render(); return; } UI.hist[mk]="loading"; render();
    db.collection(`hist/y${CURY}_${mk}/v`).limit(100).get().then(r=>{ UI.hist[mk]=r.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.at||"").localeCompare(a.at||"")); render(); })
      .catch(()=>{ UI.hist[mk]=[]; toast("Storico non disponibile: aggiorna le regole del database"); render(); }); return; }
  if(a==="hdel"){ const i=+el.dataset.i, list=(UI.hist||{})[UI.mk]||[], h=list[i]; if(!h) return; if(UI.confirm!=="hdel-"+i){UI.confirm="hdel-"+i;render();return;} UI.confirm=null;
    db.doc(`hist/y${CURY}_${UI.mk}/v/${h.id}`).delete().then(()=>{ list.splice(i,1); toast("Eliminata dallo storico"); render(); }).catch(()=>toast("Non riesco a eliminarla: aggiorna le regole del database")); return; }
  if(a==="hopen"){ const i=+el.dataset.i, h=((UI.hist||{})[UI.mk]||[])[i]; if(!h) return; if(UI.confirm!=="hopen-"+i){UI.confirm="hopen-"+i;render();return;} UI.confirm=null;
    let sc=null; try{ sc=JSON.parse(h.state); }catch(e){} if(!sc) return; M(UI.mk).draft={sched:sc,at:new Date().toISOString(),acc:{},from:h.at}; UI.draftView=true; persist(); render(); toast("Bozza ripristinata dallo storico"); return; }
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
  if(a==="extsave"){ const mo=M(UI.mk), r=UI.extRes; if(!r) return; mo.ext=r.map; syncExt(mo); UI.extRes=null; UI.extWb=null; persist(); closeSheet(); render();
    toast(`${Object.keys(r.map).length} turni coperti da altri anni salvati`+(mo.generated?": rigenera per applicarli":"")); return; }
  if(a==="clrone"||a==="clrall"||a==="clrsched"){ if(UI.confirm!==a){UI.confirm=a;render();return;} UI.confirm=null;
    if(a==="clrsched"){ const mo=M(UI.mk); mo.sched=null; mo.generated=null; mo.fixed={}; delete mo.draft; toast("Turni e bozza eliminati"); }
    else { const mode=UI.umode||"T"; clearUnav(a==="clrone"?[UI.sel]:S.residents.map(r=>r.id),mode); toast(a==="clrone"?"Eliminate per "+resName(UI.sel):"Eliminate per tutti"); }
    persist(); render(); return; }
  if(a==="mtoday"){UI.mk=todayMk();render();return;}
  if(a==="mprev"||a==="mnext"){const [y,m]=UI.mk.split("-").map(Number);UI.mk=mkOf(y,m+(a==="mnext"?1:-1));render();return;}
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
    generate(UI.mk, wk===null?undefined:wk); histAdd(UI.mk,wk===null?"Bozza generata (tutto il mese)":`Bozza generata: settimana ${wk+1}`,mo.draft.sched); persist(); render(); toast("Bozza pronta: controllala e accettala per pubblicarla"); return; }
  if(a==="gen"){ const mo=M(UI.mk); if(mo.sched&&UI.confirm!=="gen"){UI.confirm="gen";render();return;}
    UI.confirm=null; generate(UI.mk); persist(); render(); toast("Turni generati"); return; }
  if(a==="xlsx"){exportXlsx();return;}
  if(a==="view"){UI.view=el.dataset.v;render();return;}
  if(a==="cell"){ if(hasDraft(M(UI.mk))) UI.draftView=true;cellSheet(el.dataset.d,el.dataset.k);return;}
  if(a==="assign"){ const mo=M(UI.mk), d=layer.dataset.d, k=layer.dataset.k, i=+el.dataset.i, id=el.dataset.id||null;
    const W=ensureDraft(mo,d); W[d]=W[d]||{}; W[d][k]=W[d][k]||[null]; const arr=W[d][k], fx=mo.fixed=mo.fixed||{}, pre=d+"|"+k+"|";
    if(id){ arr[i]=id; fx[pre+i]=id; }
    else if(arr.filter(x=>x).length>1){ /* più persone: si toglie solo questa e si riallineano i turni fissi */
      const pins=arr.map((x,j)=>fx[pre+j]===x&&x?x:null); arr.splice(i,1); pins.splice(i,1);
      Object.keys(fx).filter(z=>z.startsWith(pre)).forEach(z=>delete fx[z]); pins.forEach((x,j)=>{ if(x) fx[pre+j]=x; }); }
    else { arr[i]=null; delete fx[pre+i]; }
    persist(); closeSheet(); render(); return; }
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
      if(x.config) await db.doc("config/main").set({state:typeof x.config==="string"?x.config:JSON.stringify(x.config),updated:at});
      if(x.planner) await db.doc("planner/state").set({state:typeof x.planner==="string"?x.planner:JSON.stringify(x.planner),updated:at});
      for(const u of (x.unav||[])) await db.collection("unav/staff/m").doc(u.mk+"_"+u.pid).set({mk:u.mk,pid:u.pid,days:u.days||{},updated:at});
      for(const w of (x.swaps||[])) await db.collection("swaps").doc(w.id).set(w);
      toast("Dati importati: ricarico"); setTimeout(()=>location.reload(),1200);
    }catch(err){ toast("File non valido o salvataggio non riuscito"); } }; fr.readAsText(t.files[0]); return; }
  if(t.dataset.msw){ const F=UI.msw=UI.msw||{}; const k=t.dataset.msw; F[k]=t.value; if(k==="from") F.a=""; if(k==="to") F.b=""; F.ex={}; UI.confirm=null; render(); return; }
  if(t.dataset.refrot){ UI.refRot=t.value; UI.confirm=null; render(); return; }
  if(t.dataset.genwk){ UI.genWk=t.value; UI.confirm=null; render(); return; }
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
  OWNER = u1 ? await u1.isOwner().catch(()=>false) : !db;
  USER=u1; MYUID = u1 ? await u1.id().catch(()=>null) : null;
  if(db){ docRef=db.doc("planner/state"); cfgRef=db.doc("config/main");
    /* RAW[anno] = {cfg, mon} come arrivano dal database (undefined = non ancora arrivato) */
    const rebuild=()=>{ const R=RAW[CURY]||{}, rawCfg=R.cfg, rawMon=R.mon; if(rawCfg===undefined||rawMon===undefined) return; if(S&&(saveT||saving)) return;
      const mon=rawMon?JSON.parse(rawMon):null, cfg=rawCfg?JSON.parse(rawCfg):(mon?(({months,...c})=>c)(mon):null);
      S=load(cfg?JSON.stringify({...cfg,months:(mon&&mon.months)||{}}):null);
      const sp=splitS(); lastCfg=rawCfg?sp.cfg:""; lastMon=rawMon&&!(!rawCfg&&mon&&mon.residents)?sp.mon:"";
      setSync(cfg?"Salvato":OWNER?"Nessun dato ancora":"In attesa dei dati");
      if(OWNER&&(migrated||!rawCfg&&cfg)){migrated=false;persist();}
      checkMulti(); filterSW(); consolidate(); autoInvalidate(); syncRoles(); autoYear(); if(!layer.innerHTML) render(); };
    REBUILD=rebuild;
    const subY={};
    const watchYear=y=>{ if(subY[y]) return; subY[y]=true; RAW[y]=RAW[y]||{}; const d=yDocs(y);
      const on=k=>snap=>{ const raw=snap.exists?snap.data().state:null; if(raw===RAW[y][k]) return; RAW[y][k]=raw; RAWV++;
        if(y===CURY) rebuild(); else { if(y===2) checkMulti(); syncRoles(); autoYear(); if(S&&!layer.innerHTML) render(); } };
      db.doc(d.cfg).onSnapshot(on("cfg"),()=>setSync("Connessione persa: ricarica la pagina"));
      db.doc(d.mon).onSnapshot(on("mon"),()=>setSync("Connessione persa: ricarica la pagina")); };
    /* più anni acceso/spento: lo decide il config dell'anno 2 */
    const checkMulti=()=>{ const st2=yState(2); const on=!!(st2&&st2.multiYear); if(on===MULTI) return; MULTI=on; EXTC.key=null;
      if(MULTI){ YEARS.forEach(watchYear); watchCov(); } else if(CURY!==2) switchYear(2); filterSW(); };
    let covSub=false;
    const watchCov=()=>{ if(covSub) return; covSub=true; db.doc("config/years").onSnapshot(sn=>{ let c={}; try{ c=(JSON.parse((sn.exists&&sn.data().state)||"{}").coverage)||{}; }catch(e){}
      COVY=c; RAWV++; EXTC.key=null; if(S&&!layer.innerHTML) render(); },()=>{}); };
    watchYear(2);
    db.collection("swaps").limit(1000).onSnapshot(qs=>{ for(const k in SWALL) delete SWALL[k];
      for(const doc of qs.docs){ const x=doc.data(); if(x&&x.id&&x.a) SWALL[x.id]=x; }
      filterSW(); consolidate(); autoInvalidate(); if(S&&!layer.innerHTML) render(); }, ()=>{});
    /* claims/<account> = {pid}: ognuno può scrivere solo il proprio; se due account scelgono lo stesso nome vale il primo */
    db.collection("claims").limit(500).onSnapshot(qs=>{ for(const k in CLAIMS) delete CLAIMS[k];
      const list=qs.docs.map(doc=>({u:doc.id,...(doc.data()||{})})).filter(x=>x.pid).sort((a,b)=>(a.at||"").localeCompare(b.at||""));
      for(const x of list) if(!CLAIMS[x.pid]) CLAIMS[x.pid]=x.u; CLAIMDOCS=list;
      syncSubs(list.map(x=>x.u)); recomputeUnav(); syncRoles(); autoYear(); if(S&&!layer.innerHTML) render(); }, ()=>{});
    syncSubs([]);
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

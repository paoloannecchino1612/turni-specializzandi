/* Collegamento a Firebase: accesso con email e password + database Firestore.
   Espone window.claude.use("db" | "user" | "downloads") con la stessa forma usata dall'app,
   così il codice dei turni resta identico a quello del tool originale. */
import { FIREBASE_CONFIG } from "./config.js?v=61";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, reload } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc as fdoc, collection as fcol, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, limit as flimit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache() });

/* ---------- adattatore database ---------- */
const wrapSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
function docRef(ref) {
  return {
    id: ref.id, path: ref.path,
    get: async () => wrapSnap(await getDoc(ref)),
    set: data => setDoc(ref, data),
    update: data => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next, err) => onSnapshot(ref, s => next(wrapSnap(s)), e => err && err({ code: e.code, message: e.message })),
    collection: p => colRef(fcol(ref, p)),
  };
}
function queryRef(q) {
  return {
    get: async () => { const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"); const r = await getDocs(q); return { docs: r.docs.map(wrapSnap), size: r.size, empty: r.empty }; },
    onSnapshot: (next, err) => onSnapshot(q, r => next({ docs: r.docs.map(wrapSnap), size: r.size, empty: r.empty }), e => err && err({ code: e.code, message: e.message })),
    limit: n => queryRef(query(q, flimit(n))),
  };
}
function colRef(ref) {
  const qr = queryRef(ref);
  return { ...qr, path: ref.path, doc: id => docRef(id ? fdoc(ref, id) : fdoc(ref)), limit: n => queryRef(query(ref, flimit(n))) };
}
const db = { doc: p => docRef(fdoc(fs, p)), collection: p => colRef(fcol(fs, p)) };

/* ---------- utente ---------- */
let OWNER = false;
async function checkOwner() { try { await getDoc(fdoc(fs, "roles/owner")); return true; } catch (e) { return false; } }
const user = {
  isOwner: async () => OWNER,
  id: async () => auth.currentUser ? auth.currentUser.uid : null,
  email: () => auth.currentUser ? auth.currentUser.email : null,
  signOut: () => signOut(auth).then(() => location.reload()),
};

/* ---------- download ---------- */
const downloads = {
  save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return { status: "saved" };
  },
};

/* ---------- schermata di accesso ---------- */
let ready; const readyP = new Promise(r => ready = r);
window.claude = { use: async name => { await readyP; return { db, user, downloads }[name] || null; } };

const box = document.getElementById("login");
const msg = t => { const m = box.querySelector("#lmsg"); m.textContent = t || ""; m.hidden = !t; };
function showLogin(mode) {
  box.hidden = false;
  box.querySelector("#lmode-in").setAttribute("aria-pressed", mode === "in");
  box.querySelector("#lmode-up").setAttribute("aria-pressed", mode === "up");
  box.querySelector("#lgo").textContent = mode === "in" ? "Entra" : "Registrati";
  box.dataset.mode = mode; box.querySelector("#lverify").hidden = true; box.querySelector("#lform").hidden = false;
}
function showVerify(email) {
  box.hidden = false; box.querySelector("#lform").hidden = true; const v = box.querySelector("#lverify"); v.hidden = false;
  v.querySelector("#lvmail").textContent = email;
}
const errText = e => ({
  "auth/invalid-credential": "Email o password non corretti.", "auth/wrong-password": "Password non corretta.",
  "auth/user-not-found": "Nessun account con questa email: registrati.", "auth/email-already-in-use": "Esiste già un account con questa email: entra.",
  "auth/weak-password": "La password deve avere almeno 6 caratteri.", "auth/invalid-email": "Email non valida.",
  "auth/too-many-requests": "Troppi tentativi: riprova tra qualche minuto.",
}[e.code] || ("Errore: " + (e.message || e.code)));

box.querySelector("#lmode-in").onclick = () => showLogin("in");
box.querySelector("#lmode-up").onclick = () => showLogin("up");
box.querySelector("#lform").onsubmit = async ev => {
  ev.preventDefault(); msg("");
  const email = box.querySelector("#lmail").value.trim(), pw = box.querySelector("#lpw").value;
  try {
    if (box.dataset.mode === "up") { const c = await createUserWithEmailAndPassword(auth, email, pw); await sendEmailVerification(c.user); }
    else await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) { msg(errText(e)); }
};
box.querySelector("#lreset").onclick = async () => {
  const email = box.querySelector("#lmail").value.trim(); if (!email) { msg("Scrivi la tua email, poi tocca di nuovo."); return; }
  try { await sendPasswordResetEmail(auth, email); msg("Ti ho mandato un'email per scegliere una nuova password."); } catch (e) { msg(errText(e)); }
};
box.querySelector("#lvagain").onclick = async () => { try { await sendEmailVerification(auth.currentUser); msg("Email inviata di nuovo."); } catch (e) { msg(errText(e)); } };
box.querySelector("#lvdone").onclick = async () => { await reload(auth.currentUser); start(auth.currentUser); };
box.querySelector("#lvout").onclick = () => user.signOut();
box.querySelector("#ldout").onclick = () => user.signOut();
/* richiesta di accesso: il proprietario la vede in Impostazioni e la approva */
async function showRequestState(u) {
  const st = box.querySelector("#ldstate"), btn = box.querySelector("#ldreq");
  try { const r = await getDoc(fdoc(fs, "accessRequests/" + u.uid));
    if (r.exists()) { st.textContent = "Richiesta inviata il " + new Date(r.data().at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) + ". Riceverai l'accesso quando verrà approvata: poi tocca \"riprova\"."; btn.hidden = true; return; }
  } catch (e) {}
  btn.hidden = false;
}
box.querySelector("#ldreq").onclick = async () => {
  const u = auth.currentUser, btn = box.querySelector("#ldreq"), st = box.querySelector("#ldstate");
  if (!u) { st.textContent = "Sessione scaduta: esci e rientra."; return; }
  btn.disabled = true; btn.textContent = "Invio in corso…";
  try {
    await setDoc(fdoc(fs, "accessRequests/" + u.uid), { email: u.email.toLowerCase(), at: new Date().toISOString() });
    st.textContent = "Richiesta inviata. Riceverai l'accesso quando verrà approvata: poi tocca \"riprova\".";
    btn.hidden = true;
  } catch (e) {
    st.textContent = e && e.code === "permission-denied"
      ? "Richiesta bloccata dal server (permission-denied): le regole di Firebase non permettono ancora le richieste di accesso."
      : "Non riesco a inviare la richiesta (" + ((e && (e.code || e.message)) || "errore sconosciuto") + "). Riprova tra poco.";
  }
  btn.disabled = false; if (!btn.hidden) btn.textContent = "Chiedi l'accesso";
};
box.querySelector("#ldretry").onclick = async () => { const u = auth.currentUser; if (!u) return; started = false; box.querySelector("#ldenied").hidden = true; await start(u); };

let started = false;
async function start(u) {
  if (!u) { showLogin("in"); return; }
  if (!u.emailVerified) { showVerify(u.email); return; }
  if (started) return; started = true;
  /* il pass di accesso va rinnovato: dopo la conferma dell'email quello vecchio la dà ancora come non confermata */
  try { await u.getIdToken(true); } catch (e) {}
  OWNER = await checkOwner();
  if (!OWNER) { /* solo le email inserite dal proprietario possono entrare */
    let ok = false; try { const a = await getDoc(fdoc(fs, "access/allow")); ok = a.exists() && (a.data().emails || []).map(x => String(x).toLowerCase()).includes(u.email.toLowerCase()); } catch (e) { ok = false; }
    if (!ok) { started = false; box.hidden = false; box.querySelector("#lform").hidden = true; box.querySelector("#lverify").hidden = true; box.querySelector("#ldenied").hidden = false; box.querySelector("#ldmail").textContent = u.email; showRequestState(u); return; }
  }
  box.hidden = true; document.getElementById("whoami").textContent = u.email; document.getElementById("acct").hidden = false;
  ready();
}
onAuthStateChanged(auth, start);
document.getElementById("logout").onclick = () => user.signOut();

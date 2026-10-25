# Turni Specializzandi — contesto per Claude

Web app per la turnistica degli specializzandi di Radiodiagnostica (Policlinico Gemelli, Roma).
Proprietario: Paolo Annecchino. Lingua dell'app e delle risposte: **italiano**.

## Architettura
- Sito statico su **GitHub Pages** (branch `main`, cartella root): https://paoloannecchino1612.github.io/turni-specializzandi/
- **Firebase** (progetto `turni-specializzandi-2d881`): Authentication email+password (con verifica email), Firestore.
- `fb.js`: login + adattatore che espone `window.claude.use("db"|"user"|"downloads")` con la stessa API del tool originale nato come artefatto Claude. Non cambiare questa interfaccia senza aggiornare `app.js`.
- `app.js`: tutta la logica (stato, generatore, viste, cambi). Script unico, niente build.
- `config.js`: valori pubblici di Firebase. `firestore.rules`: regole di sicurezza (l'email del proprietario è un segnaposto `EMAIL_PROPRIETARIO`; le regole vere si pubblicano a mano nella console Firebase).
- `sw.js`: service worker network-first. **A ogni rilascio incrementare insieme: la cache `turni-vN` in `sw.js` e il parametro `?v=N` di `fb.js`/`app.js` in `index.html` e di `config.js` in `fb.js`** (GitHub Pages fa tenere i file in cache ~10 minuti: senza il parametro il telefono mescola versioni vecchie e nuove).
- Pubblicare = commit + push su `main`; GitHub Pages aggiorna in ~1 minuto.

## Dati in Firestore
- `config/main` `{state: JSON}`: specializzandi, rotazioni, esterni (Bambin Gesù, Brescia), postazioni, orari, limiti, gestori (pid).
- `planner/state` `{state: JSON{months}}`: per mese `rot`, `sched` (giorno → `postId|turno` → [pid]), `generated`, `weeksGen`.
- `unav/{uid}/m/{mk_pid}`: indisponibilità di un account; `unav/staff/m/*` quelle inserite dal proprietario per chi non è associato. Codici: lettere M/P/N/D per turno, `G` giornata intera, `F` ferie, `C` ferie congresso.
- `claims/{uid}` `{pid}`: associazione account → nome. Definitiva: la crea l'utente una volta, la modifica/cancella solo il proprietario.
- `swaps/{id}`: cambi turno (`pending|accepted|rejected|cancelled|invalid`, `manual`, `extra` per monto/smonto, `applied`, `reported`).
- `accessRequests/{uid}` `{email, at}`: richieste di accesso di chi non è autorizzato; il proprietario le approva (aggiunge l'email ad `access/allow`) o le rifiuta in Impostazioni.
- `access/allow` `{emails}`: email autorizzate. `roles/managers` `{uids}`: gestori (sincronizzato dall'app). `roles/owner`: leggibile solo dal proprietario (serve all'app per riconoscerlo).

## Permessi
- Proprietario: tutto; unico che gestisce email autorizzate, gestori, scollegamento account, indisponibilità altrui.
- Gestori: impostazioni, rotazioni, generazione/modifica turni, cambi manuali, cambi da inserire, pulizia storico.
- Specializzandi: proprie indisponibilità/ferie/congressi, cambi (richiesta/risposta), sola lettura del resto.

## Regole dei turni (decise dal proprietario)
- Periodo del mese: dal primo lunedì all'ultima domenica (es. ottobre 2026 = 5/10–1/11).
- Turni: Mattina (M), Pomeriggio (P), Guardia domenica/festivi 12h in DEA (D, 08–20), Notte (N, 20–08).
- Lun–Sab: TC1–4, RM1–5, DEA, Angio 1–2 (Angio il sabato solo mattina) M/P; notte ogni giorno. Domenica e festivi: solo guardia DEA + notte. Festivi italiani incl. 29/6 (Roma).
- Notte e guardia sono turni della sala DEA ma li coprono **tutti** (esclusi Bambin Gesù/Brescia). Ogni altra sala è coperta dalla sua rotazione; Angiografia e DEA fanno da jolly su TC/RM.
- Mai due turni nello stesso giorno. Il giorno della notte è **monto**, il giorno dopo **smonto**: in nessuno dei due si lavora di giorno; mai assegnati automaticamente.
- 5 turni/settimana ideali, 6 massimo; il generatore prova prima a stare a 5.
- Indisponibilità, ferie e congressi di un mese si inseriscono/modificano fino a 2 giorni prima del primo lunedì del periodo; dopo solo il proprietario (bloccato anche nelle regole Firestore).
- Presenza minima per rotazione 66% (lun–sab), ridotta solo da ferie e congressi: va segnalata.
- Il generatore distribuisce in modo omogeneo sale e mattina/pomeriggio; i buchi vanno distribuiti uniformemente (li coprono altri anni).
- Chi è al Bambin Gesù non entra mai nei turni generati, ma i gestori possono assegnarlo a mano.
- Cambi: il collega deve accettare; se il cambio forza una regola appare un avviso esplicito (Accetto / Non accetto) con anche i giorni liberi guadagnati/persi; per le notti si propone di scambiare anche il turno di monto/smonto.
- Colori: Mattina arancione, Pomeriggio blu, Notte viola, Guardia rosso, Ferie verde, Congresso giallo.

## Contesto
- Esiste anche il foglio Google "BOZZA ORARI" con gli orari di tutti gli anni (nomi come "(anno) Cognome"). L'orario si costruisce a cascata 4° → 3° → 2° → 1° anno dopo quello degli strutturati. Una prova su ottobre (gruppo 1° anno, sale RX/Eco/Senologia + TC/RM) ha mostrato che il generatore riduce i buchi; possibile sviluppo futuro: importare dal foglio i turni degli altri anni come "occupati".
- Il proprietario preferisce: prima un consiglio, poi decide lui cosa cambiare; risposte concise; niente modifiche non richieste.

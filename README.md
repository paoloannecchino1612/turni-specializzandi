# Turni Specializzandi

Web app per la turnistica degli specializzandi: rotazioni, indisponibilità, ferie, generazione dei turni, cambi turno.
Si apre da un link e si può aggiungere alla schermata Home del telefono.

- **Sito**: GitHub Pages (file statici in questa cartella)
- **Accesso e dati**: Firebase (Authentication con email e password, Firestore)

## Configurazione (una volta sola)

1. **Firebase** → crea il progetto, attiva *Authentication → Email/Password* e crea *Firestore* in modalità produzione (Europa).
2. **config.js** → incolla i valori di `firebaseConfig` (Impostazioni progetto → Le tue app → Web).
3. **Regole** → apri `firestore.rules`, sostituisci `EMAIL_PROPRIETARIO` con la tua email in minuscolo e incolla tutto in *Firestore → Regole → Pubblica*.
4. **Dominio autorizzato** → *Authentication → Impostazioni → Domini autorizzati* → aggiungi `paoloannecchino1612.github.io`.
5. **GitHub Pages** → *Settings → Pages → Build and deployment*: Source **Deploy from a branch**, branch **main**, cartella **/ (root)**.
6. Apri il sito, **registrati con la tua email** (quella delle regole), conferma l'indirizzo dal link ricevuto ed entra.
7. In **Impostazioni**: importa i dati del vecchio tool (*Importa dati*) e inserisci le **email autorizzate** dei colleghi.

## Chi può fare cosa

| | Proprietario | Gestori | Specializzandi |
|---|---|---|---|
| Impostazioni, rotazioni, turni, cambi manuali | ✓ | ✓ | |
| Email autorizzate, gestori, scollegare account | ✓ | | |
| Proprie indisponibilità, ferie, congressi | ✓ | ✓ | ✓ |
| Indisponibilità degli altri | ✓ | | |
| Chiedere e accettare cambi | ✓ | ✓ | ✓ |

Le regole sono applicate dal server Firebase (`firestore.rules`), non solo dalla pagina.

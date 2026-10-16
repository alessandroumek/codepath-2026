# Codepath — Codemotion Milano 2026

Una web app **React + TypeScript + Vite** per esplorare il programma del 28–29 ottobre 2026 e costruire un itinerario personale senza sovrapposizioni. Pronta per Netlify e installabile come **Progressive Web App (PWA)**.

## Funzioni

- **Nuova griglia oraria per sala** con colonne scorrevoli, durate reali dei talk/workshop, pause compresse, evidenza delle scelte e delle alternative sovrapposte.
- **Vista a elenco alternativa** per chi preferisce consultare le sessioni per fascia oraria, con speaker, descrizioni e categorie.
- Filtri per **categoria**, **sala**, ricerca full-text, e talk **da valutare**.
- Schede di **86 speaker** collegate ai talk.
- **Percorso personale** con scelta di talk per i due giorni.
- **Controllo dei conflitti** basato su interi intervalli temporali, inclusi workshop di 80 minuti: una selezione in conflitto propone di sostituire i talk precedenti.
- Voti da 1 a 5, preferiti e note personali per ogni talk.
- Esportazione calendario `.ics`, esportazione/importazione del percorso in `.json`.
- Design responsive desktop/tablet/mobile, pannello dettagli talk, avatar speaker.
- **PWA installabile** su desktop, Android e iOS/iPadOS (dove supportato dal browser), con manifest, icone e service worker.
- **Consultazione offline** dell'agenda, delle descrizioni, dei filtri e del proprio percorso dopo il primo caricamento online completato. Foto esterne degli speaker e font remoti potrebbero non comparire senza rete.

## Nuova griglia di pianificazione (v0.3)

La vista **Griglia oraria** è selezionata per impostazione predefinita. Le sale sono disposte in colonne e gli orari in verticale. Puoi scorrere orizzontalmente la griglia, anche con i pulsanti freccia, e aprire i dettagli cliccando il titolo.

- **Verde**: talk già aggiunto al percorso.
- **Arancione tratteggiato**: talk che si sovrappone a una scelta già effettuata; usando **Sostituisci** compare una conferma esplicita e il sistema rimuove soltanto i talk incompatibili.
- **Bianco**: talk disponibile; clicca **Scegli** per aggiungerlo.
- La geometria temporale è basata sull'agenda completa del giorno e non cambia quando applichi filtri. Le pause lunghe vengono compresse per evitare una griglia inutilmente alta, mentre i talk mantengono proporzioni coerenti alla loro durata effettiva.
- Su telefono la griglia scorre orizzontalmente; puoi tornare alla modalità **Elenco** in qualunque momento. La preferenza per la vista viene memorizzata in `localStorage`.

## Modello dati e privacy

**I dati della conferenza sono statici e immutabili**, nella cartella `src/data/catalog.json` (74 sessioni, 86 speaker, 12 categorie, 8 sale).

**Le scelte personali non fanno parte dei file statici.** `PlanState` è uno stato React inizializzato dal `localStorage` del browser, salvato con una chiave dedicata all'evento. Percorso, preferiti, voti e note **sopravvivono alla chiusura e alla riapertura** del browser. La versione precedente salvava in `sessionStorage`: i dati esistenti vengono migrati automaticamente al primo avvio in questo browser, se non è già presente un piano persistente.

Niente viene trasmesso a un server: i dati restano **sul dispositivo e su quell'origine web**. Possono essere persi se l'utente cancella i dati del sito o naviga in modalità privata. Installazioni PWA e browser possono usare spazi di memorizzazione differenti (specialmente su iOS): per trasferire la selezione, esporta/importa il JSON. Nessuna sincronizzazione cloud automatica.

Nota: lo snapshot del programma risale al **15 ottobre 2026**. Le categorie sono editoriali e molte delle sintesi degli interventi sono dedotte dai titoli, non abstract ufficiali; l'interfaccia lo chiarisce nei dettagli.

## Esecuzione locale

Richiede **Node.js >= 20.19**.

```bash
npm install
npm run dev
```

Apri l'indirizzo mostrato da Vite, solitamente `http://localhost:5173`.

Puoi validare le relazioni e gli orari del catalogo anche senza avviare il frontend:

```bash
npm run validate:data
```

Per preparare la build di produzione:

```bash
npm run build
npm run preview
```

Dopo `npm run build` è presente in `dist/` anche `sw.js`: lo genera lo script `scripts/generate-pwa-sw.mjs` usando i nomi reali degli asset hashati da Vite. Il service worker precarica manifest, icone, bundle e catalogo (incluso nel bundle), offre fallback offline per la SPA e pulisce le vecchie cache dopo un aggiornamento. **In sviluppo (`npm run dev`) il service worker non viene registrato**, per non interferire con l'hot reload.

## Pubblicazione su Netlify

### Collegando GitHub (consigliato)

1. Crea un repository con il contenuto della cartella del progetto e pubblicalo su GitHub.
2. Su Netlify seleziona **Add new project → Import an existing project** e scegli il repository.
3. Netlify legge automaticamente `netlify.toml`. In alternativa:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `22`
4. Pubblica con **Deploy site**. Ogni successivo push aggiornerà il sito.

La regola SPA in `netlify.toml` reindirizza le rotte a `index.html` per consentire futuri URL client-side. Sono impostate anche intestazioni di cache adeguate per `sw.js` (sempre aggiornato), manifest e bundle hashati. Non sono necessari environment variables, database o funzioni serverless.

## Come installarla

1. Esegui un deploy Netlify e apri l'URL in **HTTPS**. `localhost` va bene durante i test.
2. Da Chrome/Edge (desktop/Android) usa il pulsante **Installa app** nell'interfaccia o il comando del browser; da Safari su iPhone/iPad usa **Condividi → Aggiungi alla schermata Home**.
3. Avvia l'app dalla sua icona, come applicazione standalone.
4. **Prima di usarla offline**, attendi che la pagina sia stata caricata una volta online e che il service worker abbia terminato la preparazione dei contenuti. Se l'aggiornamento dell'agenda è importante, collegati a Internet e riapri l'app prima dell'evento.

Nota: l'installazione dipende dal supporto del browser; `beforeinstallprompt` non è disponibile su tutte le piattaforme. Il pulsante dell'app mostra comunque le istruzioni manuali. Su iOS l'installazione può avere un'area di archiviazione distinta dalla scheda Safari.

### Deploy manuale

Dopo `npm run build`, trascina **la cartella `dist/`** nella dashboard Netlify per un deploy manuale.

**Non caricare direttamente il ZIP del codice sorgente nel drag & drop Netlify:** deve prima essere generata la build.

## Struttura

```text
src/
  App.tsx              # viste, filtri, selezione, dettagli e UI
  styles.css           # UI responsive
  main.tsx             # entrypoint React
  data/catalog.json    # catalogo Codemotion (statico)
  lib/catalog.ts       # tipi, indicizzazione e intervalli temporali
  lib/plan.ts          # localStorage, migrazione sessionStorage, import/export JSON e calendario ICS
public/
  manifest.webmanifest # identità e modalità standalone PWA
  icons/              # icone installazione 192/512/maskable
scripts/
  generate-pwa-sw.mjs # genera SW con precache degli asset della build
index.html
netlify.toml            # configurazione di deploy
vite.config.ts
package.json
```

## Aggiornamento del catalogo

Sostituisci `src/data/catalog.json` con uno snapshot aggiornato preservando ID Sessionize e schema. Gli ID sessione sono usati per collegare la selezione utente; mantenere gli ID garantisce compatibilità con i percorsi esportati.

## Prossimi miglioramenti possibili

- Link condivisibile al percorso tramite URL compressa, senza backend.
- Confronto affiancato degli speech della stessa fascia oraria.
- Import automatico del nuovo programma, con evidenza delle variazioni degli orari.
- Modalità griglia multi-palco e indicazione dei tempi di trasferimento tra le sale.

## Fonti

- https://conferences.codemotion.com/milan/speakers/
- https://conferences.codemotion.com/milan/agenda/

Questo è un planner indipendente e non un'applicazione ufficiale Codemotion.

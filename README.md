# Lollidays – Prototipo del sito

Prototipo del nuovo sito di Lollidays: una landing page pubblica e un portale di onboarding privato per i clienti confermati.

Il sito è statico (HTML, CSS e JavaScript senza framework né dipendenze) e si può pubblicare così com'è, per esempio con GitHub Pages.

## Struttura

```
index.html        Pagina unica: landing pubblica e portale clienti
css/style.css     Stili, colori del brand, tema chiaro e scuro
js/app.js         Navigazione, moduli, onboarding a step, caricamento foto
assets/logo.png   Logo Lollidays senza payoff
assets/favicon.png
```

## Pagine

- **Landing pubblica** (`index.html`): presentazione, i tre piani (Basic, Support, Premium), cosa resta a carico del proprietario, come funziona, domande frequenti e modulo di contatto breve.
- **Portale clienti** (`index.html#/onboarding`): percorso in 12 passi con barra di avanzamento, salvataggio della bozza, controllo dei campi, caricamento delle foto per ambiente e riepilogo finale. Non compare nel menu del sito; nel prototipo è raggiungibile dal link in fondo alla pagina.

## Provarlo in locale

Apri `index.html` nel browser. Non serve installare nulla.

## Pubblicare con GitHub Pages

1. Carica il contenuto di questa cartella nella radice del repository.
2. Su GitHub apri **Settings → Pages**.
3. In **Build and deployment** scegli **Deploy from a branch**, poi il branch `main` e la cartella `/ (root)`.
4. Dopo qualche minuto il sito è online all'indirizzo indicato nella stessa pagina.

## Limiti del prototipo

- **Nessun dato viene inviato.** Il modulo di contatto e l'onboarding mostrano solo una conferma. La bozza dell'onboarding resta nel browser di chi la compila (localStorage); le foto non vengono salvate.
- **Il portale non è protetto.** In produzione va reso accessibile solo con un invito personale o con l'accesso cliente.
- **Segnaposto da completare:** prezzi (`CHF —`), tempi di pubblicazione e preavviso di disdetta (`[da definire]`).
- **Solo in italiano.** Le altre lingue (tedesco, francese, inglese, spagnolo) sono da aggiungere.

## Per la versione definitiva

- Collegare il modulo di contatto a un servizio di invio (e-mail o CRM).
- Creare un backend per l'onboarding: autenticazione, salvataggio sicuro dei dati e archiviazione delle foto.
- Pubblicare l'informativa sulla privacy conforme alla legge svizzera sulla protezione dei dati (LPD).
- Aggiungere le traduzioni.

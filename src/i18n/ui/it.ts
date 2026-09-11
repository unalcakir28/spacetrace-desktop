/**
 * Italian UI dictionary. Same keys, same nesting and same order as `en.ts`, so
 * the two files can be read side by side.
 */
import type { Dictionary } from "./en";

export const it: Dictionary = {
  common: {
    cancel: "Annulla",
    close: "Chiudi",
    reload: "Ricarica",
    browse: "Sfoglia…",
    dismiss: "Ignora",
    files: "File",
    folders: "Cartelle",
    entries: "Elementi",
    unreadable: "Illeggibili",
    /** Where there is no number to show. */
    nothing: "—",
  },

  time: {
    justNow: "adesso",
  },

  language: {
    label: "Lingua",
    note: "La riga di comando e l'agente restano in inglese: un comando tradotto non funzionerebbe.",
  },

  basis: {
    onDisk: "Su disco",
    logical: "Logico",
    onDiskNote:
      "Blocchi effettivamente allocati, compreso quanto costano le cartelle stesse. È questa la misura che corrisponde allo spazio mancante dal disco.",
    logicalNote:
      "La lunghezza dichiarata da ciascun file. I file sparsi dichiarano più di quanto contengano, quindi questa misura può sovrastimare un disco di molto.",
    measureBy: "Misura le dimensioni in base a",
    sparse: "sparso",
    sparseNote:
      "Un file sparso: dichiara una lunghezza che non ha allocato, quindi occupa molto meno spazio di quanto dichiari.",
    roundedNote:
      "I file vengono allocati in blocchi interi, quindi questo occupa un po' più della propria lunghezza.",
  },

  /** What each category tends to hold. The identifiers themselves are not
   *  translated — they are the same strings the scanner uses. */
  categories: {
    directory: "cartella",
    image: "foto e grafica",
    video: "file video",
    audio: "musica e audio",
    document: "documenti e testo",
    archive: "archivi e immagini disco",
    code: "sorgenti e configurazioni",
    binary: "eseguibili e librerie",
    cache: "log, cache e file temporanei",
    other: "tutto il resto",
  },

  toolbar: {
    tagline: "l'uso del disco nel tempo",
    scanFolder: "Scansiona cartella…",
    snapshots: "Snapshot…",
    remoteAgent: "Agente remoto…",
    rescan: "Ripeti scansione",
    rescanTitle: "Esegui di nuovo la scansione di questa cartella",
    saveSnapshot: "Salva snapshot…",
    saveSnapshotTitle: "Conserva questa scansione per poterla confrontare in seguito",
    saveBlockedTitle:
      "Dopo questa scansione alcuni elementi sono stati spostati nel Cestino, quindi non corrisponde più al disco. Ripetere la scansione per conservare il risultato.",
    resetZoom: "Reimposta zoom",
    resetZoomTitle: "Torna alla radice di questa scansione",
    about: "Informazioni",
    aboutTitle: "Versione, licenze e cosa è cambiato",
    history: "Cronologia",
    historyTitle: "Come è cresciuta questa cartella, in tutti gli snapshot archiviati",
  },

  capacity: {
    liveTitle: "Spazio libero su questo filesystem. Fare clic per misurarlo di nuovo.",
    snapshotTitle: "Spazio libero al momento in cui è stato preso questo snapshot.",
    freeOf: "liberi di {total}",
  },

  source: {
    liveScan: "scansione in tempo reale",
    snapshot: "snapshot #{id} · {when}",
    files: "file",
    entries: "elementi",
    unreadable: "{count} illeggibili",
    unreadableTitle: "I percorsi che non è stato possibile leggere vengono conteggiati, non saltati",
  },

  map: {
    crumbHint: "doppio clic per ingrandire · backspace per salire",
    layingOut: "disposizione in corso…",
    moreInside: "⠿ = contiene più di quanto mostrato",
    tooltipFiles: "{count} file",
  },

  tree: {
    sparseTitle: "Sparso: {claimed} dichiarati, {allocated} allocati",
    sidebarWidth: "Larghezza dell'elenco cartelle",
    inspectorWidth: "Larghezza del pannello dettagli",
    resizeHint: "{label} — trascinare, o doppio clic per reimpostare",
  },

  progress: {
    scanning: "Scansione di {folder}",
    storing: "Salvataggio di questa scansione",
    movingCount: {
      one: "Spostamento di 1 elemento nel Cestino",
      other: "Spostamento di {count} elementi nel Cestino",
    },
    movingNamed: "Spostamento di {name} nel Cestino",
    stopping: "interruzione",
    stop: "Interrompi",
    stopInProgress: "Interruzione…",
    entries: "{count} elementi",
    unreadable: "{count} illeggibili",
    doneOf: "{done} di {total}",
    fromLastScan: "stimato in base all'ultima scansione di questa cartella",
    firstScan: "prima scansione di questa cartella, quindi non c'è nulla su cui basare una stima",
    finishing: "Completamento",
    finishingNote: "controllo dei cloni copy-on-write, così lo spazio su disco non viene contato due volte",
    clonesChecked: "{count} candidati clone controllati",
    stalled: "Nessun avanzamento da {seconds} s",
    stalledOn: "Nessun avanzamento da {seconds} s — in attesa di {path}",
    stalledAndMore: "{path} (+{count} altri)",
    oneTransaction: "scritto in un'unica transazione, quindi non può segnalare l'avanzamento",
  },

  inspector: {
    nothingSelected: "Nessuna selezione",
    nothingHint:
      "Fare clic su una riga o su un rettangolo per esaminarlo. Tenere premuto ⌘ per aggiungere alla selezione, o ⇧ per prendere una sequenza di righe. Fare clic con il tasto destro per vedere cosa se ne può fare.",
    thisScan: "Questa scansione",
    unreadablePaths: "{count} percorsi",
    couldNotRead: "Percorsi che non è stato possibile leggere",
    selectedCount: "{count} selezionati",
    shareOfScan: "{share} di questa scansione, {basis}",
    largestOfThem: "Il più grande fra questi",
    moveManyToTrash: "Sposta {count} elementi nel Cestino…",
    selection: "Selezione",
    scanRoot: "la radice della scansione",
    share: "Quota",
    type: "Tipo",
    mostly: "Prevalentemente",
    modified: "Modificato",
    fullPath: "Percorso completo",
    showInFileManager: "Mostra nel gestore file",
    moveToTrash: "Sposta nel Cestino…",
    snapshotNote:
      "Questo è uno snapshot salvato, non il filesystem in tempo reale, quindi non è possibile agire sui file. Scansionare di nuovo la cartella per lavorarci.",
  },

  menu: {
    openInMap: "Apri nella mappa",
    showInFileManager: "Mostra nel gestore file",
    copyPath: "Copia percorso",
    moveToTrash: "Sposta nel Cestino…",
    moveManyToTrash: "Sposta {count} elementi nel Cestino…",
  },

  toast: {
    scanned: "Scansionata {folder}",
    scannedDetail:
      "Non è stato possibile leggere {count} percorsi, che vengono conteggiati e non saltati.",
    scanStopped: "Scansione interrotta",
    scanStoppedDetail: "Non è stato modificato nulla.",
    couldNotMove: "Non è stato possibile spostarlo nel Cestino",
    storedAsLabel: "Salvato come “{label}” (#{id})",
    storedAs: "Salvato come snapshot #{id}",
    storedDetail:
      "Scansionare di nuovo questa cartella più avanti e confrontare i due snapshot per vedere che cosa è cresciuto.",
    nothingLeft: "Non è rimasto nulla da spostare",
    nothingLeftDetail: "Quegli elementi non ci sono già più.",
    nothingToMove: "Nulla da spostare",
    nothingToMoveDetail: "Tutto ciò che era selezionato non c'era già più.",
    pathCopied: "Percorso copiato",
    couldNotCopy: "Non è stato possibile copiare il percorso",
    couldNotCopyDetail:
      "Il percorso completo si trova nel pannello a destra, dove può essere selezionato.",
    couldNotOpenFileManager: "Non è stato possibile aprire il gestore file",
    couldNotStore: "Non è stato possibile salvare questa scansione",
    inTrashOne: "{name} è nel Cestino",
    inTrashMany: "{count} elementi sono nel Cestino",
    freedDetail:
      "{size} hanno lasciato questa cartella. Lo spazio su disco torna disponibile svuotando il Cestino.",
    redundantDetail: " {count} erano già dentro una cartella spostata insieme a loro.",
    stayedOne: "{name} è rimasto dov'era",
    stayedUnnamed: "Un elemento",
    stayedMany: "Non è stato possibile spostare {failed} elementi su {total}",
  },

  errors: {
    unknown: "Qualcosa è andato storto.",
    stale_generation: "Questa voce appartiene a una scansione non più aperta.",
    scan_cancelled: "La scansione è stata interrotta.",
    nothing_open: "Non c'è ancora nulla di aperto.",
    state_unusable:
      "Lo stato interno dell'app è inutilizzabile dopo un precedente arresto anomalo. Riavviarla.",
    not_a_directory: "{path} non è una cartella.",
    scan_thread_failed: "La scansione non è stata completata.",
    cannot_scan: "Non è stato possibile analizzare {path}.",
    cannot_open_database: "Non è stato possibile aprire il database di snapshot {db}.",
    cannot_read_database: "Non è stato possibile leggere il database di snapshot {db}.",
    cannot_store_snapshot: "Non è stato possibile salvare questa scansione.",
    cannot_load_snapshot: "Non è stato possibile caricare lo snapshot #{id}.",
    already_a_snapshot:
      "Questo è già uno snapshot salvato. Analizzi la cartella per salvarne uno nuovo.",
    counters_unavailable:
      "I contatori di questa scansione non sono disponibili, quindi non può essere salvata.",
    edited_since_scan:
      "Dopo questa scansione alcune voci sono state spostate nel Cestino, quindi non corrisponde più al disco. Ripeta la scansione per salvare il risultato.",
    operation_did_not_finish: "L'operazione non è stata completata.",
    no_entry: "In questa scansione non esiste la voce {node}.",
    nothing_to_trash: "Non è stato selezionato nulla da spostare nel Cestino.",
    no_longer_exists: "{path} non esiste più.",
    cannot_move_to_trash: "Non è stato possibile spostare {path} nel Cestino.",
    trash_did_not_finish: "L'operazione sul Cestino non è stata completata.",
    refusing_scan_root:
      "La cartella da cui è partita la scansione non può essere spostata nel Cestino.",
    cannot_open_file_manager: "Non è stato possibile aprire il gestore file.",
    cannot_open_settings: "Impossibile aprire Impostazioni di Sistema.",
    file_manager_failed: "Il gestore file è terminato con {status}.",
    remote_failed: "Non è stato possibile raggiungere l'agente.",
    snapshot_not_live:
      "Questo è uno snapshot salvato, non il filesystem attivo. Apra una nuova scansione per agire sui file.",
    gone_but_not_removed:
      "È sparito dal disco ma non è stato possibile rimuoverlo dall'albero. Ripeta la scansione per essere certo dei totali.",
    trashed_but_view_moved_on:
      "Le voci sono state spostate nel Cestino, ma nel frattempo è stata aperta un'altra scansione, quindi questa vista non è stata aggiornata.",
  },

  welcome: {
    headline: "Cosa sta riempiendo i dischi",
    lede: "Scansionare una cartella qui, aprire uno snapshot preso in precedenza, oppure leggerne uno direttamente da un agente in esecuzione su un server o un NAS.",
    free: "{size} liberi",
    ofTotal: "di {total} su questo filesystem",
    scanAnother: "Scansiona un'altra cartella…",
    storedSnapshots: "Snapshot salvati",
    remoteAgent: "Agente remoto",
    promise:
      "La scansione si limita a leggere. Nulla sui dischi analizzati viene modificato, a meno che non si sposti esplicitamente qualcosa nel Cestino, e questo è possibile solo in una scansione in tempo reale di questa macchina. L'app conserva una sola annotazione propria: quanti elementi conteneva ciascuna cartella l'ultima volta, così che la scansione successiva possa mostrarne una percentuale reale.",
  },

  /* Shown before the first scan when macOS would otherwise interrupt it
     with one permission dialog per protected folder. */
  fda: {
    title: "macOS sta nascondendo alcune cartelle a spacetrace",
    body: "Senza Accesso completo al disco, Scrivania, Documenti, Download e altre restano invisibili — e macOS lo richiede di nuovo per ognuna, nel mezzo di una scansione. Concederlo una volta chiude entrambe le cose.",
    open: "Apri Impostazioni di Sistema",
    relaunch: "Riavvia l'app",
    after: "Nell'elenco che si apre aggiungi spacetrace con + oppure spunta la casella, poi riavvia. macOS applica la modifica solo a un avvio nuovo.",
  },

  scanDialog: {
    title: "Scansiona una cartella",
    folder: "Cartella",
    pathPlaceholder: "/Users/you/Projects",
    excludeLabel: "Salta le cartelle con questi nomi (separati da virgola)",
    oneFileSystem: "Resta su un solo filesystem (salta i volumi montati)",
    readsOnly:
      "La scansione si limita a leggere. I percorsi illeggibili vengono conteggiati e segnalati, non saltati in silenzio.",
    start: "Scansiona",
  },

  snapshots: {
    title: "Snapshot salvati",
    databaseLabel: "Database degli snapshot",
    databaseHint:
      "Lo stesso database su cui scrive la riga di comando {command}. Fare clic su una riga per aprirla; selezionarne due per confrontarle.",
    emptyTitle: "Qui non è ancora stato salvato alcuno snapshot.",
    emptyHint:
      "Scansionare una cartella, poi usare {action} nella barra degli strumenti. Un confronto si fa a partire da due snapshot della stessa cartella, quindi vale la pena salvare il primo prima di una pulizia, non dopo.",
    columnId: "ID",
    columnTaken: "Acquisito",
    columnHost: "Host",
    columnFiles: "File",
    columnRoot: "Radice",
    comparing: "Confronto fra #{from} → #{to}",
    selectedForComparison: "{count} di 2 selezionati per il confronto",
    compare: "Confronta",
  },

  remote: {
    title: "Apri uno snapshot remoto",
    urlLabel: "URL dell'agente",
    tokenLabel: "Token bearer",
    tokenPlaceholder: "da /etc/spacetrace/token",
    list: "Elenca snapshot",
    note: "Lo snapshot viene scaricato e aperto esattamente come uno locale. L'agente si limita sempre a leggere la propria macchina, quindi nulla di quanto avviene qui può modificarla.",
  },

  history: {
    title: "Cronologia di una cartella",
    targetLabel: "Cartella",
    targetOption: "{host} · {root} · {count} snapshot",
    chartLabel: "Dimensione di {root} attraverso {count} snapshot",
    chartHint:
      "L'asse parte da zero, quindi l'altezza della linea è la dimensione stessa. Fai clic su un punto per selezionarlo; due punti selezionati possono essere confrontati.",
    noHistoryHere:
      "Nulla di archiviato per la cartella a schermo. Viene mostrata invece la cronologia di un'altra cartella.",
    needTwo: "Per ora un solo snapshot. Una cronologia ne richiede un secondo con cui confrontarsi.",
    columnPeriod: "Tra",
    columnElapsed: "Trascorso",
    columnChange: "Variazione in {measure}",
    columnAfter: "Dopo",
    days: "{days} g",
    unchanged: "nessuna variazione",
    stepTitle: "Confronta questi due snapshot e vedi quali cartelle ne sono responsabili",
    openPoint: "Apri snapshot",
  },

  diff: {
    title: "Cosa è cambiato",
    from: "Da",
    to: "A",
    total: "Totale",
    change: "Variazione",
    nothingChanged: "Nulla è cambiato oltre la soglia.",
    columnStatus: "Stato",
    columnNow: "Ora",
    columnPath: "Percorso",
    passThroughNote:
      "Le cartelle che si limitano a trasmettere una variazione vengono saltate: la riga mostrata è il primo livello in cui la variazione si distribuisce davvero.",
  },

  save: {
    title: "Salva questa scansione",
    folder: "Cartella",
    label: "Etichetta",
    labelPlaceholder: "facoltativa, ad es. prima della pulizia",
    labelHint:
      "Un nome per riconoscerlo nell'elenco degli snapshot. I confronti si fanno fra snapshot della stessa cartella, quindi qualcosa che dica quando o perché aiuta più di una data — la data viene registrata comunque.",
    storing: "Salvataggio…",
    confirm: "Salva snapshot",
  },

  trash: {
    titleOne: "Spostare {name} nel Cestino?",
    titleMany: "Spostare {count} elementi nel Cestino?",
    andMore: "e altri {count}",
    leavesOne: "Lascia questa cartella subito. Lo spazio su disco torna disponibile svuotando il Cestino, perché il Cestino si trova sullo stesso filesystem.",
    leavesMany: "Lasciano questa cartella subito. Lo spazio su disco torna disponibile svuotando il Cestino, perché il Cestino si trova sullo stesso filesystem.",
    confirmOne: "Sposta nel Cestino",
    confirmMany: "Sposta {count} elementi",
  },

  about: {
    title: "Informazioni su spacetrace",
    version: "Versione",
    build: "Build",
    built: "Compilato",
    channel: "Canale",
    licence: "Licenza",
    licenceNote:
      "Lo scanner, l'archivio degli snapshot e la riga di comando sono Apache-2.0. Questa app è proprietaria.",
    website: "Sito web",
    sourceCode: "Codice sorgente",
    whatsNew: "Novità",
    noChanges: "Per questa versione non è ancora stato registrato nulla.",
    milestone: "tappa di sviluppo",
    kinds: {
      added: "Aggiunto",
      changed: "Modificato",
      performance: "Prestazioni",
      fixed: "Corretto",
      removed: "Rimosso",
      security: "Sicurezza",
    },
  },

  update: {
    available: "La versione {version} è disponibile",
    availableDetail: "La versione in uso è {current}.",
    seeWhatsNew: "Vedi cosa è cambiato",
    install: "Aggiorna e riavvia",
    installing: "Download in corso…",
    later: "Non ora",
    failed: "Non è stato possibile installare l'aggiornamento",
    upToDate: "spacetrace è aggiornato",
    checking: "Controllo…",
    check: "Controlla aggiornamenti",
    notOnReleaseChannel:
      "Questa è una build di sviluppo, quindi non c'è nulla a cui aggiornarsi.",
  },
};

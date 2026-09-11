import type { Dictionary } from "./en";

export const de: Dictionary = {
  common: {
    cancel: "Abbrechen",
    close: "Schließen",
    reload: "Neu laden",
    browse: "Durchsuchen…",
    dismiss: "Ausblenden",
    files: "Dateien",
    folders: "Ordner",
    entries: "Einträge",
    unreadable: "Nicht lesbar",
    /** Where there is no number to show. */
    nothing: "—",
  },

  time: {
    justNow: "gerade eben",
  },

  language: {
    label: "Sprache",
    note: "Die Kommandozeile und der Agent bleiben englisch: Ein übersetzter Befehl würde nicht laufen.",
  },

  age: {
    colorBy: "Karte einfärben nach",
    byKind: "Art",
    byAge: "Alter",
    byKindNote: "Färbt jede Datei danach, was sie ist.",
    byAgeNote:
      "Färbt nach der letzten Änderung. Ein Ordner bekommt das Alter seines mittleren Bytes: die Hälfte seines Inhalts ist älter, als die Farbe sagt.",
    week: "Unter einer Woche",
    month: "Unter einem Monat",
    quarter: "1–3 Monate",
    year: "3–12 Monate",
    twoYears: "1–2 Jahre",
    older: "Über 2 Jahre",
    upToDays: "Bis zu {days} Tage",
    unknown: "Ohne Datum",
    unknownNote:
      "Dateien, deren Änderungszeit nie erfasst wurde. Getrennt von den Bändern gezeigt und nicht als ältestes: ein Snapshot aus einem Format ohne Zeitstempel würde sonst als ein halbes Jahrhundert alt ausgewiesen.",
  },
  basis: {
    onDisk: "Auf der Festplatte",
    logical: "Logisch",
    onDiskNote:
      "Tatsächlich belegte Blöcke, einschließlich dessen, was die Ordner selbst kosten. Dies ist das Maß, das den auf der Festplatte fehlenden Platz ergibt.",
    logicalNote:
      "Die Länge, die jede Datei angibt. Sparse-Dateien geben mehr an, als sie belegen, daher kann dieses Maß eine Festplatte weit überschätzen.",
    measureBy: "Größen messen nach",
    sparse: "sparse",
    sparseNote:
      "Eine Sparse-Datei: Sie meldet eine Länge, die sie gar nicht belegt hat, und braucht daher weit weniger Platz, als sie angibt.",
    roundedNote:
      "Dateien werden in ganzen Blöcken belegt, daher belegt diese hier etwas mehr als ihre Länge.",
  },

  /** What each category tends to hold. The identifiers themselves are not
   *  translated — they are the same strings the scanner uses. */
  categories: {
    directory: "Ordner",
    image: "Fotos und Grafiken",
    video: "Videodateien",
    audio: "Musik und Audio",
    document: "Dokumente und Text",
    archive: "Archive und Datenträgerabbilder",
    code: "Quellcode und Konfiguration",
    binary: "Programme und Bibliotheken",
    cache: "Protokolle, Caches und temporäre Dateien",
    other: "alles Übrige",
  },

  toolbar: {
    tagline: "Festplattenbelegung im Zeitverlauf",
    scanFolder: "Ordner scannen…",
    snapshots: "Snapshots…",
    remoteAgent: "Entfernter Agent…",
    rescan: "Erneut scannen",
    rescanTitle: "Diesen Ordner erneut scannen",
    saveSnapshot: "Snapshot speichern…",
    saveSnapshotTitle:
      "Diesen Scan ablegen, damit später dagegen verglichen werden kann",
    saveBlockedTitle:
      "Seit diesem Scan wurden Einträge in den Papierkorb verschoben, er passt also nicht mehr zur Festplatte. Scannen Sie erneut, um das Ergebnis zu speichern.",
    resetZoom: "Zoom zurücksetzen",
    resetZoomTitle: "Zurück an den Anfang dieses Scans",
    about: "Über",
    aboutTitle: "Version, Lizenzen und was sich geändert hat",
    history: "Verlauf",
    historyTitle: "Wie dieser Ordner gewachsen ist, über alle gespeicherten Snapshots",
  },

  capacity: {
    liveTitle:
      "Freier Platz auf diesem Dateisystem. Klicken, um ihn erneut zu messen.",
    snapshotTitle: "Freier Platz zum Zeitpunkt dieses Snapshots.",
    freeOf: "frei von {total}",
  },

  source: {
    liveScan: "Live-Scan",
    snapshot: "Snapshot #{id} · {when}",
    files: "Dateien",
    entries: "Einträge",
    unreadable: "{count} nicht lesbar",
    unreadableTitle:
      "Pfade, die nicht gelesen werden konnten, werden gezählt und nicht übersprungen",
  },

  map: {
    crumbHint: "Doppelklick zum Hineinzoomen · Rücktaste für eine Ebene höher",
    layingOut: "wird angeordnet…",
    moreInside: "⠿ = mehr enthalten als gezeigt",
    tooltipFiles: "{count} Dateien",
  },

  tree: {
    sparseTitle: "Sparse: {claimed} angegeben, {allocated} belegt",
    sidebarWidth: "Breite der Ordnerliste",
    inspectorWidth: "Breite des Detailbereichs",
    resizeHint: "{label} — ziehen oder doppelklicken zum Zurücksetzen",
  },

  progress: {
    scanning: "{folder} wird gescannt",
    storing: "Dieser Scan wird gespeichert",
    movingCount: {
      one: "1 Objekt wird in den Papierkorb verschoben",
      other: "{count} Objekte werden in den Papierkorb verschoben",
    },
    movingNamed: "{name} wird in den Papierkorb verschoben",
    stopping: "wird angehalten",
    stop: "Anhalten",
    stopInProgress: "Wird angehalten…",
    entries: "{count} Einträge",
    unreadable: "{count} nicht lesbar",
    doneOf: "{done} von {total}",
    fromLastScan: "geschätzt anhand Ihres letzten Scans dieses Ordners",
    firstScan:
      "erster Scan dieses Ordners, es gibt also nichts, woran sich eine Schätzung messen könnte",
    finishing: "Wird abgeschlossen",
    finishingNote: "Prüfung auf Copy-on-Write-Klone, damit der Platz auf der Platte nicht doppelt gezählt wird",
    clonesChecked: "{count} Klon-Kandidaten geprüft",
    stalled: "Seit {seconds}s kein Fortschritt",
    stalledOn: "Seit {seconds}s kein Fortschritt — wartet auf {path}",
    stalledAndMore: "{path} (+{count} weitere)",
    oneTransaction:
      "wird in einer einzigen Transaktion geschrieben und kann daher keinen Fortschritt melden",
  },

  inspector: {
    nothingSelected: "Nichts ausgewählt",
    nothingHint:
      "Klicken Sie auf eine Zeile oder ein Rechteck, um es zu untersuchen. Halten Sie ⌘ gedrückt, um zur Auswahl hinzuzufügen, oder ⇧, um eine zusammenhängende Reihe von Zeilen zu nehmen. Ein Rechtsklick zeigt, was damit möglich ist.",
    thisScan: "Dieser Scan",
    unreadablePaths: "{count} Pfade",
    couldNotRead: "Pfade, die nicht gelesen werden konnten",
    selectedCount: "{count} ausgewählt",
    shareOfScan: "{share} dieses Scans, {basis}",
    largestOfThem: "Größter davon",
    moveManyToTrash: "{count} Objekte in den Papierkorb verschieben…",
    selection: "Auswahl",
    scanRoot: "die Wurzel des Scans",
    share: "Anteil",
    type: "Typ",
    mostly: "Überwiegend",
    modified: "Geändert",
    fullPath: "Vollständiger Pfad",
    showInFileManager: "Im Dateimanager anzeigen",
    moveToTrash: "In den Papierkorb verschieben…",
    snapshotNote:
      "Dies ist ein gespeicherter Snapshot, nicht das laufende Dateisystem; Dateien lassen sich hier also nicht bearbeiten. Scannen Sie den Ordner erneut, um mit ihm zu arbeiten.",
  },

  menu: {
    openInMap: "In der Karte öffnen",
    showInFileManager: "Im Dateimanager anzeigen",
    copyPath: "Pfad kopieren",
    moveToTrash: "In den Papierkorb verschieben…",
    moveManyToTrash: "{count} Objekte in den Papierkorb verschieben…",
  },

  toast: {
    scanned: "{folder} gescannt",
    scannedDetail:
      "{count} Pfade konnten nicht gelesen werden; sie werden gezählt, nicht übersprungen.",
    scanStopped: "Scan angehalten",
    scanStoppedDetail: "Es wurde nichts verändert.",
    couldNotMove: "Konnte nicht in den Papierkorb verschoben werden",
    storedAsLabel: "Gespeichert als „{label}“ (#{id})",
    storedAs: "Als Snapshot #{id} gespeichert",
    storedDetail:
      "Scannen Sie diesen Ordner später erneut und vergleichen Sie die beiden, um zu sehen, was gewachsen ist.",
    nothingLeft: "Nichts mehr zu verschieben",
    nothingLeftDetail: "Diese Einträge sind bereits weg.",
    nothingToMove: "Nichts zu verschieben",
    nothingToMoveDetail: "Alles Ausgewählte war bereits weg.",
    pathCopied: "Pfad kopiert",
    couldNotCopy: "Der Pfad konnte nicht kopiert werden",
    couldNotCopyDetail:
      "Der vollständige Pfad steht im Bereich rechts, wo er sich markieren lässt.",
    couldNotOpenFileManager: "Der Dateimanager konnte nicht geöffnet werden",
    couldNotStore: "Dieser Scan konnte nicht gespeichert werden",
    inTrashOne: "{name} ist im Papierkorb",
    inTrashMany: "{count} Objekte sind im Papierkorb",
    freedDetail:
      "{size} haben diesen Ordner verlassen. Der Speicherplatz kommt zurück, wenn Sie den Papierkorb leeren.",
    redundantDetail:
      " {count} davon lagen bereits in einem Ordner, der mitgegangen ist.",
    stayedOne: "{name} ist geblieben, wo es war",
    stayedUnnamed: "Ein Eintrag",
    stayedMany: "{failed} von {total} konnten nicht verschoben werden",
  },

  errors: {
    unknown: "Etwas ist schiefgelaufen.",
    stale_generation: "Dieser Eintrag gehört zu einem Scan, der nicht mehr offen ist.",
    scan_cancelled: "Der Scan wurde abgebrochen.",
    nothing_open: "Es ist noch nichts geöffnet.",
    state_unusable:
      "Der interne Zustand der App ist nach einem früheren Absturz unbrauchbar. Bitte neu starten.",
    not_a_directory: "{path} ist kein Ordner.",
    scan_thread_failed: "Der Scan wurde nicht abgeschlossen.",
    cannot_scan: "{path} konnte nicht gescannt werden.",
    cannot_open_database: "Die Snapshot-Datenbank {db} konnte nicht geöffnet werden.",
    cannot_read_database: "Die Snapshot-Datenbank {db} konnte nicht gelesen werden.",
    cannot_store_snapshot: "Dieser Scan konnte nicht gespeichert werden.",
    cannot_load_snapshot: "Snapshot #{id} konnte nicht geladen werden.",
    already_a_snapshot:
      "Dies ist bereits ein gespeicherter Snapshot. Scannen Sie den Ordner, um einen neuen zu speichern.",
    counters_unavailable:
      "Die Zähler dieses Scans liegen nicht vor, er kann daher nicht gespeichert werden.",
    edited_since_scan:
      "Seit diesem Scan wurden Einträge in den Papierkorb verschoben, er passt also nicht mehr zur Festplatte. Scannen Sie erneut, um das Ergebnis zu speichern.",
    operation_did_not_finish: "Der Vorgang wurde nicht abgeschlossen.",
    no_entry: "In diesem Scan gibt es keinen Eintrag {node}.",
    nothing_to_trash: "Es wurde nichts zum Verschieben in den Papierkorb ausgewählt.",
    no_longer_exists: "{path} existiert nicht mehr.",
    cannot_move_to_trash: "{path} konnte nicht in den Papierkorb verschoben werden.",
    trash_did_not_finish: "Der Papierkorb-Vorgang wurde nicht abgeschlossen.",
    refusing_scan_root:
      "Der Ordner, in dem der Scan begonnen hat, kann nicht in den Papierkorb verschoben werden.",
    cannot_open_file_manager: "Der Dateimanager konnte nicht geöffnet werden.",
    cannot_open_settings: "Die Systemeinstellungen konnten nicht geöffnet werden.",
    file_manager_failed: "Der Dateimanager wurde mit {status} beendet.",
    remote_failed: "Der Agent war nicht erreichbar.",
    snapshot_not_live:
      "Dies ist ein gespeicherter Snapshot, nicht das laufende Dateisystem. Öffnen Sie einen neuen Scan, um mit Dateien zu arbeiten.",
    gone_but_not_removed:
      "Es ist von der Festplatte verschwunden, konnte aber nicht aus dem Baum entfernt werden. Scannen Sie erneut, um die Summen abzusichern.",
    trashed_but_view_moved_on:
      "Die Einträge wurden in den Papierkorb verschoben, aber währenddessen wurde ein anderer Scan geöffnet, sodass diese Ansicht nicht aktualisiert werden konnte.",
  },

  welcome: {
    headline: "Sehen Sie, was Ihre Festplatten füllt",
    lede: "Scannen Sie hier einen Ordner, öffnen Sie einen früher aufgenommenen Snapshot, oder lesen Sie einen direkt von einem Agenten, der auf einem Server oder NAS läuft.",
    free: "{size} frei",
    ofTotal: "von {total} auf diesem Dateisystem",
    scanAnother: "Weiteren Ordner scannen…",
    storedSnapshots: "Gespeicherte Snapshots",
    remoteAgent: "Entfernter Agent",
    promise:
      "Scannen liest nur. Auf den gescannten Festplatten wird nichts verändert, außer Sie verschieben ausdrücklich etwas in den Papierkorb, und das ist nur bei einem Live-Scan dieses Rechners möglich. Die App merkt sich eine einzige eigene Angabe: wie viele Einträge jeder Ordner beim letzten Mal hatte, damit der nächste Scan davon einen echten Prozentwert zeigen kann.",
  },

  /* Shown before the first scan when macOS would otherwise interrupt it
     with one permission dialog per protected folder. */
  fda: {
    title: "macOS verbirgt einige Ordner vor spacetrace",
    body: "Ohne Vollen Festplattenzugriff bleiben Schreibtisch, Dokumente, Downloads und weitere unsichtbar — und macOS fragt für jeden einzeln nach, mitten im Scan. Einmal erteilt, hört beides auf.",
    open: "Systemeinstellungen öffnen",
    relaunch: "App neu starten",
    after: "Fügen Sie spacetrace in der Liste mit + hinzu oder setzen Sie den Haken, dann neu starten. macOS wendet die Änderung nur auf einen frischen Start an.",
  },

  scanDialog: {
    title: "Einen Ordner scannen",
    folder: "Ordner",
    pathPlaceholder: "/Users/you/Projects",
    excludeLabel: "Ordner mit diesen Namen überspringen (durch Komma getrennt)",
    oneFileSystem:
      "Auf einem Dateisystem bleiben (eingehängte Volumes überspringen)",
    readsOnly:
      "Scannen liest nur. Nicht lesbare Pfade werden gezählt und gemeldet, statt stillschweigend übersprungen zu werden.",
    start: "Scannen",
  },

  snapshots: {
    title: "Gespeicherte Snapshots",
    databaseLabel: "Snapshot-Datenbank",
    databaseHint:
      "Dieselbe Datenbank, in die auch die Kommandozeile {command} schreibt. Klicken Sie auf eine Zeile, um sie zu öffnen; haken Sie zwei Zeilen an, um sie zu vergleichen.",
    emptyTitle: "Hier sind noch keine Snapshots gespeichert.",
    emptyHint:
      "Scannen Sie einen Ordner und verwenden Sie dann {action} in der Werkzeugleiste. Ein Vergleich entsteht aus zwei Snapshots desselben Ordners, deshalb lohnt sich der erste eher vor einer Aufräumaktion als danach.",
    columnId: "ID",
    columnTaken: "Aufgenommen",
    columnHost: "Host",
    columnFiles: "Dateien",
    columnRoot: "Wurzel",
    comparing: "Vergleich #{from} → #{to}",
    selectedForComparison: "{count} von 2 für den Vergleich ausgewählt",
    compare: "Vergleichen",
  },

  remote: {
    title: "Einen entfernten Snapshot öffnen",
    urlLabel: "Agent-URL",
    tokenLabel: "Bearer-Token",
    tokenPlaceholder: "aus /etc/spacetrace/token",
    list: "Snapshots auflisten",
    note: "Der Snapshot wird heruntergeladen und genau wie ein lokaler geöffnet. Der Agent liest seinen Rechner immer nur, von hier aus kann ihn also nichts verändern.",
  },

  history: {
    title: "Verlauf eines Ordners",
    targetLabel: "Ordner",
    targetOption: "{host} · {root} · {count} Snapshots",
    chartLabel: "Größe von {root} über {count} Snapshots",
    chartHint:
      "Die Achse beginnt bei null, die Höhe der Linie ist also die Größe selbst. Klicken Sie auf einen Punkt, um ihn auszuwählen; zwei ausgewählte Punkte lassen sich vergleichen.",
    noHistoryHere:
      "Für den angezeigten Ordner ist noch nichts gespeichert. Stattdessen wird der Verlauf eines anderen Ordners gezeigt.",
    needTwo: "Bisher nur ein Snapshot. Ein Verlauf braucht einen zweiten zum Vergleichen.",
    columnPeriod: "Zwischen",
    columnElapsed: "Vergangen",
    columnChange: "Änderung in {measure}",
    columnAfter: "Danach",
    days: "{days} T",
    unchanged: "unverändert",
    stepTitle: "Diese beiden Snapshots vergleichen und sehen, welche Ordner dafür verantwortlich sind",
    openPoint: "Snapshot öffnen",
  },

  diff: {
    title: "Was sich geändert hat",
    from: "Von",
    to: "Bis",
    total: "Gesamt",
    change: "Änderung",
    nothingChanged: "Nichts hat sich um mehr als den Schwellenwert geändert.",
    columnStatus: "Status",
    columnNow: "Jetzt",
    columnPath: "Pfad",
    passThroughNote:
      "Ordner, die eine Änderung nur durchreichen, werden übersprungen: Die angezeigte Zeile ist die erste Ebene, auf der sich die Änderung tatsächlich verteilt.",
  },

  save: {
    title: "Diesen Scan speichern",
    folder: "Ordner",
    label: "Bezeichnung",
    labelPlaceholder: "optional, z. B. vor dem Aufräumen",
    labelHint:
      "Ein Name, an dem Sie ihn in der Snapshot-Liste wiedererkennen. Verglichen wird zwischen Snapshots desselben Ordners, deshalb hilft eine Angabe zum Wann oder Warum mehr als ein Datum — das Datum wird ohnehin festgehalten.",
    storing: "Wird gespeichert…",
    confirm: "Snapshot speichern",
  },

  trash: {
    titleOne: "{name} in den Papierkorb verschieben?",
    titleMany: "{count} Objekte in den Papierkorb verschieben?",
    andMore: "und {count} weitere",
    leavesOne:
      "Es verlässt diesen Ordner sofort. Der Speicherplatz kommt zurück, wenn Sie den Papierkorb leeren, denn der Papierkorb liegt auf demselben Dateisystem.",
    leavesMany:
      "Sie verlassen diesen Ordner sofort. Der Speicherplatz kommt zurück, wenn Sie den Papierkorb leeren, denn der Papierkorb liegt auf demselben Dateisystem.",
    confirmOne: "In den Papierkorb verschieben",
    confirmMany: "{count} Objekte verschieben",
  },

  about: {
    title: "Über spacetrace",
    version: "Version",
    build: "Build",
    built: "Erstellt",
    channel: "Kanal",
    licence: "Lizenz",
    licenceNote:
      "Scanner, Snapshot-Speicher und Kommandozeile stehen unter Apache-2.0. Diese App ist proprietär.",
    website: "Website",
    sourceCode: "Quellcode",
    whatsNew: "Was ist neu",
    noChanges: "Für diese Version ist noch nichts vermerkt.",
    milestone: "Entwicklungsmeilenstein",
    kinds: {
      added: "Hinzugefügt",
      changed: "Geändert",
      performance: "Leistung",
      fixed: "Behoben",
      removed: "Entfernt",
      security: "Sicherheit",
    },
  },

  update: {
    available: "Version {version} ist verfügbar",
    availableDetail: "Sie verwenden {current}.",
    seeWhatsNew: "Änderungen ansehen",
    install: "Aktualisieren und neu starten",
    installing: "Wird heruntergeladen…",
    later: "Jetzt nicht",
    failed: "Das Update konnte nicht installiert werden",
    upToDate: "spacetrace ist aktuell",
    checking: "Wird geprüft…",
    check: "Nach Updates suchen",
    notOnReleaseChannel:
      "Dies ist ein Entwicklungs-Build, es gibt also nichts, worauf aktualisiert werden könnte.",
  },
};

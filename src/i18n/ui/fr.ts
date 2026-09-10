import type { Dictionary } from "./en";

export const fr: Dictionary = {
  common: {
    cancel: "Annuler",
    close: "Fermer",
    reload: "Recharger",
    browse: "Parcourir…",
    dismiss: "Ignorer",
    files: "Fichiers",
    folders: "Dossiers",
    entries: "Entrées",
    unreadable: "Illisible",
    /** Where there is no number to show. */
    nothing: "—",
  },

  time: {
    justNow: "à l'instant",
  },

  language: {
    label: "Langue",
    note: "La ligne de commande et l'agent restent en anglais : une commande traduite ne s'exécuterait pas.",
  },

  basis: {
    onDisk: "Sur le disque",
    logical: "Logique",
    onDiskNote:
      "Blocs réellement alloués, y compris ce que coûtent les dossiers eux-mêmes. C'est la mesure qui correspond à l'espace manquant sur le disque.",
    logicalNote:
      "La longueur que chaque fichier déclare. Les fichiers creux déclarent plus qu'ils ne contiennent, ce qui peut surestimer un disque de très loin.",
    measureBy: "Base de mesure des tailles",
    sparse: "creux",
    sparseNote:
      "Un fichier creux : il déclare une longueur qu'il n'a pas allouée, il occupe donc bien moins de place qu'il ne le prétend.",
    roundedNote:
      "Les fichiers sont alloués par blocs entiers, celui-ci occupe donc un peu plus que sa longueur.",
  },

  /** What each category tends to hold. The identifiers themselves are not
   *  translated — they are the same strings the scanner uses. */
  categories: {
    directory: "dossier",
    image: "photos et images",
    video: "fichiers vidéo",
    audio: "musique et audio",
    document: "documents et texte",
    archive: "archives et images disque",
    code: "sources et configuration",
    binary: "exécutables et bibliothèques",
    cache: "journaux, caches et fichiers temporaires",
    other: "tout le reste",
  },

  toolbar: {
    tagline: "l'utilisation du disque dans le temps",
    scanFolder: "Analyser un dossier…",
    snapshots: "Instantanés…",
    remoteAgent: "Agent distant…",
    rescan: "Réanalyser",
    rescanTitle: "Analyser à nouveau ce dossier",
    saveSnapshot: "Enregistrer l'instantané…",
    saveSnapshotTitle:
      "Conserver cette analyse pour pouvoir la comparer plus tard",
    saveBlockedTitle:
      "Des entrées ont été mises à la corbeille depuis cette analyse, elle ne correspond donc plus au disque. Réanalysez pour enregistrer le résultat.",
    resetZoom: "Réinitialiser le zoom",
    resetZoomTitle: "Revenir au sommet de cette analyse",
    about: "À propos",
    aboutTitle: "Version, licences et nouveautés",
  },

  capacity: {
    liveTitle:
      "Espace libre sur ce système de fichiers. Cliquez pour le mesurer à nouveau.",
    snapshotTitle: "Espace libre tel qu'il était lors de cet instantané.",
    freeOf: "libres sur {total}",
  },

  source: {
    liveScan: "analyse en direct",
    snapshot: "instantané #{id} · {when}",
    files: "fichiers",
    entries: "entrées",
    unreadable: "{count} illisibles",
    unreadableTitle: "Les chemins illisibles sont comptés, pas ignorés",
  },

  map: {
    crumbHint: "double-cliquez pour zoomer · retour arrière pour remonter",
    layingOut: "mise en place…",
    moreInside: "⠿ = plus d'éléments à l'intérieur que ce qui est affiché",
    tooltipFiles: "{count} fichiers",
  },

  tree: {
    sparseTitle: "Creux : {claimed} déclarés, {allocated} alloués",
    sidebarWidth: "Largeur de la liste des dossiers",
    inspectorWidth: "Largeur du panneau de détails",
    resizeHint: "{label} — faites glisser, ou double-cliquez pour réinitialiser",
  },

  progress: {
    scanning: "Analyse de {folder}",
    storing: "Enregistrement de cette analyse",
    movingCount: {
      one: "Mise à la corbeille d'un élément",
      other: "Mise à la corbeille de {count} éléments",
    },
    movingNamed: "Mise à la corbeille de {name}",
    stopping: "arrêt en cours",
    stop: "Arrêter",
    stopInProgress: "Arrêt…",
    entries: "{count} entrées",
    unreadable: "{count} illisibles",
    doneOf: "{done} sur {total}",
    fromLastScan: "estimé d'après votre dernière analyse de ce dossier",
    firstScan:
      "première analyse de ce dossier, il n'y a donc aucune base d'estimation",
    finishing: "Finalisation",
    finishingNote: "recherche des clones en copie sur écriture, pour ne pas compter deux fois la taille sur le disque",
    clonesChecked: "{count} clones candidats vérifiés",
    stalled: "Aucune progression depuis {seconds} s",
    stalledOn: "Aucune progression depuis {seconds} s — en attente de {path}",
    stalledAndMore: "{path} (+{count} autres)",
    oneTransaction:
      "écrit en une seule transaction, la progression ne peut donc pas être indiquée",
  },

  inspector: {
    nothingSelected: "Aucune sélection",
    nothingHint:
      "Cliquez sur une ligne ou un rectangle pour l'inspecter. Maintenez ⌘ pour ajouter à la sélection, ou ⇧ pour prendre une suite de lignes. Clic droit pour voir ce qu'il est possible d'en faire.",
    thisScan: "Cette analyse",
    unreadablePaths: "{count} chemins",
    couldNotRead: "Chemins qui n'ont pas pu être lus",
    selectedCount: "{count} sélectionnés",
    shareOfScan: "{share} de cette analyse, {basis}",
    largestOfThem: "Le plus grand d'entre eux",
    moveManyToTrash: "Mettre {count} éléments à la corbeille…",
    selection: "Sélection",
    scanRoot: "la racine de l'analyse",
    share: "Part",
    type: "Type",
    mostly: "Principalement",
    modified: "Modifié",
    fullPath: "Chemin complet",
    showInFileManager: "Afficher dans le gestionnaire de fichiers",
    moveToTrash: "Mettre à la corbeille…",
    snapshotNote:
      "Ceci est un instantané enregistré, pas le système de fichiers réel : aucune action n'est possible sur les fichiers. Analysez à nouveau le dossier pour travailler dessus.",
  },

  menu: {
    openInMap: "Ouvrir dans la carte",
    showInFileManager: "Afficher dans le gestionnaire de fichiers",
    copyPath: "Copier le chemin",
    moveToTrash: "Mettre à la corbeille…",
    moveManyToTrash: "Mettre {count} éléments à la corbeille…",
  },

  toast: {
    scanned: "{folder} analysé",
    scannedDetail:
      "{count} chemins n'ont pas pu être lus ; ils sont comptés, pas ignorés.",
    scanStopped: "Analyse arrêtée",
    scanStoppedDetail: "Rien n'a été modifié.",
    couldNotMove: "Impossible de le mettre à la corbeille",
    storedAsLabel: "Enregistré sous « {label} » (#{id})",
    storedAs: "Enregistré comme instantané #{id}",
    storedDetail:
      "Analysez à nouveau ce dossier plus tard et comparez les deux pour voir ce qui a grossi.",
    nothingLeft: "Plus rien à déplacer",
    nothingLeftDetail: "Ces entrées ont déjà disparu.",
    nothingToMove: "Rien à déplacer",
    nothingToMoveDetail: "Tout ce qui était sélectionné avait déjà disparu.",
    pathCopied: "Chemin copié",
    couldNotCopy: "Impossible de copier le chemin",
    couldNotCopyDetail:
      "Le chemin complet se trouve dans le panneau de droite, où il peut être sélectionné.",
    couldNotOpenFileManager: "Impossible d'ouvrir le gestionnaire de fichiers",
    couldNotStore: "Impossible d'enregistrer cette analyse",
    inTrashOne: "{name} est dans la corbeille",
    inTrashMany: "{count} éléments sont dans la corbeille",
    freedDetail:
      "{size} ont quitté ce dossier. L'espace disque revient quand vous videz la corbeille.",
    redundantDetail:
      " {count} se trouvaient déjà dans un dossier parti avec eux.",
    stayedOne: "{name} est resté où il était",
    stayedUnnamed: "Une entrée",
    stayedMany: "{failed} sur {total} n'ont pas pu être déplacés",
  },

  errors: {
    unknown: "Quelque chose s'est mal passé.",
    stale_generation: "Cette entrée appartient à une analyse qui n'est plus ouverte.",
    scan_cancelled: "L'analyse a été interrompue.",
    nothing_open: "Rien n'est encore ouvert.",
    state_unusable:
      "L'état interne de l'application est inutilisable après un plantage précédent. Redémarrez-la.",
    not_a_directory: "{path} n'est pas un dossier.",
    scan_thread_failed: "L'analyse ne s'est pas terminée.",
    cannot_scan: "{path} n'a pas pu être analysé.",
    cannot_open_database: "La base d'instantanés {db} n'a pas pu être ouverte.",
    cannot_read_database: "La base d'instantanés {db} n'a pas pu être lue.",
    cannot_store_snapshot: "Cette analyse n'a pas pu être enregistrée.",
    cannot_load_snapshot: "L'instantané #{id} n'a pas pu être chargé.",
    already_a_snapshot:
      "Ceci est déjà un instantané enregistré. Analysez le dossier pour en enregistrer un nouveau.",
    counters_unavailable:
      "Les compteurs de cette analyse ne sont pas disponibles, elle ne peut donc pas être enregistrée.",
    edited_since_scan:
      "Des entrées ont été mises à la corbeille depuis cette analyse, qui ne correspond donc plus au disque. Relancez l'analyse pour enregistrer le résultat.",
    operation_did_not_finish: "L'opération ne s'est pas terminée.",
    no_entry: "Il n'y a pas d'entrée {node} dans cette analyse.",
    nothing_to_trash: "Rien n'a été sélectionné à mettre à la corbeille.",
    no_longer_exists: "{path} n'existe plus.",
    cannot_move_to_trash: "{path} n'a pas pu être mis à la corbeille.",
    trash_did_not_finish: "L'opération de mise à la corbeille ne s'est pas terminée.",
    refusing_scan_root:
      "Le dossier depuis lequel l'analyse a commencé ne peut pas être mis à la corbeille.",
    cannot_open_file_manager: "Le gestionnaire de fichiers n'a pas pu être ouvert.",
    cannot_open_settings: "Impossible d'ouvrir Réglages Système.",
    file_manager_failed: "Le gestionnaire de fichiers s'est arrêté avec {status}.",
    remote_failed: "L'agent n'a pas pu être joint.",
    snapshot_not_live:
      "Ceci est un instantané enregistré, pas le système de fichiers en direct. Ouvrez une nouvelle analyse pour agir sur les fichiers.",
    gone_but_not_removed:
      "L'élément a disparu du disque mais n'a pas pu être retiré de l'arborescence. Relancez l'analyse pour être sûr des totaux.",
    trashed_but_view_moved_on:
      "Les entrées ont été mises à la corbeille, mais une autre analyse a été ouverte pendant ce temps, si bien que cette vue n'a pas pu être mise à jour.",
  },

  welcome: {
    headline: "Voyez ce qui remplit vos disques",
    lede: "Analysez un dossier ici, ouvrez un instantané pris plus tôt, ou lisez-en un directement depuis un agent qui tourne sur un serveur ou un NAS.",
    free: "{size} libres",
    ofTotal: "sur {total} sur ce système de fichiers",
    scanAnother: "Analyser un autre dossier…",
    storedSnapshots: "Instantanés enregistrés",
    remoteAgent: "Agent distant",
    promise:
      "L'analyse ne fait que lire. Rien n'est modifié sur les disques analysés, sauf si vous mettez explicitement quelque chose à la corbeille, et cela n'est possible que sur une analyse en direct de cette machine. L'application garde une seule note de son côté : le nombre d'entrées qu'avait chaque dossier la dernière fois, pour que l'analyse suivante puisse afficher un vrai pourcentage.",
  },

  /* Shown before the first scan when macOS would otherwise interrupt it
     with one permission dialog per protected folder. */
  fda: {
    title: "macOS cache certains dossiers à spacetrace",
    body: "Sans l'Accès complet au disque, le Bureau, les Documents, les Téléchargements et d'autres restent invisibles — et macOS redemande pour chacun, au milieu d'une analyse. L'accorder une fois met fin aux deux.",
    open: "Ouvrir Réglages Système",
    relaunch: "Redémarrer l'app",
    after: "Dans la liste qui s'ouvre, ajoutez spacetrace avec + ou cochez-la, puis redémarrez. macOS n'applique le changement qu'à un lancement neuf.",
  },

  scanDialog: {
    title: "Analyser un dossier",
    folder: "Dossier",
    pathPlaceholder: "/Users/you/Projects",
    excludeLabel: "Ignorer les dossiers portant ces noms (séparés par des virgules)",
    oneFileSystem:
      "Rester sur un seul système de fichiers (ignorer les volumes montés)",
    readsOnly:
      "L'analyse ne fait que lire. Les chemins illisibles sont comptés et signalés plutôt qu'ignorés en silence.",
    start: "Analyser",
  },

  snapshots: {
    title: "Instantanés enregistrés",
    databaseLabel: "Base de données des instantanés",
    databaseHint:
      "La même base de données que celle qu'écrit la ligne de commande {command}. Cliquez sur une ligne pour l'ouvrir ; cochez deux lignes pour les comparer.",
    emptyTitle: "Aucun instantané enregistré ici pour le moment.",
    emptyHint:
      "Analysez un dossier, puis utilisez {action} dans la barre d'outils. Une comparaison se fait à partir de deux instantanés du même dossier : le premier vaut donc la peine d'être enregistré avant un nettoyage plutôt qu'après.",
    columnId: "ID",
    columnTaken: "Pris le",
    columnHost: "Hôte",
    columnFiles: "Fichiers",
    columnRoot: "Racine",
    comparing: "Comparaison de #{from} → #{to}",
    selectedForComparison: "{count} sur 2 sélectionnés pour la comparaison",
    compare: "Comparer",
  },

  remote: {
    title: "Ouvrir un instantané distant",
    urlLabel: "URL de l'agent",
    tokenLabel: "Jeton Bearer",
    tokenPlaceholder: "depuis /etc/spacetrace/token",
    list: "Lister les instantanés",
    note: "L'instantané est téléchargé et ouvert exactement comme un instantané local. L'agent ne fait jamais que lire sa machine, rien ici ne peut donc la modifier.",
  },

  diff: {
    title: "Ce qui a changé",
    from: "De",
    to: "À",
    total: "Total",
    change: "Écart",
    nothingChanged: "Rien n'a changé au-delà du seuil.",
    columnStatus: "État",
    columnNow: "Maintenant",
    columnPath: "Chemin",
    passThroughNote:
      "Les dossiers qui ne font que transmettre un changement sont ignorés : la ligne affichée est le premier niveau où le changement se répartit vraiment.",
  },

  save: {
    title: "Enregistrer cette analyse",
    folder: "Dossier",
    label: "Libellé",
    labelPlaceholder: "facultatif, par exemple avant nettoyage",
    labelHint:
      "Un nom pour le reconnaître dans la liste des instantanés. Les comparaisons se font entre instantanés du même dossier : dire quand ou pourquoi aide donc plus qu'une date — la date est enregistrée de toute façon.",
    storing: "Enregistrement…",
    confirm: "Enregistrer l'instantané",
  },

  trash: {
    titleOne: "Mettre {name} à la corbeille ?",
    titleMany: "Mettre {count} éléments à la corbeille ?",
    andMore: "et {count} de plus",
    leavesOne: "Il quitte ce dossier maintenant. L'espace disque revient quand vous videz la corbeille, parce que la corbeille est sur le même système de fichiers.",
    leavesMany: "Ils quittent ce dossier maintenant. L'espace disque revient quand vous videz la corbeille, parce que la corbeille est sur le même système de fichiers.",
    confirmOne: "Mettre à la corbeille",
    confirmMany: "Mettre {count} éléments",
  },

  about: {
    title: "À propos de spacetrace",
    version: "Version",
    build: "Build",
    built: "Compilé le",
    channel: "Canal",
    licence: "Licence",
    licenceNote:
      "Le scanner, le magasin d'instantanés et la ligne de commande sont sous Apache-2.0. Cette application est propriétaire.",
    website: "Site web",
    sourceCode: "Code source",
    whatsNew: "Nouveautés",
    noChanges: "Rien n'a encore été consigné pour cette version.",
    milestone: "jalon de développement",
    kinds: {
      added: "Ajouté",
      changed: "Modifié",
      performance: "Performance",
      fixed: "Corrigé",
      removed: "Supprimé",
      security: "Sécurité",
    },
  },

  update: {
    available: "La version {version} est disponible",
    availableDetail: "Vous êtes en {current}.",
    seeWhatsNew: "Voir ce qui a changé",
    install: "Mettre à jour et redémarrer",
    installing: "Téléchargement…",
    later: "Pas maintenant",
    failed: "Impossible d'installer la mise à jour",
    upToDate: "spacetrace est à jour",
    checking: "Vérification…",
    check: "Rechercher des mises à jour",
    notOnReleaseChannel:
      "Ceci est une version de développement, il n'y a donc rien vers quoi mettre à jour.",
  },
};

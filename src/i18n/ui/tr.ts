import type { Dictionary } from "./en";

export const tr: Dictionary = {
  common: {
    cancel: "Vazgeç",
    close: "Kapat",
    reload: "Yeniden yükle",
    browse: "Göz at…",
    dismiss: "Kapat",
    files: "Dosyalar",
    folders: "Klasörler",
    entries: "Girdiler",
    unreadable: "Okunamayan",
    /** Where there is no number to show. */
    nothing: "—",
  },

  time: {
    justNow: "az önce",
  },

  language: {
    label: "Dil",
    note: "Komut satırı ve ajan İngilizce kalır: çevrilmiş bir komut çalışmaz.",
  },

  basis: {
    onDisk: "Diskte",
    logical: "Mantıksal",
    onDiskNote:
      "Gerçekten ayrılan bloklar; klasörlerin kendisinin götürdüğü yer de dâhil. Diskten eksilen alanı veren ölçü budur.",
    logicalNote:
      "Her dosyanın bildirdiği uzunluk. Seyrek dosyalar tuttuklarından fazlasını bildirir, bu yüzden bu ölçü bir diski fazlasıyla abartabilir.",
    measureBy: "Boyutları şuna göre ölç",
    sparse: "seyrek",
    sparseNote:
      "Seyrek bir dosya: ayırmadığı bir uzunluk bildiriyor, yani iddia ettiğinden çok daha az yer kaplıyor.",
    roundedNote:
      "Dosyalar tam bloklar hâlinde ayrılır, bu yüzden bu dosya uzunluğundan biraz fazla yer kaplıyor.",
  },

  /** What each category tends to hold. The identifiers themselves are not
   *  translated — they are the same strings the scanner uses. */
  categories: {
    directory: "klasör",
    image: "fotoğraf ve grafikler",
    video: "video dosyaları",
    audio: "müzik ve ses",
    document: "belgeler ve metinler",
    archive: "arşivler ve disk imajları",
    code: "kaynak kodu ve yapılandırma",
    binary: "çalıştırılabilirler ve kütüphaneler",
    cache: "günlükler, önbellekler ve geçici dosyalar",
    other: "diğer her şey",
  },

  toolbar: {
    tagline: "zaman içinde disk kullanımı",
    scanFolder: "Klasör tara…",
    snapshots: "Anlık görüntüler…",
    remoteAgent: "Uzak ajan…",
    rescan: "Yeniden tara",
    rescanTitle: "Bu klasörü yeniden tara",
    saveSnapshot: "Anlık görüntü kaydet…",
    saveSnapshotTitle: "Sonradan karşılaştırabilmek için bu taramayı sakla",
    saveBlockedTitle:
      "Bu taramadan sonra bazı girdiler Çöp Kutusuna taşındı, yani tarama artık diskle uyuşmuyor. Sonucu saklamak için yeniden tarayın.",
    resetZoom: "Yakınlaştırmayı sıfırla",
    resetZoomTitle: "Bu taramanın en üstüne dön",
    about: "Hakkında",
    aboutTitle: "Sürüm, lisanslar ve neyin değiştiği",
  },

  capacity: {
    liveTitle: "Bu dosya sistemindeki boş alan. Yeniden ölçmek için tıklayın.",
    snapshotTitle: "Bu anlık görüntü alındığındaki boş alan.",
    freeOf: "boş ({total} içinde)",
  },

  source: {
    liveScan: "canlı tarama",
    snapshot: "anlık görüntü #{id} · {when}",
    files: "dosya",
    entries: "girdi",
    unreadable: "{count} okunamayan",
    unreadableTitle: "Okunamayan yollar atlanmaz, sayılır",
  },

  map: {
    crumbHint: "yakınlaşmak için çift tıklayın · yukarı çıkmak için backspace",
    layingOut: "yerleşim hesaplanıyor…",
    moreInside: "⠿ = içinde görünenden fazlası var",
    tooltipFiles: "{count} dosya",
  },

  tree: {
    sparseTitle: "Seyrek: {claimed} iddia ediliyor, {allocated} ayrılmış",
    sidebarWidth: "Klasör listesi genişliği",
    inspectorWidth: "Ayrıntılar paneli genişliği",
    resizeHint: "{label} — sürükleyin, sıfırlamak için çift tıklayın",
  },

  progress: {
    scanning: "{folder} taranıyor",
    storing: "Bu tarama saklanıyor",
    movingCount: {
      one: "1 öğe Çöp Kutusuna taşınıyor",
      other: "{count} öğe Çöp Kutusuna taşınıyor",
    },
    movingNamed: "{name} Çöp Kutusuna taşınıyor",
    stopping: "durduruluyor",
    stop: "Durdur",
    stopInProgress: "Durduruluyor…",
    entries: "{count} girdi",
    unreadable: "{count} okunamayan",
    doneOf: "{total} içinden {done}",
    fromLastScan: "bu klasörün son taramasından tahmin edildi",
    firstScan: "bu klasörün ilk taraması, yani tahmin yürütecek bir dayanak yok",
    oneTransaction: "tek bir işlemde yazılıyor, bu yüzden ilerleme bildiremiyor",
  },

  inspector: {
    nothingSelected: "Hiçbir şey seçilmedi",
    nothingHint:
      "İncelemek için bir satıra ya da dikdörtgene tıklayın. Seçime eklemek için ⌘, art arda gelen satırları almak için ⇧ tuşunu basılı tutun. Neler yapılabileceğini görmek için sağ tıklayın.",
    thisScan: "Bu tarama",
    unreadablePaths: "{count} yol",
    couldNotRead: "Okunamayan yollar",
    selectedCount: "{count} seçili",
    shareOfScan: "bu taramanın {share} kadarı, {basis}",
    largestOfThem: "İçlerinde en büyüğü",
    moveManyToTrash: "{count} öğeyi Çöp Kutusuna Taşı…",
    selection: "Seçim",
    scanRoot: "tarama kökü",
    share: "Pay",
    type: "Tür",
    mostly: "Çoğunlukla",
    modified: "Değiştirilme",
    fullPath: "Tam yol",
    showInFileManager: "Dosya yöneticisinde göster",
    moveToTrash: "Çöp Kutusuna Taşı…",
    snapshotNote:
      "Bu, canlı dosya sistemi değil, saklanmış bir anlık görüntü; bu yüzden dosyalar üzerinde işlem yapılamaz. Üzerinde çalışmak için klasörü yeniden tarayın.",
  },

  menu: {
    openInMap: "Haritada aç",
    showInFileManager: "Dosya yöneticisinde göster",
    copyPath: "Yolu kopyala",
    moveToTrash: "Çöp Kutusuna Taşı…",
    moveManyToTrash: "{count} öğeyi Çöp Kutusuna Taşı…",
  },

  toast: {
    scanned: "{folder} tarandı",
    scannedDetail:
      "{count} yol okunamadı; bunlar atlanmadı, sayıldı.",
    scanStopped: "Tarama durduruldu",
    scanStoppedDetail: "Hiçbir şey değiştirilmedi.",
    couldNotMove: "Çöp Kutusuna taşınamadı",
    storedAsLabel: "“{label}” olarak saklandı (#{id})",
    storedAs: "#{id} numaralı anlık görüntü olarak saklandı",
    storedDetail:
      "Bu klasörü sonra yeniden tarayın ve neyin büyüdüğünü görmek için ikisini karşılaştırın.",
    nothingLeft: "Taşınacak bir şey kalmadı",
    nothingLeftDetail: "O girdiler zaten yok.",
    nothingToMove: "Taşınacak bir şey yok",
    nothingToMoveDetail: "Seçilenlerin hepsi zaten yoktu.",
    pathCopied: "Yol kopyalandı",
    couldNotCopy: "Yol kopyalanamadı",
    couldNotCopyDetail:
      "Tam yol sağdaki panelde duruyor, oradan seçebilirsiniz.",
    couldNotOpenFileManager: "Dosya yöneticisi açılamadı",
    couldNotStore: "Bu tarama saklanamadı",
    inTrashOne: "{name} Çöp Kutusunda",
    inTrashMany: "{count} öğe Çöp Kutusunda",
    freedDetail:
      "{size} bu klasörden çıktı. Disk alanı, Çöp Kutusunu boşalttığınızda geri gelir.",
    redundantDetail: " {count} tanesi zaten birlikte giden bir klasörün içindeydi.",
    stayedOne: "{name} olduğu yerde kaldı",
    stayedUnnamed: "Bir girdi",
    stayedMany: "{total} öğeden {failed} tanesi taşınamadı",
  },

  errors: {
    unknown: "Bir şeyler ters gitti.",
    stale_generation: "Bu girdi artık açık olmayan bir taramaya ait.",
    scan_cancelled: "Tarama durduruldu.",
    nothing_open: "Henüz hiçbir şey açık değil.",
    state_unusable:
      "Uygulamanın iç durumu daha önceki bir çökme yüzünden kullanılamaz hâlde. Yeniden başlatın.",
    not_a_directory: "{path} bir klasör değil.",
    scan_thread_failed: "Tarama tamamlanamadı.",
    cannot_scan: "{path} taranamadı.",
    cannot_open_database: "Anlık görüntü veritabanı {db} açılamadı.",
    cannot_read_database: "Anlık görüntü veritabanı {db} okunamadı.",
    cannot_store_snapshot: "Bu tarama saklanamadı.",
    cannot_load_snapshot: "#{id} numaralı anlık görüntü yüklenemedi.",
    already_a_snapshot:
      "Bu zaten saklanmış bir anlık görüntü. Yenisini saklamak için klasörü tarayın.",
    counters_unavailable:
      "Bu taramanın sayaçları elde olmadığı için saklanamıyor.",
    edited_since_scan:
      "Bu taramadan sonra girdiler Çöp Kutusuna taşındı, yani tarama artık diskle uyuşmuyor. Sonucu saklamak için yeniden tarayın.",
    operation_did_not_finish: "İşlem tamamlanamadı.",
    no_entry: "Bu taramada {node} diye bir girdi yok.",
    nothing_to_trash: "Çöp Kutusuna taşınacak bir şey seçilmedi.",
    no_longer_exists: "{path} artık yok.",
    cannot_move_to_trash: "{path} Çöp Kutusuna taşınamadı.",
    trash_did_not_finish: "Çöp Kutusu işlemi tamamlanamadı.",
    refusing_scan_root: "Taramanın başladığı klasör Çöp Kutusuna taşınamaz.",
    cannot_open_file_manager: "Dosya yöneticisi açılamadı.",
    cannot_open_settings: "Sistem Ayarları açılamadı.",
    file_manager_failed: "Dosya yöneticisi {status} ile çıktı.",
    remote_failed: "Ajana ulaşılamadı.",
    snapshot_not_live:
      "Bu saklanmış bir anlık görüntü, canlı dosya sistemi değil. Dosyalar üzerinde işlem yapmak için yeni bir tarama açın.",
    gone_but_not_removed:
      "Diskten gitti ama ağaçtan çıkarılamadı. Toplamlardan emin olmak için yeniden tarayın.",
    trashed_but_view_moved_on:
      "Girdiler Çöp Kutusuna taşındı, ama bu sırada başka bir tarama açıldığı için bu görünüm güncellenemedi.",
  },

  welcome: {
    headline: "Disklerinizi neyin doldurduğunu görün",
    lede: "Buradan bir klasör tarayın, daha önce aldığınız bir anlık görüntüyü açın ya da bir sunucuda veya NAS'ta çalışan bir ajandan doğrudan okuyun.",
    free: "{size} boş",
    ofTotal: "bu dosya sistemindeki {total} içinde",
    scanAnother: "Başka bir klasör tara…",
    storedSnapshots: "Saklanan anlık görüntüler",
    remoteAgent: "Uzak ajan",
    promise:
      "Tarama yalnızca okur. Siz açıkça bir şeyi Çöp Kutusuna taşımadıkça taradığınız disklerde hiçbir şey değişmez, bu da yalnızca bu makinenin canlı taramasında mümkündür. Uygulama kendine ait tek bir not tutar: her klasörde geçen sefer kaç girdi olduğunu — böylece o klasörün bir sonraki taraması gerçek bir yüzde gösterebilsin.",
  },

  /* Shown before the first scan when macOS would otherwise interrupt it
     with one permission dialog per protected folder. */
  fda: {
    title: "macOS bazı klasörleri spacetrace'ten gizliyor",
    body: "Full Disk Access olmadan Masaüstü, Belgeler, İndirilenler ve diğerleri görünmez kalıyor — ve macOS her biri için, tarama ortasında yeniden soruyor. Bir kez vermek ikisini de bitiriyor.",
    open: "Sistem Ayarları'nı aç",
    relaunch: "Uygulamayı yeniden başlat",
    after: "Açılan listede + ile spacetrace'i ekleyin ya da işaretleyin, sonra yeniden başlatın. macOS değişikliği yalnızca yeni bir açılışa uyguluyor.",
  },

  scanDialog: {
    title: "Bir klasör tarayın",
    folder: "Klasör",
    pathPlaceholder: "/Users/you/Projects",
    excludeLabel: "Şu adlardaki klasörleri atla (virgülle ayırın)",
    oneFileSystem: "Tek dosya sisteminde kal (bağlı birimleri atla)",
    readsOnly:
      "Tarama yalnızca okur. Okunamayan yollar sessizce atlanmaz; sayılır ve bildirilir.",
    start: "Tara",
  },

  snapshots: {
    title: "Saklanan anlık görüntüler",
    databaseLabel: "Anlık görüntü veritabanı",
    databaseHint:
      "{command} komut satırının yazdığı veritabanının aynısı. Açmak için bir satıra tıklayın; karşılaştırmak için iki satırı işaretleyin.",
    emptyTitle: "Burada henüz saklanmış anlık görüntü yok.",
    emptyHint:
      "Bir klasör tarayın, sonra araç çubuğundaki {action} seçeneğini kullanın. Karşılaştırma, aynı klasörün iki anlık görüntüsünden çıkar; bu yüzden ilkini bir temizlikten sonra değil, öncesinde saklamaya değer.",
    columnId: "Kimlik",
    columnTaken: "Alındığı zaman",
    columnHost: "Makine",
    columnFiles: "Dosyalar",
    columnRoot: "Kök",
    comparing: "#{from} → #{to} karşılaştırılıyor",
    selectedForComparison: "Karşılaştırma için 2 satırdan {count} tanesi seçildi",
    compare: "Karşılaştır",
  },

  remote: {
    title: "Uzak bir anlık görüntü aç",
    urlLabel: "Ajan adresi",
    tokenLabel: "Bearer token",
    tokenPlaceholder: "/etc/spacetrace/token dosyasından",
    list: "Anlık görüntüleri listele",
    note: "Anlık görüntü indirilir ve tıpkı yerel bir tanesi gibi açılır. Ajan kendi makinesini yalnızca okur, bu yüzden buradan hiçbir şey onu değiştiremez.",
  },

  diff: {
    title: "Neler değişti",
    from: "Başlangıç",
    to: "Bitiş",
    total: "Toplam",
    change: "Değişim",
    nothingChanged: "Hiçbir şey eşiğin ötesinde değişmedi.",
    columnStatus: "Durum",
    columnNow: "Şimdi",
    columnPath: "Yol",
    passThroughNote:
      "Bir değişimi yalnızca kendinden aşağı aktaran klasörler atlanır: gördüğünüz satır, değişimin gerçekten dağıldığı ilk seviyedir.",
  },

  save: {
    title: "Bu taramayı sakla",
    folder: "Klasör",
    label: "Etiket",
    labelPlaceholder: "isteğe bağlı, örn. temizlikten önce",
    labelHint:
      "Anlık görüntü listesinde tanıyabilmeniz için bir ad. Karşılaştırmalar aynı klasörün anlık görüntüleri arasında yapılır; bu yüzden ne zaman ya da neden alındığını söyleyen bir ad tarihten daha çok işe yarar — tarih zaten kaydediliyor.",
    storing: "Saklanıyor…",
    confirm: "Anlık görüntüyü sakla",
  },

  trash: {
    titleOne: "{name} Çöp Kutusuna taşınsın mı?",
    titleMany: "{count} öğe Çöp Kutusuna taşınsın mı?",
    andMore: "ve {count} tane daha",
    leavesOne: "Bu klasörden hemen çıkar. Çöp Kutusu aynı dosya sisteminde olduğu için disk alanı ancak Çöp Kutusunu boşalttığınızda geri gelir.",
    leavesMany: "Bu klasörden hemen çıkarlar. Çöp Kutusu aynı dosya sisteminde olduğu için disk alanı ancak Çöp Kutusunu boşalttığınızda geri gelir.",
    confirmOne: "Çöp Kutusuna Taşı",
    confirmMany: "{count} öğeyi taşı",
  },

  about: {
    title: "spacetrace hakkında",
    version: "Sürüm",
    build: "Yapı",
    built: "Derlenme",
    channel: "Kanal",
    licence: "Lisans",
    licenceNote:
      "Tarama motoru, anlık görüntü deposu ve komut satırı Apache-2.0 lisanslıdır. Bu uygulama tescillidir.",
    website: "Web sitesi",
    sourceCode: "Kaynak kodu",
    whatsNew: "Yenilikler",
    noChanges: "Bu sürüm için henüz bir kayıt yok.",
    milestone: "geliştirme kilometre taşı",
    kinds: {
      added: "Eklenenler",
      changed: "Değişenler",
      performance: "Performans",
      fixed: "Düzeltilenler",
      removed: "Kaldırılanlar",
      security: "Güvenlik",
    },
  },

  update: {
    available: "{version} sürümü yayımlandı",
    availableDetail: "Şu anda {current} sürümündesiniz.",
    seeWhatsNew: "Neyin değiştiğine bakın",
    install: "Güncelle ve yeniden başlat",
    installing: "İndiriliyor…",
    later: "Şimdi değil",
    failed: "Güncelleme kurulamadı",
    upToDate: "spacetrace güncel",
    checking: "Denetleniyor…",
    check: "Güncellemeleri denetle",
    notOnReleaseChannel:
      "Bu bir geliştirme yapısı, bu yüzden güncellenecek bir şey yok.",
  },
};

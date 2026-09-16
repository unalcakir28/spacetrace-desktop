# spacetrace masaüstü — Claude için proje notları

Tauri v2 + React penceresi: tarayıcıyı çağırır, ağacı çizer, snapshot kaydeder.
**Tarayıcı, ağaç modeli ve yerleşim burada değil** —
[unalcakir28/spacetrace](https://github.com/unalcakir28/spacetrace) çekirdek
deposunda, git bağımlılığı olarak alınıyor.

Zaten iyi anlatılmış olanı tekrarlamıyorum: [README.md](README.md) ince kabuk
gerekçesini, silme akışının üç inceliğini, ilerleme tahmininin dürüstlüğünü,
`OnDisk`/`Logical` tablosunu, görsel dili ve açıklamalı dosya ağacını tutuyor;
[RELEASING.md](RELEASING.md) kanal tablosunu, beş sabit indirme dosya adını ve
updater anahtarı hikâyesini tutuyor. Yol haritası ve fazlar arası kararlar
çekirdek deponun `TODO.md` ve `docs/DECISIONS.md` dosyalarında — commit
mesajlarındaki `C3`, `B5`, `K10` gibi kodlar oraya işaret ediyor.

Bu dosya yalnızca **ikisinde de yazmayan, sessizce bozulabilen** şeyleri
anlatıyor.

## Komutlar

```bash
yarn install --frozen-lockfile   # CI böyle kuruyor; yarn 1.x
yarn tauri dev                   # tam uygulama, hot reload
yarn dev                         # yalnızca Vite (port 5173, strictPort)

# CI'ın koştuğu her şey. İlk üçü lint job'ında, bu sırayla (ubuntu-24.04);
# cargo test AYRI ve paralel bir job, yalnızca macos-latest'te.
yarn check:plugins               # plugin sürüm uyumu — aşağı bak
yarn typecheck                   # tsc --noEmit
yarn build                       # tsc --noEmit && vite build
cd src-tauri && cargo fmt --all --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test

yarn tauri build                 # paketle
```

Rust 1.85+ (`src-tauri/Cargo.toml`), Node 22 (CI'da sabit; `packageManager` ve
`.nvmrc` **yok**, yarn yalnızca lockfile'dan anlaşılıyor). Tauri CLI ve API
2.11.0.

**`yarn build` her `cargo` komutundan önce şart, `cargo test` dâhil.**
`generate_context!` paket yapılandırmasını derleme anında okuyor ve
`frontendDist` (`../dist`) yokken genişlemeyi reddediyor; `dist/` gitignore'da.
Temiz bir klonda doğrudan `cargo test` çalışmaz — hata da "frontend derlenmedi"
demez.

Tasarımı uygulamayı açmadan görmek için `design-preview.html`
(`?scene=welcome|scan|tree|trash`, varsayılan `tree`; `trash` şu an `tree`
ile aynı çiziyor, hiçbir dal ona bakmıyor); Vite dev sunucusundan servis
ediliyor.

**ESLint, Prettier, JS test koşucusu yok.** JS tarafında "lint" `tsc`'den
ibaret. Bu bir eksiklik değil, bir sonucu var: aşağıdaki IPC yazım kuralı
**Rust'tan**, TypeScript kaynağını metin olarak okuyarak zorlanıyor
(`src-tauri/tests/wire_names.rs`). Frontend'e dair bir kural koyacaksan onu da
oraya koy.

## Çekirdek bağımlılığı: pin yalnızca Cargo.lock'ta

`src-tauri/Cargo.toml` altı çekirdek crate'i **rev, branch ya da tag
olmadan** git'ten alıyor (path değil — K2 gereği iki depo gerçekten bağımsız
kalsın diye):

```toml
spacetrace-scan-core = { git = "https://github.com/unalcakir28/spacetrace" }
# ve store, diff, treemap, changelog, buildinfo
```

Yani **tek pin `src-tauri/Cargo.lock`**. Sonuçları:

- `cargo update` **uzak deponun `main`'ini** çözüyor — yanındaki
  `../spacetrace` checkout'u bu işe hiç karışmıyor, yani riski yereldeki
  commit'ler değil, push edilmiş olanlar yaratıyor. Pin ilerletmek bilinçli
  bir iş; komutu çekirdek deponun `release` becerisinde yazılı
  (`cargo update -p spacetrace-scan-core -p spacetrace-store -p spacetrace-changelog`).
  Commit çoğunlukla `Cargo.lock` + `CHANGELOG.md`, ama API değiştiyse
  `lib.rs`'e de dokunuyor — üç pin commit'inin ikisi öyle.
- Sürüm iş akışı bu yüzden `cargo fetch --locked` koşuyor: onsuz **tek bir
  etiketin iki derlemesi farklı tarayıcı kodu taşıyabilir**
  (`release.yml` içinde gerekçesi yazılı). `yarn tauri build`'e `--locked`
  geçirilemiyor, çünkü yarn 1 `--`'den önceki her argümanı yutuyor.
- Pin'i ilerletip `CHANGELOG.md`'yi üretmezsen `src-tauri/tests/changelog.rs`
  kırılıyor. **Bu test aynı zamanda pin muhafızı** — kırıldığında "changelog
  bayat" değil, "çekirdek ilerledi" diye oku.
- Çekirdeğin genel API'sini bozan değişikliği bu deponun CI'ı görmüyor;
  oradaki `downstream-api-guard` ajanı tam bunun için var.

## Bozulmaması gereken şeyler

1. **Yazım yönü: cevaplar camelCase, istekler snake_case.** Cevaplar
   `api.ts` içindeki `camelize()`'dan geçiyor, yani TS arayüzleri camelCase
   olmak zorunda; istekleri serde okuyor, yani **Rust'ın snake_case adlarını**
   taşıyorlar. **İki yön, iki ayrı hata, ve biri yayınlandı:**

   - *Cevap yönü* — bir TS arayüzünde snake_case alan bildirmek kusursuz tip
     denetiminden geçiyor ve çalışma anında her nesneden `undefined` okuyor.
     0.6.1'de böyle yayınlandı: yaş ısı haritasının anahtarı doğru bayt
     rakamlarının yanında altı satır "undefined güne kadar" yazdı.
   - *İstek yönü* — bir istek struct'ına `rename_all = "camelCase"` koymak çok
     kelimeli her alanı sessizce **eksik** bırakıyor, ve eksik bir `Option`
     hata değil `None`. `SunburstRequest`'in ilk hâli tam bunu yaptı; bu yön
     yakalandı, yayınlanmadı.

   Muhafızı `src-tauri/tests/wire_names.rs`; **yalnızca `export interface`
   blokları** denetleniyor ve testin bütün isabeti o sınırda: `camelize`
   *cevabın* anahtarlarını yazıyor. `invoke`'a geçirilen nesne literalleri
   (anahtarları Rust argüman adları) ve locale dosyalarındaki hata kodu
   haritaları **doğru** snake_case, işaretlenmemeleri gerekiyor — testin ilk
   hâli yedisini de işaretledi, bir muhafız böyle kapatılan bir şeye
   dönüşüyor. "Hiçbir şeyle eşleşmedim" durumu `checked > 50` ile
   yakalanıyor.
2. **Hiçbir komut ana thread'i bloklamaz.** `async` olmayan bir
   `#[tauri::command]` UI thread'inde koşuyor. Kural: dosya sistemi ve SQLite
   için `async` + `spawn_blocking`; ödünç alınan `State` gerekiyorsa
   `#[tauri::command(async)]` (34 komuttan 15'i). Senkron kalanlar iş
   yapmayanlar: `cancel_scan`, `default_database`, `build_info`,
   `full_disk_access`, `open_privacy_settings`, `changelog`. Yeni bir komut
   dosya sistemine, veritabanına ya da ağa dokunuyorsa bu listeye girmez.
3. **Düğüm id'leri arena indeksi, her çağrı `generation` taşımak zorunda.**
   Bayat bir id değişmiş bir ağaçta **başka** bir girdiyi adresler.
   `Tree::remove_subtree` kesmiyor, sıfırlıyor — id'ler yerinde düzenlemede
   hayatta kalıyor, `Loaded.hidden` gideni tutuyor.
4. **`AppState.current` bilinçli olarak `RwLock`, `Mutex` değil.** Snapshot
   yazmak tüm ağacı yürüyor (saniyeler); mutex altında her okuma kuyruğa
   girer ve pencere donar.
5. **Plugin sürümleri major.minor uyuşmak zorunda** — Rust crate'i ile npm
   paketi. Uyuşmazlığı **yalnızca `tauri build`** yakalıyor, yani CI yeşil
   geçip sürüm üç platformda patlıyordu. `yarn check:plugins` bu yüzden var;
   düzeltmesi `yarn add --exact @tauri-apps/plugin-<ad>@<rust major.minor.patch>`.
6. **Updater plugin'i koşullu register ediliyor**
   (`app.config().plugins.0.contains_key("updater")`). Düzenlilik değil: imza
   anahtarı yoksa sürüm iş akışı `plugins.updater`'ı yapılandırmadan
   **siliyor**, koşulsuz bir register o durumda pencere açılmadan panic
   ediyor (`invalid type: null, expected struct Config`).
7. **Yetkiler tek dosyada ve tam beş tane**
   (`src-tauri/capabilities/default.json`): `core:default`,
   `dialog:allow-open`, `opener:allow-open-url`, `updater:default`,
   `process:allow-restart`. Daha geniş olan her şey, kodun istemediği hâlde
   pencerenin kullanabileceği bir yetki demek. CSP de açıkça yazılı
   (`tauri.conf.json`).

## Çizim: canvas, LOD sunucuda

`Treemap`, `Sunburst` ve `LiveMap` canvas, DOM değil; DPR ölçeklemesi ve
`requestAnimationFrame` elle. **Web worker yok.** Dördüncü görünüm
`Timeline` bir istisna — SVG, çünkü tek bir çizgi ve canvas'ın kazandıracağı
bir şey yok.

- **Ağaç hiç JS'e geçmiyor.** `treemap` (ve `rings`) çizim sırasında (ebeveyn
  çocuktan önce) **paralel düz sayı dizileri** döndürüyor, alan başına bir
  dizi — nesne dizisinin yaklaşık üçte biri kadar JSON, ve içinde hiç string
  yok. **`live_tiles` bu kuralın dışında**: `LiveTile` kendi `name`'ini
  taşıyor, çünkü canlı harita tarama sürerken adları zaten gösteriyor.
  Etiketler treemap'te ayrı isteniyor ve yalnızca `56×15` pikselden **küçük
  olmayan** döşemeler için (`>=`, yani tam 56×15 etiket alıyor).
- **LOD sunucu tarafında**: `min_area` (varsayılan 6.0, en az 0.5), `padding`,
  isteğe bağlı `max_depth`.
- `age_band` `Option<u8>` değil, `-1` nöbetçili `i8` — option dizisi JS'e
  `(number|null)[]` olarak iniyor ve canvas döngüsüne döşeme başına bir dal
  koyuyordu.
- **Hit-test JS'te kalıyor** (diziler zaten yerel; her `mousemove` için IPC
  turu hiçbir şey kazandırmıyor). Yüklü döşemeler `(root, generation)` ile
  etiketli ve **okuma anında** doğrulanıyor, değişimde temizlenmiyor — yani
  bayat bir döşemenin tıklanabilir olduğu bir aralık yok.
- `basis` (`OnDisk`/`Logical`) uygulama durumu değil, **yerleşim isteğinin
  içinde** gidiyor: uçuşta olan bir yerleşim asla öteki ölçünün rakamlarıyla
  eşlenemiyor.
- Yeniden boyutlandırma `RESIZE_SETTLE = 110` ms sonra yerleşimi kuruyor —
  `Treemap` ve `Sunburst`'te; `LiveMap`'in çıplak bir `ResizeObserver`'ı var,
  debounce yok. Canvas boyutlarının yalnızca gerçekten değiştiyse atanması da
  (atama canvas'ı temizliyor) yalnızca `Treemap`'te korumalı. **İkisi de
  eksiklik, kural değil** — yeni bir görünüm yazarken `Treemap`'i örnek al,
  diğer ikisini değil.

## Platform

- **macOS Full Disk Access sondası**: `…/com.apple.TCC/TCC.db`'yi açmayı
  deniyor, içinden hiçbir şey okumuyor. `PermissionDenied` → false, **başka
  her hata → true** (tahmin üzerine dırdır etmemek için). Windows/Linux'ta
  `None`. `open_privacy_settings` ayarları açıp bilerek orada duruyor.
- `Info.plist` içindeki altı `NS*UsageDescription` **bilerek İngilizce**:
  yerelleştirmek `.lproj` altında `InfoPlist.strings` gerektiriyor, paketleyici
  onları toplamıyor. Çevrilmiş açıklama uygulamanın kendi onboarding
  panelinde, ve OS sormadan **önce** gösteriliyor.
- `reveal_path` üç ayrı yol; Linux'ta taşınabilir bir "bu dosyayı seç" yok,
  ebeveyn dizini `xdg-open` ile açılıyor.
- Linux derleme önkoşulları ve **ubuntu-24.04 runner'ı glibc tabanı için**
  seçildi — deb, rpm ve AppImage üçü de oradan çıkıyor.

## i18n

Beş dil (`en tr it fr de`), kaynak `src/i18n/ui/en.ts` — 449 satırlık
`Dictionary` tipi, diğer dördü ona uyuyor. Locale çözümü: `localStorage`
(`spacetrace.locale`) → `navigator.languages` → `en`. Modül seviyesinde
store + `useSyncExternalStore`; Redux/zustand/context yok, gerçek durum
Rust'ta.

**Backend cümle döndürmez, kod döndürür** (`src-tauri/src/error.rs`) —
kelimelerin sahibi pencere. Locale dosyalarındaki hata kodu haritalarının
snake_case olması bu yüzden bilinçli.

Stil: elle yazılmış tek `src/theme.css` (1863 satır CSS değişkeni). Tailwind,
CSS-in-JS, CSS modules yok. Dosyanın başındaki kural: renk veridir, dokuz
kategori dokuz ton, seçim ve hover ton harcamaz.

## Sürüm

Tam sıra [RELEASING.md](RELEASING.md); elle bozulması kolay kısımlar:

- **Sürüm numarası üç dosyada**: `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json`. `meta` job uyuşmazlıkta sert düşüyor —
  yarım kalmış bir bump bir kez 0.1.0 ikilisinin etrafına v0.2.0 kurucusu
  paketledi.
- **macOS `.app` self-signed, ve Gatekeeper için değil — TCC için.** macOS
  Full Disk Access'i designated requirement'a bağlıyor; ad-hoc imza cdhash'e
  düşüyor, yani her sürüm yeni bir uygulama gibi görünüp verilmiş izin
  sessizce geçersiz oluyordu (10 Eylül 2026 kullanıcı raporu). Keychain
  Tauri'nin `APPLE_CERTIFICATE` yolundan değil, açıkça kuruluyor;
  `openssl pkcs12 -legacy` şart (OpenSSL 3'ün SHA-256 MAC'ini `security
  import` okuyamıyor); sertifika **güvenilir kök** olmak zorunda, yoksa
  `find-identity -v` listelemiyor. Derleme sonrası bir adım
  `certificate root` özetini doğrulayıp uyuşmazsa düşüyor — `leaf` değil
  **`root`**, ve bu ayrım taşıyıcı.
- **`.dmg` bilerek imzasız yeniden üretiliyor.** Güvenilmeyen sertifikayla
  imzalı bir dmg **mount anında** reddediliyor (v0.4.1 regresyonu, macOS
  26.5.2'de ölçüldü); `codesign --remove-signature` disk imajını kabul
  etmiyor, o yüzden `hdiutil convert` ile baştan kuruluyor.
- **`--bundles` `bundle.targets`'ı ezer, eklemez** — v0.3.0'ın macOS updater
  paketi ve dolayısıyla manifesti bu yüzden çıkmadı. macOS matris girdisi
  `app,dmg` yazmak zorunda.
- **Kararlı sürümlerde `--latest=false`.** İndirme deposu üç bileşeni birden
  tutuyor; `gh release create` yoksa GitHub'ın "latest" yerini bir masaüstü
  etiketine veriyor ve `spacetrace update` onu hiç sürüm değilmiş gibi
  ayrıştırıyor (9 Eylül 2026'da hub-v0.3.0 yeri aldı).
- Varlıklar `bundles/` altında toplanıyor, **`dist/` değil** (o Vite'ın
  çıktısı). Beş kurucu dosya adı başka bir depodaki indirme sayfasıyla
  sözleşme; deb ve rpm'in updater yolu **bilerek** yok.
- `paths-ignore` README/RELEASING/tasks/design-preview'ı dışlıyor ama
  **`CHANGELOG.md`'yi bilerek dışlamıyor** — changelog ikiliye derleniyor.
- İkililer çekirdek depoya yayınlanıyor (`RELEASE_TOKEN`); sır yoksa iş akışı
  düşmüyor, bu özel depoya yayınlayıp uyarı basıyor. Etiketler:
  `desktop-continuous`, `desktop-v*`, ve yalnızca `latest.json` tutan
  `desktop-latest`.

## Alışkanlıklar

- **Kod, kullanıcıya görünen dizeler ve yorumlar İngilizce** (çekirdek K1).
  Türkçe kalan: commit mesajları, `RELEASING.md` ve bu dosya. GUI dizeleri
  beş dilde — masaüstü K1'in istisnası (çekirdek `docs/DECISIONS.md` K10).
- Yorum *ne yaptığını* değil **neden öyle yaptığını** anlatır.
- `CHANGELOG.md` **üretiliyor, elle düzenlenmiyor**. Kaynağı çekirdek depodaki
  `crates/changelog/changelog.json`; çekirdek checkout'undan
  `cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md`.
  Sürüm notları da aynı dosyadan `awk` ile dilimleniyor.
- Changelog **ikiliye derleniyor**, indirilmiyor: okunduğu an kendini
  güncelledikten hemen sonra, muhtemelen çevrimdışı. `unreleased` gösterilmiyor
  — kimsenin elinde olmayan kodu duyurmak olurdu.
- `tasks/` gitignore'da; yol haritası çekirdek depoda.
- **Çekirdek deponun `.claude/` araçları burada geçerli değil.** Changelog
  girdisi yazmak hâlâ çekirdek checkout'undan sürülüyor: kaynak
  `crates/changelog/changelog.json` orada.

## Depoda duran Claude araçları

| Araç | Ne zaman |
|------|----------|
| `preflight` (beceri) | Push öncesi; CI iki paralel job'a bölündüğü için elle sırayla koşmak kolay unutuluyor |
| `release` (beceri) | Sürüm kesme; üç dosyada sürüm, ve yayınlananı doğrulama adımları |
| `dist-before-cargo` (hook) | `dist/` yokken derleyen bir cargo komutunu durduruyor |

İkisi de `disable-model-invocation`: kullanıcı `/preflight`, `/release` yazar.

Paylaşılan araçlar `spacetrace-tools` plugin'inden geliyor ve `spacetrace-tools:`
ile adlandırılıyor: `core-pin-guard` (pin ilerletmeden önce çekirdek API
diff'i), `doc-drift-auditor`, `code-reviewer`, `test-writer`, ve üretilen
`CHANGELOG.md`'yi koruyan hook. Plugin **depoda değil**, ana dizindeki
`spacetrace-tooling/` içinde — klonla gelmiyor.

## Testler

Yalnızca Rust, `cd src-tauri && cargo test` (önce `yarn build`):

| Dosya | Ne |
|-------|-----|
| `tests/wire_names.rs` | IPC alan adı yazımı, iki yön; kendi kendini de test ediyor |
| `tests/changelog.rs` | `CHANGELOG.md` tazeliği + masaüstü log'u boş değil |
| `src/*.rs` içi `#[cfg(test)]` | `error`, `history`, `hints`, `lib` |

CI'da test job'ı yalnızca `macos-latest`'te koşuyor.

## Bilinen belge boşlukları

- **`.p12`'nin nasıl üretildiği hiçbir yerde yazılı değil.** İş akışındaki
  uyarı metni "RELEASING.md'de tek komut var" diyor; o komut orada yok ve
  RELEASING.md bunu açıkça eksik olarak işaretliyor. Sertifikayı yenileyen
  kişi oraya yazsın.
- **"Hiçbir şey imzalanmıyor" iddiası dört yere yazılmış ve ikisi hâlâ
  öyle diyor.** `README.md` ile `RELEASING.md` düzeltildi;
  `.github/workflows/release.yml` başlığı ve `src-tauri/Cargo.toml` yorumu
  düzeltilmedi. İmzalama davranışını değiştirirken dördünü birlikte güncelle.
- `RELEASING.md` "`*.md` değişiklikleri iş akışını tetiklemez" diyor;
  `release.yml`'in `paths-ignore`'u yalnızca `README.md` ve `RELEASING.md`'yi
  sayıyor — `CHANGELOG.md` **bilerek** tetikliyor.

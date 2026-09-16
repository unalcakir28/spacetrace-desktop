# Sürüm

Bu depo private (K2), ama kurulum dosyalarının indirme bağlantısı public olmak
zorunda — private bir deponun release varlıkları kimlik doğrulaması olmadan
indirilemiyor. Bu yüzden `.github/workflows/release.yml` burada derliyor,
**public `unalcakir28/spacetrace` deposuna yayınlıyor**.

Tam gerekçe ve üç bileşenin ortak şeması: çekirdek deposundaki
[docs/RELEASING.md](https://github.com/unalcakir28/spacetrace/blob/main/docs/RELEASING.md).

## Ne zaman ne oluyor

| Olay | Sonuç |
|------|-------|
| `main`'e push | public depoda `desktop-continuous` etiketi silinip yeniden oluşturulur |
| `v*` etiketi push | public depoda `desktop-v*` etiketiyle kalıcı sürüm |
| `workflow_dispatch` | derler, yayınlamaz — `publish: true` verilmedikçe (kuru çalışma) |

`*.md`, `tasks/**` ve `design-preview.html` değişiklikleri iş akışını
tetiklemiyor.

Üretilen dosyalar — adları sabit, indirme sayfası bunlara doğrudan bağlanıyor:

```
spacetrace-desktop-<sürüm>-macos-universal.dmg
spacetrace-desktop-<sürüm>-windows-x86_64-setup.exe
spacetrace-desktop-<sürüm>-linux-x86_64.deb
spacetrace-desktop-<sürüm>-linux-x86_64.rpm
spacetrace-desktop-<sürüm>-linux-x86_64.AppImage
SHA256SUMS
```

macOS tek bir **universal** dmg: indirme sayfasında tek bir macOS düğmesi olsun
ve "hangi Mac'im var" kullanıcının problemi olmaktan çıksın diye.

## Gereken tek elle adım

```bash
gh secret set RELEASE_TOKEN --repo unalcakir28/spacetrace-desktop
```

Token: fine-grained PAT, yalnızca `unalcakir28/spacetrace` deposunda
**Contents: Read and write**. Oluşturma adımları çekirdek deposundaki
RELEASING.md içinde.

Sır yoksa iş akışı hata vermez — varlıkları bu private depoda yayınlar ve bir
uyarı basar. Yani bağlantılar public olmaz, başka bir şey bozulmaz.

## İmzalama

**Güvenilir geliştirici sertifikası yok.** macOS ve Windows ilk açılışta uyarı
veriyor; indirme sayfası ne yapılacağını yazıyor ve her dosyanın yanında
`SHA256SUMS` var. Ücretli sertifika yıllık ve bir depoda duramıyor — bilinçli
bir eksik, gizlenen bir şey değil.

**Ama macOS paketi kendinden imzalı sertifikayla imzalanıyor, ve Gatekeeper
için değil — TCC için.** macOS Tam Disk Erişimi'ni designated requirement'a
bağlıyor; ad-hoc imzada öyle bir şey olmadığı için cdhash'e düşüyor ve cdhash
her derlemede değişiyor. Sonuç: kullanıcı izni veriyor, bir sonraki
güncellemede macOS uygulamayı tanımıyor ve baştan soruyor (10 Eylül 2026'da
kullanıcı bildirdi).

İki sır gerekiyor:

```
APPLE_CERTIFICATE            # base64'lenmiş .p12
APPLE_CERTIFICATE_PASSWORD   # .p12 parolası
```

**Sırlar yoksa iş akışı düşmüyor** — eskisi gibi ad-hoc imzalıyor ve izin
sorularının geri geleceğini söyleyen bir uyarı basıyor.

Bilinmesi gereken, hepsi acı çekilerek öğrenilmiş:

- **Sertifika güvenilir kök olmak zorunda.** Tauri kimliği
  `security find-identity -v` ile çözüyor ve o yalnızca *geçerli* kimlikleri
  listeliyor; kendinden imzalı bir sertifika `trustRoot` yapılmadan geçerli
  sayılmıyor. Runner'lar tek kullanımlık, o yüzden her derlemede yeniden
  yapılıyor.
- **Keychain açıkta kuruluyor**, Tauri'nin kendi `APPLE_CERTIFICATE`
  yoluna bırakılmıyor: Tauri sertifikayı görmediğin geçici bir keychain'e
  alıyor ve orada "failed to resolve signing identity" dediğinde elinde
  hiçbir teşhis olmuyor. Derleme adımına `APPLE_CERTIFICATE` **verilmiyor**,
  yoksa Tauri ikinci bir keychain daha kuruyor. `find-identity -v` çıktısı
  bilerek log'a basılıyor.
- `openssl pkcs12 -legacy` şart — OpenSSL 3'ün SHA-256 MAC'ini
  `security import` okuyamıyor.
- Keychain idle kilidi 21600 saniyeye çekiliyor; varsayılan beş dakika ve
  derleme daha uzun sürüyor.
- **Derleme sonrası bir adım paketin requirement'ını doğruluyor** ve
  uyuşmazsa düşüyor. `leaf` değil **`root`** özeti bakılıyor. Sessizce
  ad-hoc'a düşen bir derleme kusursuz kurulur, çalışır ve izin sorularını
  geri getirir — fark edilmeyecek türden bir bozulma olduğu için
  varsayılmıyor, ölçülüyor.
- **`.dmg` bilerek imzasız yeniden üretiliyor.** Güvenilmeyen sertifikayla
  imzalı bir dmg mount anında reddediliyor (v0.4.1, macOS 26.5.2'de
  ölçüldü); `codesign --remove-signature` disk imajını kabul etmediği için
  `hdiutil convert` ile baştan kuruluyor.

> **Eksik:** `.p12`'nin nasıl üretildiği (ortak ad `spacetrace`, kendinden
> imzalı, kod imzalama kullanımı) burada yazılı değil. Sertifikayı yenileyecek
> olan, o adımları buraya yazsın — iş akışındaki uyarı metni "RELEASING.md'de
> tek komut var" diyor ve şu an o komut burada yok.

## Kararlı sürüm kesmek

Sürüm numarası üç yerde:

```
package.json                 "version"
src-tauri/Cargo.toml         version
src-tauri/tauri.conf.json    version
```

Üçünü de güncelle, sonra:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## İkonlar

`src-tauri/icons/icon.svg` kaynak. Türetilmiş dosyalar (`icon.icns`, `icon.ico`,
PNG'ler, Windows Store logoları) depoda duruyor çünkü paketleyici onları
derleme sırasında üretemez. Marka değişirse:

```bash
# SVG'yi 1024×1024 PNG'ye çevir, sonra:
yarn tauri icon /tmp/icon-1024.png
rm -rf src-tauri/icons/android src-tauri/icons/ios   # mobil hedef yok
```

`icon.icns` ve `icon.ico` olmadan dmg ve NSIS paketleri ikonsuz çıkıyor.

## Kendi kendine güncelleme

Uygulama açılışta `desktop-latest` etiketindeki `latest.json`'a bakıyor ve yeni
bir kararlı sürüm varsa kullanıcıya soruyor. Manifest her **kararlı** yayında
silinip yeniden oluşturuluyor; `desktop-continuous`'a bakmıyor, yoksa bir
sürüm kurmuş herkese her push önerilirdi.

**Bir kerelik kurulum.** İmzalama anahtarı üretildi ve `~/.spacetrace/updater.key`
içinde duruyor (600, her deponun dışında). Açık anahtarı `tauri.conf.json`'da.
Özel anahtarı sır olarak eklemek gerekiyor:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY \
  --repo unalcakir28/spacetrace-desktop \
  < ~/.spacetrace/updater.key
```

**Sır yoksa iş akışı güncelleyiciyi derleme için tamamen kapatıyor** — imzasız
bırakmakla yetinmiyor. İkisi de ölçülerek öğrenildi:

- Tanımsız bir sır boş dizeye genişliyor, Tauri o boş anahtarla imzalamaya
  çalışıp `Missing comment in secret key` ile düşüyor.
- Özel anahtar hiç olmasa bile, yapılandırmada `pubkey` durduğu sürece yine
  düşüyor: `A public key has been found, but no private key`.

Bu yüzden yapılandırma `jq` ile kırpılıyor. Kurulum paketleri normal derlenip
yayınlanıyor; yalnızca kendi kendine güncelleme yok — ki imzalayamayan bir boru
hattının dürüst hâli bu. Sır eklendiği anda kendiliğinden geri geliyor.

**Bu anahtar kod imzalama değil.** Tauri'nin minisign imzası paketin bu
boru hattından geldiğini kanıtlıyor; işletim sisteminin uygulamaya güvendiğini
söylemiyor. macOS'ta uygulama imzasız olduğu için güncellenen paket
Gatekeeper'a yeniden takılabilir — changelog girdisi bunu kullanıcıya söylüyor.

Anahtarı kaybetmek, kurulu uygulamaların güncellenememesi demek: yeni anahtarla
imzalanan bir manifest'i eski `pubkey` reddeder. Kurtarma yolu yeni sürümü elle
indirtmek.

**Updater varlıkları beş indirme adına dokunmuyor** — `.app.tar.gz`, `.sig`
dosyaları ve `latest.json` eklenen dosyalar. İndirme sayfası eski beş ada
bağlı ve o sayfa başka bir depoda.

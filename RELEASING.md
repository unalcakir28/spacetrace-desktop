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

Hiçbir paket imzalı değil. macOS ve Windows ilk açılışta uyarı veriyor; indirme
sayfası ne yapılacağını yazıyor ve her dosyanın yanında `SHA256SUMS` var.
İmzalama yıllık ücretli sertifika gerektiriyor ve sertifika bir depoda
duramıyor — bilinçli bir eksik, gizlenen bir şey değil.

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

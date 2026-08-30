# flutter_bug_report Log Viewer — Texnik Topshiriq (TZ)

## 1. Maqsad

`flutter_bug_report` paketi ilovaning loglarini yig'ib, tiketga biriktiriladigan
bundle yasaydi: `.txt`, `.json` yoki `.zip`. Paket vendorsiz — tarmoq kodi yo'q,
faylni qayerga yuborishni ilova o'zi hal qiladi.

Ochiq qolgan yarmi shu: **bundle tiketga tushgach, uni kimdir o'qishi kerak.**
Bugun bu — zipni yuklab olish, ochish va `logs.txt` ni matn muharririda
aylantirish demak.

Bu sayt shu yarmini yopadi: bundle tashlanadi, brauzerning o'zida o'qiladi va
o'qish mumkin bo'lgan holga keltiriladi — daraja bo'yicha filtr, qidiruv,
xatoga sakrash, metadata va skrinshot log yonida.

**Asosiy shart:** hamma narsa brauzerda ishlaydi. Server yo'q, yuklash yo'q,
analitika yo'q. Bundle qurilmada redaksiya qilingan bo'lsa ham, u ilovaning
haqiqiy ma'lumotini olib yuradi, `screenshot.png` ni esa umuman redaksiya
qilib bo'lmaydi. Shuning uchun "hech narsa mashinangizdan chiqmaydi" — bu
izoh emas, mahsulotning o'zi.

## 2. Stack

- Vanilla **HTML + CSS + JS** (build qadamisiz)
- Bog'liqliklar **yo'q** — vendor papkasi ham yo'q
- ZIP ochish: brauzerning o'z `DecompressionStream('deflate-raw')` i +
  qo'lda yozilgan central-directory o'quvchi (~120 qator)
- Deploy = static hosting (GitHub Pages)
- Uslub: IIFE, `"use strict"`, freymvorksiz. `innerHTML` **ishlatilmaydi**.

## 3. Funksional talablar

| # | Talab | Tavsif |
|---|-------|--------|
| F1 | Fayl ochish | Drag & drop, "Fayl tanlash", va clipboard'dan paste |
| F2 | Format aniqlash | **Mazmun bo'yicha, kengaytma bo'yicha emas.** `PK\x03\x04` → zip; JSON → `entries` massivi bo'lsa json; `=== flutter_bug_report ===` → sarlavhali txt; birinchi qator entry regexiga mos → **sarlavhasiz txt** (zip ichidan chiqarilgan `logs.txt`) |
| F3 | ZIP ochish | Brauzerda. Central directory'dan o'qiladi (local header'dan emas) — Finder'da qayta arxivlangan zip ham ochilsin |
| F4 | Bir nechta fayl | `logs.txt` + `report.json` + `screenshot.png` birga tashlansa — bitta hisobotga birlashtiriladi. Entries `report.json` dan olinadi (aniq) |
| F5 | Log ro'yxati | Har yozuv **bitta qatorga yig'ilgan**: vaqt, daraja, xabar. Bosilganda ochiladi va `extra` / `error` / `stack_trace` ko'rinadi |
| F6 | Daraja filtri | `debug` / `info` / `warning` / `error` chiplari, har birida sanoq. Bosilsa o'chadi/yonadi |
| F7 | Qidiruv | Matn bo'yicha, xabar + extra + error + stack ichidan. Topilgan joylar `<mark>` bilan belgilanadi |
| F8 | Xatolarga sakrash | Klaviatura: keyingi/oldingi xato. O'quvchi aynan shuning uchun kelgan |
| F9 | Report paneli | `description`, `generated_at`, `entry_count`, `truncated`, `metadata` — yon panelda, ko'rinib turadi |
| F10 | Skrinshot | Yon panelda, bosilganda kattalashadi. Faqat zip'da bo'ladi |
| F11 | `truncated` ogohlantirishi | Banner **va** ro'yxatning **tepasida** kesim belgisi — chunki yo'qolgan qism boshi, oxiri emas |
| F12 | Vaqt | Standart — mahalliy vaqt, offset ko'rsatilgan holda. UTC ga almashtirish tugmasi |
| F13 | Vaqt oralig'i | Ketma-ket yozuvlar orasidagi katta tanaffus alohida belgilanadi — ilova qayerda qotib qolgani shu yerdan ko'rinadi |
| F14 | Redaksiya belgilari | `«redacted»` va `************4242` alohida uslubda. Panelda "redaksiya N ta qiymatda ishladi" — sir yo'qligi ijobiy signal bo'lsin |
| F15 | Nusxa olish | Filtrlangan ko'rinishni clipboard'ga |
| F16 | Bo'sh holat | Drop zonaning o'zi — sayt haqida sahifa. Bundle nima, `flutter_bug_report` nima (pub.dev + repo havolasi), va lokal-only kafolati |
| F17 | Xatolik holatlari | Notanish fayl, buzilgan zip, `entry_count` mos kelmasligi (buzilgan yoki chala yuklangan fayl) — aniq xabar, jimgina yiqilish emas |
| F18 | `.txt` ogohlantirishi | Txt ochilganda: "Matndan o'qildi — maydon chegaralari taxminiy. `.zip` yoki `.json` shakli aniq" |
| F19 | Yopish | Fayl xotiradan chiqadi, sahifa bo'sh holatga qaytadi |
| F20 | URL holati | Faqat ko'rinish holati (filtr, qidiruv). **Log mazmuni hech qachon URL'ga tushmaydi** — u brauzer tarixida va URL nusxalangan har joyda qolib ketadi |

## 4. Funksional bo'lmagan talablar

- **Hech narsa serverga ketmaydi.** Bu va'da emas, majburlangan xossa:
  sahifada `Content-Security-Policy` meta tegi `connect-src 'none'` bilan —
  brauzerning o'zi har qanday fetch/XHR/WebSocket/beacon'ni rad etadi.
- Offline ishlaydi. Bitta faylni saqlab, internetsiz ochish mumkin.
- CDN yo'q, shrift yuklanmaydi, analitika yo'q, bog'liqlik yo'q.
- Yengil: bitta faylda < 50KB.
- Dark mode — loglarni kechasi o'qishadi.
- Mobil + desktop responsive.
- Klaviatura bilan to'liq foydalanish mumkin.
- 5000+ yozuvda ham tez: qatorlar yig'ilgan holda (belgilangan balandlik) va
  oyna bilan render qilinadi.
- **`innerHTML` ishlatilmaydi.** Log mazmuni ishonchsiz matn: u DOM'ga faqat
  `textContent` orqali kiradi va hech qachon markupga aylanmaydi.

## 5. Texnik tafsilotlar

### 5.1 Bundle formati

Fayl nomi doim `log-bundle-YYYYMMDD-HHMMSS.<ext>`.

- **`.zip`** (standart): `logs.txt` (sarlavhasiz), `report.json` (sarlavhali),
  ixtiyoriy `screenshot.png`
- **`.json`**: `{ "report": {...}, "entries": [...] }`
- **`.txt`**: sarlavha bloki, keyin har yozuv uchun qator

`level` — aynan `debug` | `info` | `warning` | `error`, kichik harflarda,
og'irlik tartibida. `description`, `screenshot`, `metadata`, `error`,
`stack_trace`, `extra` — hammasi ixtiyoriy, bo'sh bo'lsa umuman yozilmaydi.
Vaqtlar ISO-8601 **UTC**.

### 5.2 Txt parsing — eng nozik joy

Yozuv chegarasi **faqat qator boshidagi vaqt belgisiga** tayanadi, otstupga
emas:

```js
/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z) (DEBUG  |INFO   |WARNING|ERROR  ) (.*)$/
```

Sabab: paketning `_line()` funksiyasi `entry.message` ni **xom holda** yozadi,
`ConsoleCapture` esa `debugPrint` ni butunligicha uzatadi. Flutter'ning
`EXCEPTION CAUGHT BY WIDGETS LIBRARY` banneri — bitta ko'p qatorli xabar, va
uning qatorlari **otstupsiz**, 0-ustundan boshlanadi. Demak "ikki probel =
davomi" qoidasi ishlamaydi.

Darajaning aynan `padRight(7)` kengligini talab qilish — ichida vaqt belgisi
*eslatilgan* qatorga noto'g'ri bo'linib ketmaslik uchun.

Chegara topilgandan keyin maydonlarni ajratish **taxminiy**:
- oxiridan boshlab `^  (#\d+\s|<asynchronous suspension>)` — stack freymlari
- boshidan: birinchi davom qatori `^  \{...\}$` va `JSON.parse` o'tsa — `extra`
- otstupsiz qatorlar — `message` ga qaytib qo'shiladi
- o'rtada qolgani — `error`

Bu yerda yo'qotish bor va uni hech qanday parser bartaraf qila olmaydi.
Shuning uchun F18: sayt buni ochiq aytadi.

### 5.3 Sarlavha parsing

18 ta `=` gacha bo'lgan maydonlar. `metadata:` (qiymatsiz) ikki probelli blokni
ochadi. `^\w+:` ga mos kelmagan va metadata blokida bo'lmagan qator — oldingi
maydonning davomi (0.3.0 gacha `description` ko'p qatorli bo'lishi mumkin edi;
0.3.1 buni tuzatadi, lekin eski bundle'lar hech qayerga ketmaydi).

### 5.4 Ma'lum nomuvofiqliklar

- `report.screenshot` `.txt` va `.json` da ham chiqadi, holbuki PNG faqat
  zip'da bo'ladi (0.3.1 da tuzatiladi). Eski bundle'lar bu yolg'on da'voni
  abadiy olib yuradi → "`.zip` shaklini so'rang" xabari.
- `entry_count` doim `entries.length` ga teng bo'lishi kerak. Teng bo'lmasa —
  fayl buzilgan, ogohlantirish beriladi.

### 5.5 Fayl strukturasi

```
flutter_bug_report_viewer/
├── index.html          — sahifa; CSP meta tegi shu yerda
├── style.css
├── parse.js            — DOM'siz: format aniqlash, txt/json parsing
├── unzip.js            — DOM'siz: central-directory ZIP o'quvchi
├── viewer.js           — DOM: drop, render, filtr, qidiruv, panel
├── test.html           — brauzerda ochiladi, assertion'larni yuritadi
├── test/
│   ├── cases.js
│   └── fixtures/       — paket repo'sidan (0.3.1) olingan etalon bundle'lar
├── make-single.sh      — bitta faylga yig'adi (offline yuklab olish uchun)
├── viewer.html         — yig'ilgan bitta fayl (commit qilinadi)
├── README.md
├── TZ.md
└── LICENSE
```

`parse.js` va `unzip.js` DOM'ga tegmaydi — shuning uchun ularni `test.html`
ham, oddiy node skripti ham yurita oladi, bog'liqliksiz.

### 5.6 Brauzer talabi

`DecompressionStream('deflate-raw')` — Chrome 103+, Safari 16.4+, Firefox 113+.
Undan eskisida zip ochilmaydi va sayt buni aniq aytadi (`.json` yoki `.txt`
shaklini so'rashni taklif qiladi).

## 6. Kelajakdagi (hozircha emas)

- Ikki bundle'ni solishtirish
- **Tarix / oxirgi ochilganlar — ataylab yo'q.** Birovning mijoz ma'lumotini
  IndexedDB'ga saqlash butun konsepsiyaga zid, `screenshot.png` ni esa
  redaksiya qilib bo'lmaydi. Sahifa yopilsa — hech narsa qolmaydi.
- **Ko'rinishga havola (permalink) — ataylab yo'q.** Aynan shu narsa serverga
  ehtiyoj tug'diradi. URL faqat filtrni olib yuradi.
- Stack trace'ni deobfuskatsiya qilish (mapping fayl kerak — serverga eng
  yaqin turgan xususiyat)
- Regex qidiruv
- PWA / service worker (bitta faylni saqlash buni kamroq mashinasozlik bilan
  hal qiladi)
- Ko'p tillilik

## 7. Dizayn konsepsiyasi — 3 yo'nalish

Alif uslubi emas: bu `flutter_bug_report`, boshqa mahsulot. Quyidagilardan
bittasi tanlanadi, keyin shu bo'lim yagona konsepsiyaga qisqartiriladi.

### Variant A — "Konsol"

Butun sahifa terminal. Kartochka yo'q, ramka yo'q. Yuqorida ingichka panel
(fayl nomi, sanoqlar, filtr), qolgan hamma joyni log egallaydi, metadata o'ngdan
chiqadigan panelda. Interfeysning o'zi ham monoshirift.

| Rol | HEX |
|-----|-----|
| Fon | `#0B0D10` |
| Sirt (panel) | `#14171C` |
| Matn | `#D7DCE5` |
| Ikkilamchi matn | `#6B7482` |
| Aksent | `#4EC9B0` |
| Warning | `#D7A93E` |
| Error | `#E5484D` |

Yagona to'yingan ranglar — darajalarniki. Debugger hissi.
*Xavf:* juda quruq, xarakteri yo'q.

### Variant B — "Dalolatnoma"

Bundle — oqim emas, tiketdagi **dalil**. Yuqorida hisobot sarlavhasi ish
jildining birinchi sahifasidek terilgan (description kattaroq shriftda,
metadata jadval bo'lib), pastda log monoshiriftda. Chap tomonda keng maydon —
vaqtlar u yerda hujjat qator raqamlaridek turadi. **Redaksiya belgilari
haqiqiy redaksiyadek:** to'ldirilgan qora chiziq, shunchaki boshqa rang emas.

| Rol | Light | Dark |
|-----|-------|------|
| Fon | `#FAF9F7` | `#131416` |
| Sirt | `#FFFFFF` | `#1B1D20` |
| Matn | `#16181D` | `#E8E6E2` |
| Ikkilamchi | `#6E6A63` | `#8E8A83` |
| Aksent | `#2C4A7C` | `#7FA3D8` |
| Redaksiya | `#16181D` (to'ldirilgan) | `#E8E6E2` |

*Xavf:* kuniga 40 marta ochiladigan asbob uchun bir oz "tantanali".

### Variant C — "Diagnostika"

Log — o'qiladigan matn emas, **tashxis qo'yiladigan ma'lumot**. Shuning uchun
sahifa o'qishdan oldin ko'rsatadi: eng tepada ixcham **zichlik chizig'i** —
har yozuv 2px tik, darajasi bo'yicha rangli. Sessiyaning shakli bir qarashda
ko'rinadi: jim oraliq, keyin qizil portlash. Chiziqning istalgan joyiga bosilsa
logning o'sha nuqtasiga sakraydi. Pastda log.

Bu — TZ'dagi F13 (vaqt oralig'i) va F8 (xatoga sakrash) ni bitta element bilan
hal qiladi va ~40 qator kod turadi.

| Rol | HEX |
|-----|-----|
| Fon | `#0E1116` |
| Sirt | `#171B22` |
| Chegara | `#252B35` |
| Matn | `#DCE1E8` |
| Ikkilamchi | `#707A88` |
| Debug | `#5A6472` |
| Info | `#5B9DD9` |
| Warning | `#D9A441` |
| Error | `#E5544B` |

Profiler / flame chart hissi. Ranglar bezak emas — chiziqda ham, qatorlarda
ham bir xil ma'noni bildiradi.

### Umumiy mikro-detallar (qaysi variant bo'lishidan qat'i nazar)

- Shrift: tizim stack'i (`ui-monospace, SFMono-Regular, Menlo` log uchun;
  `-apple-system, Segoe UI, Roboto` interfeys uchun). Yuklanadigan shrift yo'q.
- O'tishlar: `.15s ease`
- Fokus halqasi ko'rinadigan bo'lsin — klaviatura bilan ishlanadi
- `font-variant-numeric: tabular-nums` — vaqtlar ustun bo'lib tursin

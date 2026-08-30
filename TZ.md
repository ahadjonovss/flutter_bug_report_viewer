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
| F14 | Redaksiya belgilari | **Ikki xil, va bir xil ko'rinmaydi:** `«redacted»` — to'liq bar; `************4242` — yulduzchalar barlanadi, `4242` ochiq qoladi. Batafsil §7.3. Panelda sanoq: "redaksiya N ta qiymatda ishladi" |
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
- Yengil: bitta faylda ~69KB, gzip bilan ~20KB. Ma'lumotnomadagi 50KB
  QR generator uchun edi; bu undan kattaroq dastur. **Izohlar qisqartirilmaydi
  va minifikatsiya qilinmaydi** — "hammasi ko'rib chiqiladigan bo'lsin" degan
  talab shundan iborat, va o'qib bo'lmaydigan 40KB o'qiladigan 69KB dan
  yomonroq.
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

### 5.6 Parser chiqishi

Uchala format bitta shaklga keltiriladi:

```
{ source, exact, report, entries, screenshot, notices }
```

- `exact` — `false` faqat matndan o'qilganda (F18 shu yerdan)
- `entries[].at` — vaqt son ko'rinishida. Mikrosoniyalar **kesiladi**,
  yaxlitlanmaydi: o'lchangan tanaffus haqiqiysidan keng chiqmasin
- `notices[]` — o'quvchiga aytiladigan gaplar (truncated, sanoq mos emas,
  skrinshot da'vosi, matndan o'qilgani)

### 5.7 Fikstura va test

Etalon bundle'lar paketning **o'z builder'i** yozgan, qo'lda emas.
`test/fixtures/` ga nusxa ko'chiriladi, manba pinlangan commit:

```
fixtures/         d8db3cd   (0.3.1)
fixtures/legacy/  2139d41   (v0.3.0 worktree'sida yuritilgan)
```

Tag'ga emas, commit'ga pinlanadi: `timeline` fikstura `v0.3.1` dan keyin
qo'shilgan va u uchun alohida reliz kesilmagan. Pindan farq chiqsa — format
o'zgargan; pinni ko'tarish ko'rib chiqiladigan alohida qaror.

**Eski format bo'yicha ish tugagan, vaqtinchalik emas.** 0.3.0 va 0.3.1
chiqargan fayllar solishtirildi: **atigi uchta fayl farq qiladi** —
`legacy/multiline_description.txt` (otstupsiz o'ralgan description) va
`legacy/screenshot.{txt,json}` (mavjud bo'lmagan skrinshot da'vosi).
Qolgan hammasi bayt-baytga bir xil, ziplar esa mazmunan.

Ya'ni eski bundle boshqacha bo'lishining **faqat ikkita yo'li bor**, va
ikkalasi ham qamrab olingan. Tiketda kutib turgan uchinchi "eski format
g'alatiligi" yo'q. 0.1.0–0.3.0 nashr qilingan va qaytarib olinmaydi —
bu shakllar abadiy o'qilishi kerak.

Testlar: `node test/run.js` va `test.html` (ikkalasi ham `test/cases.js` ni
yuritadi). **Zip baytlari takrorlanmaydi** — arxiv modifikatsiya vaqtini
yozadi — shuning uchun zip *mazmuni* solishtiriladi, baytlari emas.

### 5.8 `entry_count` faqat o'z formatiga tegishli

`truncated` fikstura buni ko'rsatadi: bir xil kirishdan **txt 5 ta yozuv,
json esa 2 ta** saqlagan. Sabab — `_fit` chegaraga sig'ishni maqsad formatda
render qilib o'lchaydi va sig'maguncha ikkiga bo'ladi; json'ning har yozuvga
tushadigan ortiqcha hajmi txt saqlab qoladigan yozuvlarni yeb qo'yadi.

Demak: **bir formatning `entry_count` i boshqasi haqida hech narsa aytmaydi.**
Ikkala qiymat ham to'g'ri. Ziplarda `report.json` va `logs.txt` bir xil
`kept` ro'yxatidan yozilgani uchun ular o'zaro mos — lekin alohida qurilgan
`.json` va `.txt` bundle'lar mos kelmasligi mumkin va bu buzilganlik emas.

### 5.9 Brauzer talabi

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


## 7. Dizayn konsepsiyasi — "Diagnostika"

Log — o'qiladigan matn emas, **tashxis qo'yiladigan ma'lumot**. Shuning uchun
sahifa o'qishdan oldin ko'rsatadi. Profiler / flame chart hissi: rang bezak
emas, ma'no.

### 7.1 Zichlik chizig'i

Eng tepada, ixcham gorizontal chiziq. Har yozuv — 2px tik, darajasi bo'yicha
rangli, vaqt o'qi bo'yicha joylashgan (indeks bo'yicha emas — aks holda
tanaffus ko'rinmaydi).

Sessiyaning shakli bir qarashda ko'rinadi: jim oraliq, keyin qizil portlash.
`timeline` fikstura aynan shu profil uchun: 6 ta so'rov 900ms oralab, **31.5
soniya jimlik**, keyin bosish, ogohlantirish va 40ms oralab 5 ta xato.

- Chiziqning istalgan joyiga bosilsa — log o'sha nuqtaga sakraydi
- Ko'rinib turgan oraliq chiziqda ajratib ko'rsatiladi
- Katta tanaffus chiziqda bo'shliq bo'lib qoladi — bu F13 ning javobi
- Filtr o'zgarsa chiziq ham o'zgaradi

### 7.2 Rang palitrasi

| Rol | HEX |
|-----|-----|
| Fon | `#0E1116` |
| Sirt (panel, chiziq foni) | `#171B22` |
| Chegara | `#252B35` |
| Matn | `#DCE1E8` |
| Ikkilamchi matn | `#707A88` |
| Debug | `#5A6472` |
| Info | `#5B9DD9` |
| Warning | `#D9A441` |
| Error | `#E5544B` |

Daraja ranglari chiziqda ham, qator chetidagi belgida ham, chipda ham bir xil.

### 7.3 Redaksiya belgilari

Ikki xil narsa redaksiya qilinadi va ular **bir xil ko'rinmasligi kerak**.

**To'liq olib tashlangan qiymat** — `«redacted»`:
to'ldirilgan bar, ostida matn ko'rinmaydi. Qiymat yo'q, va yo'qligi ko'rinadi.

**Qisman saqlangan qiymat** — `************4242`:
yulduzchalar bar bilan yopiladi, **`4242` esa ochiq qoladi**, bar bilan yonma-yon.

Bu ikkinchisi muhim: oxirgi to'rt raqam ataylab saqlangan — ops xodimi kartani
tranzaksiya bilan solishtira olsin, lekin raqamning o'zi qurilmadan chiqmasin.
Redaktor buni Luhn tekshiruvi bilan qiladi, ya'ni buyurtma raqami yulduzchaga
aylanib qolmaydi. Hammasini bitta qora barga aylantirish — paket ataylab
saqlagan ma'lumotni yo'qotish demak.

Ikkalasi ham `title` va `aria-label` orqali izohlanadi. Yon panelda sanoq:
"redaksiya N ta qiymatda ishladi" — sir yo'qligi savol emas, ijobiy signal.

### 7.4 Log qatorlari

- Har yozuv — **bitta qatorga yig'ilgan**: vaqt, daraja belgisi, xabar
- Yig'ilgan qatorning balandligi o'zgarmas → oyna bilan render qilish oson
- Bosilsa ochiladi: `extra` (foldable JSON daraxti), `error`, `stack_trace`
- Chap chetda 3px daraja rangi — ro'yxatni pastga qarab o'qish uchun
- Katta tanaffus qatorlar orasida ajratkich bo'lib ko'rinadi: `⌄ 31.5s`

### 7.5 Yon panel

O'ngda, yopiladigan. `description` tepada, keyin `generated_at` (mahalliy vaqt +
offset), `entry_count`, `metadata` jadval bo'lib, skrinshot pastda.
`truncated` bo'lsa — banner tepada, **va** ro'yxatning boshida kesim belgisi.

### 7.6 Tipografika va mikro-detallar

- Log: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
- Interfeys: `-apple-system, Segoe UI, Roboto, sans-serif`
- Yuklanadigan shrift yo'q
- `font-variant-numeric: tabular-nums` — vaqtlar ustun bo'lib tursin
- O'tishlar: `.15s ease`
- Fokus halqasi doim ko'rinadi
- Dark-first. Light rejim keyin, alohida qaror sifatida.

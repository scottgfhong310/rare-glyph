# rare-glyph — 經典中罕見字管理 · IDS Builder

[English](./README.md) · [日本語](./README.ja.md)

管理**佛典與經典文獻中的罕見字／缺字**的策劃工具。它管理共用的缺字 SVG 語料、描述每個缺字（標準 Unicode IDS、CBETA 組字式、大正藏/CBETA 缺字碼，以及若已存在的對應 Unicode 字），並產生可直接貼進 `markdown-library` / `markdown-reader` 文件的家族 `.glyph` `<span>` 標記。

屬於 **nodeapp WebApp 家族**；共同規範與流程見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）。以 Path A（GitHub-first）建立。完整設計見 [DESIGN.md](./DESIGN.md)。

## 功能

- **缺字語料** — 瀏覽 `/lib/Typeface/svgs/` 下的 SVG，以家族 `.glyph` 技法（CSS `mask` + `currentColor`）呈現，使「512 黑底」原始 SVG 在 light/dark 與列印皆正確。拖拉（或按鈕）上傳；刪除前自動 `.bak`。
- **IDS Builder** — 16 個表意文字描述字元（U+2FF0–2FFF）調色盤（標註元數）、可複製 `<textarea>`、**即時驗證**（運算元數目＋多餘字元）、附各組件碼位的**結構樹**。
- **CBETA 組字式** — 記錄 CBETA 風格組字式（`口*洛`、`木*(於-方)`）；連結 [CBETA 組字規則](https://cbeta.org/character-composition-rules)。
- **缺字碼 ↔ Unicode** — 記錄大正藏/CBETA 缺字碼（`T014461`）與其對應的既有 Unicode 字（`𢤱`），附碼位與行內複製 icon。
- **無字形登錄** — 已有對應 Unicode 字、不需字形圖者（如 `&T014461;=𢤱`），可不附 `.svg` 直接登錄（以 `code` 為鍵）。
- **產生 span** — 字形登錄產生 `.glyph` mask span；無字形登錄產生帶 code 的註記 `<span data-code data-uni>字</span>`，並另提供「複製對應字」純字。
- **依加入時間排序** — 每筆有 `timestamp`，清單最近加入排最前（含無字形登錄）。
- **find** — 單一搜尋框跨 `code` / `uni` / `ids` / `cbeta` / 檔名不分欄位過濾。
- **下載** — 原始 SVG，或前端光柵化的**白底黑字 PNG**。
- 三語介面（`zh-Hant` / `en` / `ja`）、light/dark 主題（預設 dark）。

> 需 Node 伺服器（用絕對路徑 `/api/...`、`/lib/...`）；**不**相容純靜態的 GitHub Pages。

## 安裝執行

```bash
npm install
npm start            # → http://localhost:3000/apps/rare-glyph/
```

以 `PORT` 覆寫預設 3000。

## 目錄結構

```
rare-glyph/
├─ app.js                          # Express 入口：port 3000；/ → 302 /apps/rare-glyph/
├─ routes/rare-glyph.js            # GET /list · POST /upload · /delete · /registry
└─ public/
   ├─ apps/rare-glyph/             # 前端（服務於 /apps/rare-glyph/）
   │  ├─ index.html · rare-glyph.css · rare-glyph.js · rare-glyph-lib.js
   │  ├─ glyphs.js                 # 登錄：window.RG_GLYPHS = [{file, ids, cbeta, code, uni, timestamp}]
   │  ├─ i18n.js · locales/{zh-Hant,en,ja}.js
   │  ├─ side-tool.css · thinking-dot.css · materialize-dark.css
   └─ lib/Typeface/svgs/           # 共用缺字語料（repo 只附少量 sample）
```

> **刻意偏離 canon：** 缺字語料與上傳目標是共用的 `/lib/Typeface/svgs/`（而非 canon 預設的
> `/upload/<name>/`），因為產出的 `.glyph` span 必須指向 `markdown-library` /
> `markdown-reader` 既有引用的同一條共用路徑。repo 只附少量 sample SVG；完整語料留在
> 本地／孵化器，不進版控。

## API

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/rare-glyph/list` | 列語料 `.svg` ＋ 無字形登錄、併入登錄 meta；依 `timestamp` 降冪 |
| POST | `/api/rare-glyph/upload` | 上傳 `.svg`（multipart `myFiles`，≤ 20，同名覆寫） |
| POST | `/api/rare-glyph/delete` | 刪除 `svgs/<file>`（先 `.bak`）— body `{ file }` |
| POST | `/api/rare-glyph/registry` | 寫回 `glyphs.js`（先 `.bak`）— body `{ entries: [{file, ids, cbeta, code, uni, timestamp}] }` |

所有回應採 `{ ok: boolean, ... }` 信封；錯誤為 `{ ok: false, error }`。

## 核心 library（`RareGlyphLib`）

純邏輯、不碰 DOM、零依賴。主要方法：

```ts
RareGlyphLib.IDC                       // [{ op, cp, arity, key }] — 16 個 IDC 運算子
parseIds(str)                          // → { ok, tree? } | { ok:false, code:'empty'|'needMore'|'trailing', op?, need?, got?, extra? }
buildSpan({ file, stem, ids, cbeta, code, uni })   // → <span class="glyph" …> 字串（字形登錄）
buildCharSpan({ code, uni })           // → <span data-code data-uni>字</span>（無字形登錄）
codeFromFile(file)                     // 去 .svg 副檔名（顯示識別 / aria-label）
leafChars(tree)                        // 解析樹中的組件字
listFiles() / uploadFiles(files) / deleteFile(file) / saveRegistry(entries)
svgUrl(file) / downloadUrl(file) / timestamp(date) / formatSize(bytes)
```

### 資料結構

```jsonc
// glyphs.js  →  window.RG_GLYPHS（每筆）
{
  "file":  "T011774.svg",   // /lib/Typeface/svgs/ 下的 .svg；""＝無字形登錄（以 code 為鍵）
  "ids":   "",              // 標準 IDS（⿰⿱… U+2FF0–2FFF），可空
  "cbeta": "",              // CBETA 組字式（口*洛、木*(於-方)），可空
  "code":  "T014461",       // 大正藏/CBETA 缺字碼，可空
  "uni":   "𢤱",            // 對應的既有 Unicode 字，可空
  "timestamp": "20260627220102"   // 加入時間 yyyyMMddHHmmss（清單依此降冪）
}

// GET /api/rare-glyph/list  →
{
  "ok": true,
  "files": [
    { "file":"T011774.svg", "hasSvg":true, "stem":"T011774", "size":7501, "mtime":..., "birthtime":...,
      "timestamp":"20260627220102", "ids":"", "cbeta":"", "code":"T014461", "uni":"𢤱" }
  ]
}
```

## 授權

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)

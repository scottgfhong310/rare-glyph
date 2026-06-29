# rare-glyph — 設計文件（DESIGN）

> 經典中罕見字管理 · **IDS Builder**。
> 本文件記錄這支 app 的設計理念、架構、資料模型、各功能的取捨與安全模型，作為維護與後續演進的依據。
> 共同規範見家族 [DESIGN_GUIDELINES.md](https://github.com/scottgfhong310/nodeapp-webapp-family)；本文只談本 app 專屬部分。

---

## 1. 目標與範圍

策劃並描述**佛典與經典文獻中的罕見字／缺字（gaiji）**的擁有者工具，產出可直接貼進
`markdown-library` / `markdown-reader` 文件的家族 `.glyph` 標記。核心能力：

1. **缺字 SVG 語料管理**：瀏覽 / 拖拉上傳 / 刪除 `/lib/Typeface/svgs/` 下的字形。
2. **IDS Builder**：以 Unicode 表意文字描述字元（IDC，U+2FF0–2FFF）撰寫缺字的標準 **IDS**（Ideographic Description Sequence），即時驗證 + 結構樹。
3. **CBETA 組字式**：記錄 CBETA 風格組字式（`口*洛`、`木*(於-方)`）。
4. **缺字碼 ↔ 對應字**：記錄大正藏/CBETA 缺字碼（`T014461`）與其已存在的 Unicode 對應字（`𢤱`）。
5. **無字形登錄**：對「已有對應 Unicode 字、不需字形圖」的缺字（如 `&T014461;=𢤱`），可不附 `.svg` 直接登錄。
6. **產生 span**：依條目型態產生 `.glyph` mask span 或帶 code 的註記 span，一鍵複製。
7. **find**：跨欄位搜尋過濾清單。

非目標：不做佛典全文檢索、不做字形繪製（SVG 由外部工具產生後上傳）、不在本 app 內渲染 Markdown。

---

## 2. 設計理念

沿用家族理念（zero-build / CDN-first、薄後端純前端核心、可嵌入 lib、三語標配、安全內建）。本 app 額外的取捨：

- **以「缺字語料的擁有者工具」自我定位**：它是 `markdown-library` 等閱讀器的**伴生編輯工具**，產物（span / glyphs.js）餵回那些 app。
- **資料與程式分離**：字形語料在共用 `/lib/Typeface/svgs/`；描述資料（IDS/CBETA/code/uni/timestamp）在 `glyphs.js` 登錄。
- **記憶體為編輯中的唯一真相**：所有編輯先進記憶體，按「存檔」才寫回 `glyphs.js`（覆寫前 `.bak`）。

---

## 3. 系統架構

```
瀏覽器（前端）                                   Node / Express（後端）
─────────────────────────────────────          ──────────────────────────────
index.html  純結構                               app.js          靜態檔 + 路由 + 302 + JSON 404
rare-glyph.css  主題 token + 版面                 routes/rare-glyph.js
rare-glyph.js   控制器（碰 DOM）  ── fetch ──▶      GET  /api/rare-glyph/list
rare-glyph-lib.js  核心（不碰 DOM）                 POST /api/rare-glyph/upload
glyphs.js   登錄資料（<script> 載入免 fetch）        POST /api/rare-glyph/delete
i18n.js + locales/*                               POST /api/rare-glyph/registry
side-tool / thinking-dot / materialize-dark
                                                 public/lib/Typeface/svgs/   缺字 SVG 語料
                                                 public/apps/rare-glyph/glyphs.js  登錄（被回寫）
```

**lib 邊界（家族 §4.1/§4.2）**：`rare-glyph-lib.js` 為純邏輯（IDC 表、IDS 解析/驗證、span 產生、API fetch 包裝、碼位/檔名工具），**不觸碰 `document`/DOM/jQuery**。光柵化（SVG→PNG，需 canvas）與所有 DOM 繫結放控制器 `rare-glyph.js`。

---

## 4. 檔案地圖

```
rare-glyph/
├─ app.js                          # Express 入口：port 3000；/ → 302 /apps/rare-glyph/；JSON 404
├─ routes/rare-glyph.js            # GET /list + POST /upload、/delete、/registry（全 {ok}）
├─ public/
│  ├─ apps/rare-glyph/
│  │  ├─ index.html                # 三欄結構（清單 / IDS Builder / 缺字詳情）
│  │  ├─ rare-glyph.css            # 主題 token（light/dark）+ 版面 + .glyph mask + 各元件
│  │  ├─ rare-glyph.js             # 控制器：清單/網格/調色盤/驗證/輸出/上傳/刪除/存檔/find/主題/語言
│  │  ├─ rare-glyph-lib.js         # 核心：IDC / parseIds / buildSpan / buildCharSpan / API / 工具
│  │  ├─ glyphs.js                 # 登錄：window.RG_GLYPHS = [{file, ids, cbeta, code, uni, timestamp}]
│  │  ├─ i18n.js + locales/{zh-Hant,en,ja}.js
│  │  ├─ side-tool.css             # 右側浮動工具列（§5.5 正統 .side-tools flex）
│  │  ├─ thinking-dot.css          # 家族共用載入點 utility
│  │  ├─ materialize-dark.css      # 家族共用 Materialize 深色
│  │  └─ fonts/                    # IDC 後備 subset woff2（U+2FF0–2FFF+U+31EF；BabelStone Han, APL）+ 授權文
│  └─ lib/Typeface/svgs/           # 缺字 SVG 語料（家族共用 Typeface 路徑）；repo 只附少量 sample
└─ package.json · .gitignore · LICENSE · README{,.zh-Hant,.ja}.md · CLAUDE.md · DESIGN.md
```

---

## 5. 資料模型

### 5.1 登錄 `glyphs.js`

```jsonc
// window.RG_GLYPHS — 缺字登錄陣列；每筆：
{
  "file":  "T011774.svg",   // /lib/Typeface/svgs/ 下的 .svg 檔名；""＝無字形登錄（以 code 為鍵）
  "ids":   "",              // 標準 IDS（⿰⿱… U+2FF0–2FFF），可空
  "cbeta": "",              // CBETA 組字式（口*洛、木*(於-方)），可空
  "code":  "T014461",       // 大正藏/CBETA 缺字碼，可空
  "uni":   "𢤱",            // 對應的既有 Unicode 字，可空
  "timestamp": "20260627220102"  // 加入時間 yyyyMMddHHmmss
}
```

- **條目兩型**：
  - **字形登錄（svg）**：`file` 非空，身分＝檔名。`/list` 由檔案系統列舉 svg + 併入登錄 meta。
  - **無字形登錄（code-only）**：`file` 為空、`code` 非空，身分＝code。純存在於 `glyphs.js`。
- **儲存順序**：`/registry` 寫檔時，字形登錄在前依檔名、無字形登錄在後依 code（穩定、利 diff）。
- **顯示順序**：`/list` 統一**依 `timestamp` 降冪**（最近加入排最前）；空 timestamp 沉底。

### 5.2 `/list` 回應（每筆 file 物件）

```jsonc
{ "ok": true, "files": [
  { "file":"T011774.svg", "hasSvg":true, "stem":"T011774", "size":7501, "mtime":..., "birthtime":...,
    "timestamp":"20260627220102", "ids":"", "cbeta":"", "code":"T014461", "uni":"𢤱" }
] }
```

- `stem`＝檔名去 `.svg`（顯示識別、`aria-label` 用），與 `code`（缺字碼）區分。
- `timestamp` 解析：svg 用登錄值，**未存過則以檔案 birthtime 回退**（沿用「依建立日期排序」）；code-only 用登錄值。

### 5.3 前端記憶體狀態（key 為中心）

每條目有穩定 `_key`：svg＝檔名、code-only＝`'code:'+code`（未存檔暫為 `'new:'+seq`）。
`state.metaByKey[_key] = { ids, cbeta, code, uni, timestamp }` 為編輯中唯一真相；
`loadFiles` 重載時，已在記憶體者保留其（可能未存檔的）編輯，未存檔的 `'new:'` 無字形登錄也保留不致遺失。

---

## 6. 後端（Express）

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/rare-glyph/list` | 列 `svgs/*.svg` + 併入登錄 meta + 併入 code-only 登錄；依 timestamp 降冪 |
| POST | `/api/rare-glyph/upload` | 上傳 `.svg` 到 svgs/（multipart `myFiles`、≤20、同名覆寫） |
| POST | `/api/rare-glyph/delete` | 刪除 `svgs/<file>`（覆寫/刪除前 `.bak`）body `{ file }` |
| POST | `/api/rare-glyph/registry` | 重寫 `glyphs.js`（`.bak`）body `{ entries:[{file,ids,cbeta,code,uni,timestamp}] }` |

全部回 `{ ok }`；錯誤 `{ ok:false, error }`。

---

## 7. 前端與功能

### 7.1 三欄版面

1. **缺字清單**（左）：find 搜尋框、缺字網格、上傳 / 新增無字形鈕、全頁拖拉上傳覆蓋層。
2. **IDS Builder**（中）：IDC 調色盤、IDS 輸入 + 即時驗證 + 結構樹、CBETA 組字式輸入。
3. **缺字詳情**（右）：字形/對應字預覽、缺字碼 + 對應字輸入、產生的 span + 複製、下載 / 刪除。

窄螢幕單欄堆疊；`#setting-menu` 可收合清單欄。

### 7.2 `.glyph` 渲染（與 markdown-library 相容）

缺字 SVG 多為 512² 黑底（path 或 `<text>` CDATA），若以 `<img>` 在深色會看不見。家族慣例以
**`mask: var(--g) center/contain` + `background-color: currentColor`** 成形，1em 見方、隨內文色、light/dark/列印皆正確。
本 app 在 `rare-glyph.css` 自帶 `.glyph` 規則（非 zero-md shadow DOM）；網格、詳情、內文預覽皆用此法。

### 7.3 IDS 引擎（lib）

- **IDC 表**：U+2FF0–2FFF 全 16 個運算子，含元數（arity）：⿰⿱⿴–⿽ 二元、⿲⿳ 三元、⿾⿿ 一元；每個對應 `idc.*` i18n key（三語名稱）。
- **`parseIds(str)`**：碼位層級（surrogate-safe）遞迴解析 → 結構樹；錯誤碼 `empty` / `needMore`（運算元不足，回 op/need/got）/ `trailing`（多餘字元）。葉節點＝任何非 IDC 運算子的單一碼位。
- **UI**：調色盤點擊插入運算子；即時驗證徽章（合法/錯誤/中性）；結構樹附各組件碼位。
- **IDC 後備字型**：`⿼⿽⿾⿿`（U+2FFC–2FFF，Unicode 15.1 新增）與 `U+31EF` 多數系統字型尚無、會 tofu。bundle 一份 `unicode-range` 限定（僅這些碼位）的 **BabelStone Han** subset woff2（~5KB，`fonts/`），以 `'IDCGlyph'` 置於調色盤 / 結構樹 / IDS 輸入框 / 清單徽章的字型堆疊最前，確保一定顯示；其餘字元不受影響（unicode-range 隔離）。授權 ARPHIC PUBLIC LICENSE（衍生自文鼎 AR PL）——subset 為修改版、保留字型 name table 的版權/授權、另附 `fonts/ARPHIC_PUBLIC_LICENSE.txt`，並於 `LICENSE` 加 §9.1 bundled 聲明。**data-ids 仍存真正的 Unicode 字元，與字型無關**。

### 7.4 CBETA 組字式

自由輸入欄（不做語法驗證），helper-text 連結 CBETA 組字規則
（<https://cbeta.org/character-composition-rules>），存入 `cbeta` 並輸出為 `data-cbeta`。

### 7.5 缺字碼 ↔ 對應字

詳情可編輯 `code`（缺字碼）與 `uni`（對應 Unicode 字）：
- 對應字以正常字型大字顯示、附碼位（`U+22931`）、行內複製 icon；網格亦以強調色標出。
- 兩值輸出為 span 的 `data-code` / `data-uni`。

### 7.6 產生的 span（依型態）

- **字形登錄**：`.glyph` mask span
  `<span class="glyph" style="--g:url('/lib/Typeface/svgs/<file>')" role="img" aria-label="缺字 <stem>" data-ids data-cbeta data-code data-uni>`（屬性按有值才加）。
- **無字形登錄**：帶 code 的註記 span（內容即對應字）
  `<span data-code="T014461" data-uni="𢤱">𢤱</span>`，並另提供「複製對應字」純字輸出（兩者都給）。

### 7.7 timestamp 與排序

每筆 `timestamp`（`yyyyMMddHHmmss`）記錄加入時間；清單統一依此降冪，使**無字形登錄也能依加入時間排序**、與 svg 交錯。新無字形登錄於建立當下寫入 `now`；svg 未存過則以 birthtime 回退。

### 7.8 find（跨欄位搜尋）

單一搜尋框，**不分欄位**對 `file` / `stem` / `code` / `uni` / `ids` / `cbeta` 做不分大小寫子字串比對，即時過濾網格；計數列顯示「n / total」；清除鈕還原。只過濾顯示，不影響選取與資料。

### 7.9 下載

詳情有開啟字形登錄時，右側出現兩個下載側鍵（§4.7：檔案動作綁開檔狀態）：
- **下載 SVG**：原檔（href 逐段 `encodeURIComponent`、保留原檔名）。
- **下載 PNG（白底黑字）**：同源 SVG 載入 `Image` → 1024² canvas 先填白底、再繪黑字字形 → `toBlob`；canvas 不被汙染。
無字形登錄無 svg，故不顯示下載側鍵。

### 7.10 三條編輯入口（設計收斂）

1. **拖入 / 上傳 `.svg`** → 編輯該字形屬性。
2. **ADD CODE-ONLY** → 新增無字形登錄（`&T014461;=𢤱` 類）。
3. **點選清單條目** → 編輯該筆。

（曾短暫加入的「new 清空欄位」側鍵已移除——它與上述三入口重複，且清空會誤動到所選條目。）

### 7.11 主題 / i18n / 工具列

- CSS 變數 light/dark，預設 dark；防閃爍開機腳本同時切 `data-theme` 與 `dark-mode`/`light-mode` class；`--mz-*` 映射到 `--accent`；以 `html.dark-mode body` 同特異度規則把底色拉回 app token（蓋過 materialize-dark 的 #121212）。
- i18n 外掛引擎 + `locales/*.js`，預設 `zh-Hant`；側邊語言鍵循環切換、`i18n:changed` 重繪動態部分（調色盤 / 網格 / 驗證樹）。
- 右側 `.side-tools` flex 工具列（§5.5 正統）：清單 / 深淺 / 語言 / 存檔 + （有開字形登錄時）下載 SVG / PNG。表單元素用 Materialize 原生（§5.7）。

---

## 8. 安全模型（家族 §8）

- **操作目標固定**：`svgs/` 目錄與 `glyphs.js`，不接受任意外部路徑。
- **檔名消毒**：trim、非空、`basename===原值`、非 `.`/`..`、不含 `/ \ \0`、**且擋 `" ' < > &` 與控制字元**（檔名會被前端塞進屬性，防屬性逸出 / DOM 注入；全形描述字元 ＊／（）＠ 不受影響）、副檔名須 `.svg`。
- **落點檢查**：`abs === SVGS_DIR || abs.startsWith(SVGS_DIR + sep)`。
- **registry 驗證**：每筆需 `file` 或 `code` 其一；file 唯一、code-only 的 code 唯一；ids/cbeta/code/uni 擋 `\0`/控制字元；timestamp 須 `^\d{0,14}$`；以 `JSON.stringify` 重寫（字串自帶安全跳脫）。
- **寫前備份**：覆寫 / 刪除前 `.bak/<name>-yyyyMMddHHmmss.bak`（`.bak/` 已 gitignore）。
- **前端輸出**：控制器 `escHtml` 跳脫 `& < > " '`（含屬性情境）；lib `escAttr` 同。
- **上傳上限**：`.array('myFiles', 20)`、`fileSize 5MB`；`express.json({ limit:'5mb' })`。
- **危險操作**：刪除 SVG `confirm()` 二次確認、註明先 `.bak` 可復原。

---

## 9. 刻意偏離 canon

- **語料根＝共用 `/lib/Typeface/svgs/`**（非 canon 預設 `/upload/<name>/`）：因產出的 `.glyph` span 必須指向
  `markdown-library` / `markdown-reader` 既有引用的同一條共用路徑。故上傳**不走共用 `upload.js` 的 `?folder=`**，
  改由 `routes/rare-glyph.js` 專屬 `/upload` 端點寫進 svgs/。獨立 repo 只附少量 sample；完整語料留在本地／孵化器，不進版控。

---

## 10. 執行與驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/rare-glyph/
```

驗證清單（preview 實跑）：路由 `/`→302、app 頁 / 資產 200、API `{ok}`、API 404 JSON；
產生 span 與需求逐字一致；IDS 驗證三態 + 結構樹；缺字 mask 在 light/dark/列印正確；
上傳 / 刪除 / 存檔 end-to-end（`.bak`）；timestamp 降冪排序（含 code-only）；find 跨欄位過濾；
SVG / PNG 下載；三語 + 主題切換；無 console 錯誤。

---

## 11. 與家族 canon 的關係

遵循：`app.js` 入口 + port 3000、`/apps/<name>/` 掛載、`{ ok }` 信封、JSON 404、i18n 外掛引擎 + 預設 `zh-Hant`、
CSS 變數 light/dark 預設 dark + 防閃爍、`.side-tools` flex 工具列（正統）、Materialize 原生表單 + 共用 `materialize-dark.css`、
共用 `thinking-dot.css`、安全基線、四件式 + lib 不碰 DOM。

偏離：語料根用共用 `/lib/Typeface/svgs/`（見 §9）。

新模式（可回饋家族）：**缺字 `.glyph` 登錄/產生器**——「以 mask + currentColor 呈現缺字 SVG，並以登錄檔（IDS/CBETA/code/uni/timestamp）描述、產生可貼用 span」這一套，可供其他需要缺字的佛典類 app 共用。

---

## 12. 設計決議紀錄

- **語料路徑**：用共用 `/lib/Typeface/svgs/`（與既有 `.glyph` 消費者同路徑）—— 經與需求確認的刻意偏離。
- **state 以 key 為中心**：為同時支援 svg（檔名鍵）與 code-only（code 鍵）兩型條目，前端狀態由「以檔名為鍵」重構為「以 `_key` 為鍵」+ 單一 `metaByKey`。
- **timestamp 字串格式**：採家族 `yyyyMMddHHmmss`（可讀 + 字典序可排序），統一排序鍵；svg 以 birthtime 回退保留原行為。
- **無字形登錄輸出**：提供「帶 code 註記 span」+「純對應字」兩種（使用者可二擇）。
- **移除 `new` 側鍵**：與三條編輯入口重複且具破壞性，收斂移除。
- **find 為純前端過濾**：跨欄位子字串、即時、不影響資料；故不需後端搜尋 API。

---

*MIT © 2026 Scott G.F. Hong — 隨 app 演進持續修訂。*

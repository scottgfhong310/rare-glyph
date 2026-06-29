# rare-glyph — Session context

**經典中罕見字管理 · IDS Builder**：策劃佛典／經典中的罕見字（缺字）SVG 語料，
描述每個缺字（標準 Unicode IDS ⿰⿱… U+2FF0–2FFF、CBETA 組字式、大正藏/CBETA 缺字碼、對應 Unicode 字），
並產生家族 `.glyph` `<span>` 標記，貼進 `markdown-library` / `markdown-reader` 文件。
以 Path A（GitHub-first）建立。完整設計見 `DESIGN.md`。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程）。**改動前請先讀那兩份，照其中 canon 做。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/rare-glyph/
routes/rare-glyph.js                # GET /list + POST /upload、/delete、/registry（全 {ok}）
public/apps/rare-glyph/             # 前端（服務於 /apps/rare-glyph/）
├─ index.html · rare-glyph.css · rare-glyph.js · rare-glyph-lib.js   # 四件式
├─ glyphs.js                        # 登錄（window.RG_GLYPHS = [{file, ids, cbeta, code, uni, timestamp}]；<script> 載入免 fetch）
├─ i18n.js · locales/{zh-Hant,en,ja}.js
├─ side-tool.css                    # §5.5〔正統〕.side-tools flex 容器版
├─ thinking-dot.css                 # 家族共用載入點 utility（與 markdown-library 同步）
├─ materialize-dark.css             # 家族共用 Materialize 深色
public/lib/Typeface/svgs/           # 缺字 SVG 語料（家族共用 Typeface 路徑）；repo 只附少量 sample
```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/rare-glyph/
```

## 本 app 的 canon 重點

- **刻意偏離 canon：語料根是共用 `/lib/Typeface/svgs/`**（不是 `/upload/<name>/`）。理由：產出的
  `.glyph` span 必須指向 `markdown-library` / `markdown-reader` 既有引用的同一條共用路徑。
  故**不走共用 `upload.js` 的 `?folder=`**，改由 `routes/rare-glyph.js` 的專屬 `/upload` 端點寫進 svgs/。
  獨立 repo 只附少量 sample；完整語料留在本地／孵化器，不進版控。
- **`.glyph` 渲染慣例**（與 markdown-library/viewer.css 相容）：`mask: var(--g) center/contain` +
  `background-color: currentColor`，1em 見方、隨內文色 → 黑底 512 SVG 在 dark/列印皆正確（`<img>` 在 dark 會看不見）。
  本 app 在 `rare-glyph.css` 自帶 `.glyph` 規則（非 zero-md shadow DOM）。
- **兩型條目 + 以 key 為中心的 state**：字形登錄（`file` 非空、鍵＝檔名）與**無字形登錄**（已有對應 Unicode 字、`file` 空、鍵＝`'code:'+code`，未存檔暫為 `'new:'+seq`）。前端 `state.metaByKey[_key] = {ids,cbeta,code,uni,timestamp}` 為編輯中唯一真相；`loadFiles` 保留記憶體未存檔編輯與未存檔的 `new:` 條目。
- **產生的 span（依型態）**：字形登錄 `buildSpan({file,stem,ids,cbeta,code,uni})` →
  `<span class="glyph" style="--g:url('/lib/Typeface/svgs/<file>')" role="img" aria-label="缺字 <stem>" data-ids data-cbeta data-code data-uni>`（屬性按有值才加）；
  無字形登錄 `buildCharSpan({code,uni})` → `<span data-code data-uni>對應字</span>`，另提供「複製對應字」純字。`stem` = 檔名去 `.svg`（與 `code` 缺字碼區分）。
- **IDS 引擎在 lib**（`rare-glyph-lib.js`，純邏輯、不碰 DOM、`window.RareGlyphLib`）：`IDC` 運算子表（16 個，含 arity）、
  `parseIds`（遞迴、surrogate-safe、回 needMore/trailing/empty 錯誤碼）、`describeTree` / `leafChars`、`buildSpan` / `buildCharSpan`、`downloadUrl` / `timestamp`、API 包裝。
  `rare-glyph.js` 是碰 DOM 的控制器（網格、find 過濾、調色盤、即時驗證/樹、選檔、上傳、刪除、存檔、SVG/PNG 下載、主題/語言）。PNG 光柵化（canvas，白底黑字）在控制器、不放純 lib。
- **IDC 元數**：⿰⿱⿴–⿽ 二元、⿲⿳ 三元、⿾⿿ 一元。葉節點＝任何非 IDC 運算子的單一碼位。
- **timestamp 與排序**：每筆 `timestamp`（yyyyMMddHHmmss）記加入時間；`/list` 統一依此降冪（最近加入排最前，含無字形登錄）；svg 未存過則以檔案 birthtime 回退。
- **find**：純前端跨欄位（file/stem/code/uni/ids/cbeta）不分大小寫子字串過濾，只過濾顯示。
- **後端安全**（canon §8）：操作目標固定（svgs/ 目錄 / glyphs.js）；檔名 sanitize（basename===原值、非 . / ..、
  不含 `/ \ \0`、**擋 `" ' < > &` 與控制字元**、副檔名須 `.svg`；允許全形描述字元 ＊／＠（） 與 CJK）；落點檢查 `startsWith(SVGS_DIR+sep)`；
  registry 每筆需 `file` 或 `code` 其一、file/code 各自唯一、timestamp `^\d{0,14}$`；覆寫/刪除前 `.bak`；以 `JSON.stringify` 重寫（字串安全跳脫）。
- **主題**：CSS 變數 light/dark，預設 dark；防閃爍開機腳本同時切 `data-theme` 與 `dark-mode`/`light-mode` class
  （materialize-dark.css 需要，見家族 §5.1）；`--mz-*` 映射到 `--accent`；另以 `html.dark-mode body` 同特異度規則
  把頁面底色拉回 app token（蓋過 materialize-dark 的 #121212）。
- **i18n**：`i18n.js` 引擎 + `locales/*.js`，`data-i18n` 屬性，預設 `zh-Hant`；IDC 名稱走 `idc.*` key。
- **API 信封**：一律 `{ ok }`；jQuery 3.7.1、Materialize 1.0.0（CDN），後端依賴 `multer`，不依賴 lodash。

## InProgress 鏡像

孵化器有同名鏡像 `InProgress/public/apps/rare-glyph/`（前端整包）+ `InProgress/routes/rare-glyph.js`，
共用 InProgress 既有的 `/lib/Typeface/svgs/`（完整語料）。回灌時只搬前端＋route，不動 InProgress 的 `app.js`。

# rare-glyph — 経典の稀少文字管理 · IDS Builder

[English](./README.md) · [繁體中文](./README.zh-Hant.md)

**仏典・古典籍に現れる稀少文字／欠字（缺字）**を管理する策劃ツール。共有の欠字 SVG 群を管理し、各字を記述し（標準 Unicode IDS、CBETA 組字式、大正蔵/CBETA 欠字コード、既に存在すれば対応 Unicode 文字）、`markdown-library` / `markdown-reader` の文書にそのまま貼れる家族 `.glyph` `<span>` マークアップを生成します。

**nodeapp WebApp ファミリー**の一員。共通規約と手順は [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）。Path A（GitHub-first）で作成。設計詳細は [DESIGN.md](./DESIGN.md)。

## 機能

- **欠字コーパス** — `/lib/Typeface/svgs/` 配下の SVG を家族 `.glyph` 技法（CSS `mask` + `currentColor`）で表示。「512 黒地」の元 SVG もライト／ダーク・印刷で正しく表示。ドラッグ＆ドロップ（またはボタン）でアップロード、削除前に `.bak`。
- **IDS Builder** — 16 個の漢字構成記述文字（U+2FF0–2FFF）パレット（項数表示）、コピー可能な `<textarea>`、**リアルタイム検証**（項数・余分文字）、コードポイント付き**構造ツリー**。
- **CBETA 組字式** — CBETA 風組字式（`口*洛`、`木*(於-方)`）を記録；[CBETA 組字規則](https://cbeta.org/character-composition-rules)へのリンク。
- **欠字コード ↔ Unicode** — 大正蔵/CBETA 欠字コード（`T014461`）と対応する既存 Unicode 文字（`𢤱`）を記録、コードポイントとインラインコピーアイコン付き。
- **字形なし登録** — 既に Unicode にある（SVG 不要、例 `&T014461;=𢤱`）字は `.svg` なしで登録可（`code` がキー）。
- **span 生成** — 字形登録は `.glyph` mask span、字形なし登録は注記付き `<span data-code data-uni>字</span>`、さらに「対応字をコピー」。
- **追加時刻でソート** — 各登録に `timestamp`、一覧は新しい順（字形なし登録も含む）。
- **find** — 1 つの検索ボックスで `code` / `uni` / `ids` / `cbeta` / ファイル名を横断フィルタ。
- **ダウンロード** — 元 SVG、またはクライアント側で生成する**白地に黒字の PNG**。
- 三言語 UI（`zh-Hant` / `en` / `ja`）、ライト／ダーク（既定はダーク）。

> Node サーバーが必要（絶対パス `/api/...`、`/lib/...`）。静的な GitHub Pages では動作しません。

## インストール / 実行

```bash
npm install
npm start            # → http://localhost:3000/apps/rare-glyph/
```

`PORT` で既定の 3000 を上書き。

## ディレクトリ構成

```
rare-glyph/
├─ app.js                          # Express エントリ：port 3000；/ → 302 /apps/rare-glyph/
├─ routes/rare-glyph.js            # GET /list · POST /upload · /delete · /registry
└─ public/
   ├─ apps/rare-glyph/             # フロントエンド（/apps/rare-glyph/ で配信）
   │  ├─ index.html · rare-glyph.css · rare-glyph.js · rare-glyph-lib.js
   │  ├─ glyphs.js                 # 登録：window.RG_GLYPHS = [{file, ids, cbeta, code, uni, timestamp}]
   │  ├─ i18n.js · locales/{zh-Hant,en,ja}.js
   │  ├─ side-tool.css · thinking-dot.css · materialize-dark.css
   │  └─ fonts/                    # IDC フォールバック subset（U+2FF0–2FFF + U+31EF）⿼⿽⿾⿿ 用；bundled BabelStone Han（APL）
   └─ lib/Typeface/svgs/           # 共有欠字コーパス（repo はサンプルのみ同梱）
```

> 最新の 4 つの IDC（`⿼⿽⿾⿿`、Unicode 15.1）は多くのシステムフォントに無いため、`unicode-range`
> で限定した極小（~5KB）の **BabelStone Han** subset を同梱し、パレットと構造ツリーで必ず表示。
> ライセンスは ARPHIC PUBLIC LICENSE（`public/apps/rare-glyph/fonts/ARPHIC_PUBLIC_LICENSE.txt` と `LICENSE` の同梱注記を参照）。

> **canon からの意図的な逸脱：** 欠字コーパスとアップロード先は共有の `/lib/Typeface/svgs/`
> （canon 既定の `/upload/<name>/` ではない）。生成する `.glyph` span が、`markdown-library` /
> `markdown-reader` が既に参照する同じ共有パスを指す必要があるためです。repo はサンプル数点のみ。
> 完全なコーパスはローカル／インキュベーターに置き、バージョン管理しません。

## API

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/rare-glyph/list` | コーパス `.svg` ＋ 字形なし登録を列挙、登録 meta を統合；`timestamp` 降順 |
| POST | `/api/rare-glyph/upload` | `.svg` をアップロード（multipart `myFiles`、最大 20、同名上書き） |
| POST | `/api/rare-glyph/delete` | `svgs/<file>` を削除（先に `.bak`）— body `{ file }` |
| POST | `/api/rare-glyph/registry` | `glyphs.js` に書き戻し（先に `.bak`）— body `{ entries: [{file, ids, cbeta, code, uni, timestamp}] }` |

すべての応答は `{ ok: boolean, ... }` 形式。エラーは `{ ok: false, error }`。

## コアライブラリ（`RareGlyphLib`）

純粋ロジック、DOM 非依存、依存ゼロ。主なメソッド：

```ts
RareGlyphLib.IDC                       // [{ op, cp, arity, key }] — 16 個の IDC 演算子
parseIds(str)                          // → { ok, tree? } | { ok:false, code:'empty'|'needMore'|'trailing', op?, need?, got?, extra? }
buildSpan({ file, stem, ids, cbeta, code, uni })   // → <span class="glyph" …> 文字列（字形登録）
buildCharSpan({ code, uni })           // → <span data-code data-uni>字</span>（字形なし登録）
codeFromFile(file)                     // .svg を除いたファイル名（表示識別 / aria-label）
leafChars(tree)                        // 解析ツリー内の部品文字
listFiles() / uploadFiles(files) / deleteFile(file) / saveRegistry(entries)
svgUrl(file) / downloadUrl(file) / timestamp(date) / formatSize(bytes)
```

### データ構造

```jsonc
// glyphs.js  →  window.RG_GLYPHS（各登録）
{
  "file":  "T011774.svg",   // /lib/Typeface/svgs/ 配下の .svg；""＝字形なし登録（code がキー）
  "ids":   "",              // 標準 IDS（⿰⿱… U+2FF0–2FFF）、空可
  "cbeta": "",              // CBETA 組字式（口*洛、木*(於-方)）、空可
  "code":  "T014461",       // 大正蔵/CBETA 欠字コード、空可
  "uni":   "𢤱",            // 対応する既存 Unicode 文字、空可
  "timestamp": "20260627220102"   // 追加時刻 yyyyMMddHHmmss（一覧はこれで降順）
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

## ライセンス

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)

# rare-glyph — Rare Glyphs in Scriptures · IDS Builder

[繁體中文](./README.zh-Hant.md) · [日本語](./README.ja.md)

A curation tool for **rare / missing glyphs (缺字) found in Buddhist scriptures and classical texts**. It manages the shared SVG corpus, describes each glyph (standard Unicode IDS, CBETA composition, Taishō/CBETA code, readings, and the corresponding Unicode character if one now exists), and generates the family `.glyph` `<span>` markup you can paste straight into `markdown-library` / `markdown-reader` documents.

Part of the **nodeapp WebApp family** — shared conventions live in [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family) (`DESIGN_GUIDELINES.md`, `WORKFLOW.md`). Built via Path A (GitHub-first). Full design notes: [DESIGN.md](./DESIGN.md).

## Features

- **Glyph corpus** — browse the SVGs under `/lib/Typeface/svgs/`, rendered with the family `.glyph` technique (CSS `mask` + `currentColor`) so black-on-512 source SVGs show correctly in light/dark and print. Drag-and-drop (or button) upload; delete with `.bak` backup.
- **IDS Builder** — a palette of the 16 Ideographic Description Characters (U+2FF0–2FFF) with arity hints, a copyable `<textarea>`, **live validation** (operand-count + trailing-character checks), and a **structure tree** with per-component code points.
- **CBETA composition** — record CBETA-style composition (`口*洛`, `木*(於-方)`); links to the [CBETA composition rules](https://cbeta.org/character-composition-rules).
- **Code ↔ Unicode** — record the Taishō/CBETA glyph code (`T014461`) and the existing Unicode character it maps to (`𢤱`), with code point and an inline copy icon.
- **Readings** — record the **Pinyin** (`lǒng`) and **Zhuyin / Bopomofo** (`ㄌㄨㄥˇ`) you were able to look up; both optional and free-form (multiple readings as `luò / lào`). A collapsible **Bopomofo keypad** (37 symbols + 4 tone marks) inserts straight into the field — an ordinary IME cannot type bare Bopomofo.
- **Note** — a multi-line curator's note (source, look-alikes, what still needs checking). It stays in the registry and **never goes into the generated span**. A row of common-annotation chips (including today's date) inserts straight into the field.
- **Code-only entries** — for glyphs that already exist in Unicode (no SVG needed, e.g. `&T014461;=𢤱`), register them without a `.svg` (keyed by `code`).
- **Span generator** — `.glyph` mask span for glyph entries, or an annotated `<span data-code data-uni data-pinyin data-zhuyin>char</span>` for code-only entries; plus a one-click "copy character".
- **Sort by added time** — every entry carries a `timestamp`; the list sorts newest-first (code-only entries included).
- **Find** — one search box filters the list across `code` / `uni` / `ids` / `cbeta` / readings / note / filename (field-agnostic substring). **Tone-insensitive**: `juan` finds `juàn`, `ㄐㄩㄢ` finds `ㄐㄩㄢˋ` — while a lone tone mark (`ˊ`) still lists just that tone.
- **Download** — original SVG, or a white-background black-glyph **PNG** rasterized client-side.
- Three-language UI (`zh-Hant` / `en` / `ja`), light/dark theme (default dark).

> Needs the Node server (absolute `/api/...` and `/lib/...` paths); **not** compatible with static GitHub Pages hosting.

## Install & run

```bash
npm install
npm start            # → http://localhost:3000/apps/rare-glyph/
```

`PORT` overrides the default 3000.

## Directory structure

```
rare-glyph/
├─ app.js                          # Express entry: port 3000; / → 302 /apps/rare-glyph/
├─ routes/rare-glyph.js            # GET /list · POST /upload · /delete · /registry
└─ public/
   ├─ apps/rare-glyph/             # frontend (served at /apps/rare-glyph/)
   │  ├─ index.html · rare-glyph.css · rare-glyph.js · rare-glyph-lib.js
   │  ├─ glyphs.js                 # registry: window.RG_GLYPHS = [{file, ids, cbeta, code, uni, pinyin, zhuyin, note, timestamp}]
   │  ├─ i18n.js · locales/{zh-Hant,en,ja}.js
   │  ├─ side-tool.css · thinking-dot.css · materialize-dark.css
   │  └─ fonts/                    # IDC fallback subset (U+2FF0–2FFF + U+31EF) for ⿼⿽⿾⿿; bundled BabelStone Han (APL)
   └─ lib/Typeface/svgs/           # shared glyph corpus (repo ships a few samples)
```

> The four newest IDCs (`⿼⿽⿾⿿`, Unicode 15.1) are missing from most system fonts; a tiny
> (~5 KB) `unicode-range`-scoped subset of **BabelStone Han** is bundled so the palette and
> structure tree always render them. Licensed under the ARPHIC PUBLIC LICENSE (see
> `public/apps/rare-glyph/fonts/ARPHIC_PUBLIC_LICENSE.txt` and the bundled note in `LICENSE`).

> **Deliberate divergence from canon:** the glyph corpus and upload target are the shared
> `/lib/Typeface/svgs/` path (not the canonical `/upload/<name>/`), because the generated
> `.glyph` spans must point at the same shared path that `markdown-library` /
> `markdown-reader` already reference. The repo ships only a few sample SVGs; the full
> corpus stays local / in the incubator and is not version-controlled.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/rare-glyph/list` | List corpus `.svg` + code-only entries, merged with registry meta; sorted by `timestamp` desc |
| POST | `/api/rare-glyph/upload` | Upload `.svg` (multipart `myFiles`, ≤ 20, same-name overwrite) |
| POST | `/api/rare-glyph/delete` | Delete `svgs/<file>` (`.bak` first) — body `{ file }` |
| POST | `/api/rare-glyph/registry` | Write back `glyphs.js` (`.bak` first) — body `{ entries: [{file, ids, cbeta, code, uni, pinyin, zhuyin, note, timestamp}] }` |

All responses use the `{ ok: boolean, ... }` envelope; errors are `{ ok: false, error }`.

## Core library (`RareGlyphLib`)

Pure logic, no DOM, no dependencies. Key methods:

```ts
RareGlyphLib.IDC                       // [{ op, cp, arity, key }]  — the 16 IDC operators
parseIds(str)                          // → { ok, tree? } | { ok:false, code:'empty'|'needMore'|'trailing', op?, need?, got?, extra? }
buildSpan({ file, stem, ids, cbeta, code, uni, pinyin, zhuyin })   // → the <span class="glyph" …> string (glyph entries)
buildCharSpan({ code, uni, pinyin, zhuyin })      // → <span data-code data-uni …>char</span> (code-only entries)
codeFromFile(file)                     // filename without .svg (display stem / aria-label)
leafChars(tree)                        // component characters in the parsed tree
listFiles() / uploadFiles(files) / deleteFile(file) / saveRegistry(entries)
svgUrl(file) / downloadUrl(file) / timestamp(date) / formatSize(bytes)
```

### Data shapes

```jsonc
// glyphs.js  →  window.RG_GLYPHS  (each entry)
{
  "file":  "T011774.svg",   // .svg under /lib/Typeface/svgs/; ""  = code-only entry (keyed by code)
  "ids":   "",              // standard IDS (⿰⿱… U+2FF0–2FFF), may be ""
  "cbeta": "",              // CBETA composition (口*洛, 木*(於-方)), may be ""
  "code":  "T014461",       // Taishō/CBETA glyph code, may be ""
  "uni":   "𢤱",            // corresponding existing Unicode char, may be ""
  "pinyin": "lǒng",         // Pinyin you looked up (multiple as "luò / lào"), may be ""
  "zhuyin": "ㄌㄨㄥˇ",       // Zhuyin / Bopomofo you looked up, may be ""
  "note":   "",             // curator's note, may be multi-line; never emitted into the span
  "timestamp": "20260627220102"   // added time yyyyMMddHHmmss (list sorts by this, desc)
}

// GET /api/rare-glyph/list  →
{
  "ok": true,
  "files": [
    { "file":"T011774.svg", "hasSvg":true, "stem":"T011774", "size":7501, "mtime":..., "birthtime":...,
      "timestamp":"20260627220102", "ids":"", "cbeta":"", "code":"T014461", "uni":"𢤱",
      "pinyin":"lǒng", "zhuyin":"ㄌㄨㄥˇ", "note":"" }
  ]
}
```

## License

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)

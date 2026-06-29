/**
 * rare-glyph（經典中罕見字管理）
 * ------------------------------
 * 後端 handler，搭配 public/apps/rare-glyph 前端使用。
 *
 * 缺字 SVG 語料放在 public/lib/Typeface/svgs/（家族共用 Typeface 路徑、靜態服務，
 * 前端的 <span class="glyph" style="--g:url('/lib/Typeface/svgs/…')"> 直接引用）。
 * 每支 svg 的 IDS 描述登錄在 public/apps/rare-glyph/glyphs.js（window.RG_GLYPHS）。
 *
 * 本 router 提供：
 *   GET  /api/rare-glyph/list      → { ok, files:[{ file, code, size, mtime, ids }] }   列 svgs/ 下 .svg + 併 IDS
 *   POST /api/rare-glyph/upload    → 上傳 .svg 到 svgs/（multipart，欄位 myFiles，最多 20，同名覆寫）
 *   POST /api/rare-glyph/delete    → 刪除 svgs/<file>（刪前 .bak 備份）          body { file }
 *   POST /api/rare-glyph/registry  → 寫回 glyphs.js（覆寫前 .bak）               body { entries:[{file, ids}] }
 *
 * 安全限制（canon §8）：
 *   - 操作目標固定（svgs/ 目錄 / glyphs.js），不接受任意外部路徑
 *   - 檔名 sanitize（basename===原值、非 . / ..、不含 / \ \0、副檔名須 .svg）
 *   - 落點檢查 startsWith(SVGS_DIR + sep)
 *   - 覆寫 / 刪除前自動 .bak 備份；registry 以 JSON.stringify 產生（字串安全跳脫）
 */

const express = require('express');
const path = require('path');
const fsp = require('fs').promises;
const multer = require('multer');

const router = express.Router();

const SVGS_DIR = path.join(__dirname, '..', 'public', 'lib', 'Typeface', 'svgs');
const REGISTRY_FILE = path.join(__dirname, '..', 'public', 'apps', 'rare-glyph', 'glyphs.js');
const SVG_RE = /\.svg$/i;
const MAX_FILES = 20;

function isVisible(name) {
  return typeof name === 'string' && name.length > 0 && name[0] !== '.';
}

function pad2(n) { return ('0' + n).slice(-2); }
function stamp(d) {
  d = d || new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}
// 由 epoch ms 產生 yyyyMMddHHmmss（svg 未存過 timestamp 時以 birthtime 回退用）
function stampFromMs(ms) { return ms ? stamp(new Date(ms)) : ''; }

// 修正瀏覽器送來的檔名亂碼（latin1→utf8）
function fixName(name) {
  try { return Buffer.from(String(name), 'latin1').toString('utf8'); } catch (e) { return String(name || ''); }
}

// svg-code = 檔名去副檔名（aria-label「缺字 {code}」用）
function codeOf(file) { return String(file).replace(SVG_RE, ''); }

// 檔名消毒：trim、非空、basename===原值、非 . / ..、不含 / \ \0、副檔名 .svg
// （允許全形描述字元如 ＊ ／ ＠ （） 與 CJK——它們不影響路徑安全）
function sanitizeSvgName(name) {
  const n = String(name == null ? '' : name).trim();
  if (!n || n === '.' || n === '..') return null;
  if (/[\/\\\0]/.test(n)) return null;
  // 也擋 HTML 危險字元與控制字元：檔名會被前端塞進屬性（aria-label / style url），
  // 留著 " ' < > & 可造成屬性逸出 / DOM 注入。描述式檔名用的是全形 ＊／（）＠ 不受影響。
  if (/[<>"'&\x00-\x1f]/.test(n)) return null;
  if (path.basename(n) !== n) return null;
  if (!SVG_RE.test(n)) return null;
  return n;
}

// 落點檢查
function within(baseDir, abs) {
  return abs === baseDir || abs.startsWith(baseDir + path.sep);
}

// 覆寫 / 刪除前備份到 <dir>/.bak/<name>-yyyyMMddHHmmss.bak（檔案不存在則略過）
async function backup(absFile) {
  try { await fsp.access(absFile); } catch (e) { return; }
  const bakDir = path.join(path.dirname(absFile), '.bak');
  await fsp.mkdir(bakDir, { recursive: true });
  await fsp.copyFile(absFile, path.join(bakDir, path.basename(absFile) + '-' + stamp() + '.bak'));
}

// 讀現有 glyphs.js → { byFile: { file: {ids,cbeta,code,uni} }, codeOnly: [{ids,cbeta,code,uni}] }
//   有 file → 字形登錄（併入檔案系統 svg 清單）；無 file → 無字形登錄（以 code 為鍵）
async function readRegistry() {
  const byFile = {};
  const codeOnly = [];
  try {
    const txt = await fsp.readFile(REGISTRY_FILE, 'utf8');
    const m = txt.match(/window\.RG_GLYPHS\s*=\s*(\[[\s\S]*?\]);/);
    if (m) {
      const arr = JSON.parse(m[1]);
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (!e || typeof e !== 'object') continue;
          const meta = {
            ids: String(e.ids || ''),
            cbeta: String(e.cbeta || ''),
            code: String(e.code || ''),
            uni: String(e.uni || ''),
            timestamp: String(e.timestamp || '')   // 加入時間 yyyyMMddHHmmss
          };
          if (e.file) byFile[String(e.file)] = meta;
          else if (meta.code) codeOnly.push(meta);
        }
      }
    }
  } catch (e) { /* 缺檔 / 解析失敗 → 空表 */ }
  return { byFile, codeOnly };
}

// GET /list — 列出 svgs/ 下的 .svg，併入 registry 的 IDS
router.get('/list', async (req, res) => {
  try {
    let entries;
    try {
      entries = await fsp.readdir(SVGS_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') entries = [];
      else throw err;
    }
    const reg = await readRegistry();
    const files = [];
    for (const ent of entries) {
      if (!isVisible(ent.name) || !ent.isFile() || !SVG_RE.test(ent.name)) continue;
      const abs = path.join(SVGS_DIR, ent.name);
      const stat = await fsp.stat(abs);
      const meta = reg.byFile[ent.name] || {};
      const birthtime = stat.birthtimeMs || stat.mtimeMs;   // 創建日期（某些 FS 無 birthtime → 退回 mtime）
      files.push({
        file: ent.name,
        hasSvg: true,
        stem: codeOf(ent.name),                        // 顯示用識別（檔名去副檔名）
        size: stat.size,
        mtime: stat.mtimeMs,
        birthtime: birthtime,
        timestamp: meta.timestamp || stampFromMs(birthtime),  // 加入時間（未存過 → 以 birthtime 回退）
        ids: meta.ids || '',
        cbeta: meta.cbeta || '',
        code: meta.code || '',                         // 大正藏/CBETA 缺字碼
        uni: meta.uni || ''                            // 對應 Unicode 字
      });
    }
    // 無字形登錄（無 .svg、以 code 為鍵）併入清單
    for (const meta of reg.codeOnly) {
      files.push({
        file: '',
        hasSvg: false,
        stem: '',
        size: 0,
        mtime: 0,
        birthtime: 0,
        timestamp: meta.timestamp || '',
        ids: meta.ids || '',
        cbeta: meta.cbeta || '',
        code: meta.code || '',
        uni: meta.uni || ''
      });
    }
    // 統一依「加入時間 timestamp」降冪（最近加入排最前）；空 timestamp 沉底，再以 file/code 為穩定次序
    const sortKey = (f) => f.timestamp || '00000000000000';
    files.sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || (a.file || a.code).localeCompare(b.file || b.code, 'zh-Hant'));
    return res.json({ ok: true, files });
  } catch (err) {
    console.error('[rare-glyph] GET /list failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// --- 上傳：multer 寫入 SVGS_DIR，保留消毒後原檔名（同名覆寫）---
const storage = multer.diskStorage({
  destination(req, file, cb) {
    fsp.mkdir(SVGS_DIR, { recursive: true }).then(() => cb(null, SVGS_DIR)).catch(cb);
  },
  filename(req, file, cb) {
    const safe = sanitizeSvgName(fixName(file.originalname));
    if (!safe) return cb(new Error('不允許的檔名（僅接受 .svg）：' + file.originalname));
    cb(null, safe);
  }
});
const upload = multer({ storage, limits: { files: MAX_FILES, fileSize: 5 * 1024 * 1024 } });

// POST /upload — 上傳 .svg 到 svgs/
router.post('/upload', (req, res) => {
  upload.array('myFiles', MAX_FILES)(req, res, (err) => {
    if (err) {
      console.error('[rare-glyph] POST /upload failed:', err.message);
      return res.status(400).json({ ok: false, error: err.message });
    }
    const files = (req.files || []).map(f => ({ file: f.filename, code: codeOf(f.filename), size: f.size }));
    console.log('[rare-glyph] POST /upload →', files.length, 'file(s)');
    return res.json({ ok: true, files });
  });
});

// POST /delete — 刪除 svgs/<file>（刪前 .bak）  body { file }
router.post('/delete', async (req, res) => {
  try {
    const safe = sanitizeSvgName(req.body && req.body.file);
    if (!safe) return res.status(400).json({ ok: false, error: '不允許的檔名' });
    const abs = path.join(SVGS_DIR, safe);
    if (!within(SVGS_DIR, abs)) return res.status(400).json({ ok: false, error: '路徑越界' });
    try { await fsp.access(abs); } catch (e) { return res.status(404).json({ ok: false, error: '檔案不存在' }); }
    await backup(abs);
    await fsp.unlink(abs);
    console.log('[rare-glyph] POST /delete →', safe);
    return res.json({ ok: true, file: safe });
  } catch (err) {
    console.error('[rare-glyph] POST /delete failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /registry — 寫回 glyphs.js（覆寫前 .bak）  body { entries:[{file, ids}] }
router.post('/registry', async (req, res) => {
  try {
    const entries = req.body && req.body.entries;
    if (!Array.isArray(entries)) return res.status(400).json({ ok: false, error: 'entries 需為陣列' });

    const clean = [];
    const seenFile = new Set();
    const seenCode = new Set();
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const file = String(e.file == null ? '' : e.file).trim();
      const ids = String(e.ids == null ? '' : e.ids).trim();
      const cbeta = String(e.cbeta == null ? '' : e.cbeta).trim();
      const code = String(e.code == null ? '' : e.code).trim();
      const uni = String(e.uni == null ? '' : e.uni).trim();
      const timestamp = String(e.timestamp == null ? '' : e.timestamp).trim();
      // 每筆需有 file（字形登錄）或 code（無字形登錄）其一
      if (!file && !code) return res.status(400).json({ ok: false, error: '每筆登錄需有 file 或 code' });
      if (!/^\d{0,14}$/.test(timestamp)) return res.status(400).json({ ok: false, error: 'timestamp 需為 yyyyMMddHHmmss' });
      if (file) {
        if (/[\/\\\0]/.test(file) || /[<>"'&\x00-\x1f]/.test(file) || !SVG_RE.test(file)) return res.status(400).json({ ok: false, error: '不合法的 file：' + file });
        if (seenFile.has(file)) return res.status(400).json({ ok: false, error: 'file 重複：' + file });
        seenFile.add(file);
      } else {
        // 無字形登錄：以 code 為鍵，需唯一
        if (seenCode.has(code)) return res.status(400).json({ ok: false, error: 'code 重複（無字形登錄）：' + code });
        seenCode.add(code);
      }
      if (/\0/.test(ids)) return res.status(400).json({ ok: false, error: 'ids 含非法字元' });
      if (/\0/.test(cbeta)) return res.status(400).json({ ok: false, error: 'cbeta 含非法字元' });
      if (/[\0\x01-\x1f]/.test(code)) return res.status(400).json({ ok: false, error: 'code 含非法字元' });
      if (/[\0\x01-\x1f]/.test(uni)) return res.status(400).json({ ok: false, error: 'uni 含非法字元' });
      clean.push({ file, ids, cbeta, code, uni, timestamp: timestamp || stamp() });   // 缺 timestamp → 視為此刻加入
    }
    // 字形登錄（有 file）在前依檔名、無字形登錄（無 file）在後依 code
    clean.sort((a, b) =>
      (a.file ? 0 : 1) - (b.file ? 0 : 1) ||
      (a.file || a.code).localeCompare(b.file || b.code, 'zh-Hant'));

    await backup(REGISTRY_FILE);
    const header =
      '/**\n' +
      ' * glyphs.js — 缺字登錄（由 rare-glyph 前端「存檔」維護；可手改，格式會在下次存檔被覆寫）\n' +
      ' *   file ：/lib/Typeface/svgs/ 下的 .svg 檔名（含副檔名）；留空＝無字形登錄（以 code 為鍵）\n' +
      ' *   ids  ：該缺字的 Unicode Ideographic Description Sequence（⿰⿱… U+2FF0–2FFF），可空\n' +
      ' *   cbeta：該缺字的 CBETA 組字式（如 口*洛、木*(於-方)），可空；規則見 https://cbeta.org/character-composition-rules\n' +
      ' *   code ：大正藏/CBETA 缺字碼（如 T014461、MT01414），可空\n' +
      ' *   uni  ：該缺字對應的既有 Unicode 字（如 𢤱），可空\n' +
      ' *   timestamp：加入時間 yyyyMMddHHmmss（清單依此降冪排序；無字形登錄亦可排序）\n' +
      ' */\n';
    const body = 'window.RG_GLYPHS = ' + JSON.stringify(clean, null, 2) + ';\n';
    await fsp.writeFile(REGISTRY_FILE, header + body, 'utf8');
    console.log('[rare-glyph] POST /registry → wrote', clean.length, 'entries');
    return res.json({ ok: true, count: clean.length });
  } catch (err) {
    console.error('[rare-glyph] POST /registry failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

/**
 * rare-glyph-lib.js — 經典中罕見字管理的核心 library（純邏輯、不碰 DOM、零依賴）
 *
 * 負責：
 *   - IDC 運算子表（Unicode Ideographic Description Characters，U+2FF0–2FFF）含元數（arity）
 *   - IDS（Ideographic Description Sequence）解析 / 驗證 → 結構樹、錯誤定位
 *   - 由 { file, ids } 產生家族慣例的 <span class="glyph"> 標記字串
 *   - 後端 API（list / upload / delete / registry）的 fetch 包裝
 *
 * 不碰 DOM / 不依賴 jQuery / Materialize；UI 由 rare-glyph.js（控制器）呼叫本 lib。
 *
 * 對應後端：routes/rare-glyph.js（API 前綴 /api/rare-glyph，回應一律 { ok, ... }）
 * 缺字 SVG 語料路徑：/lib/Typeface/svgs/（家族共用 Typeface 路徑）
 *
 * Public API（window.RareGlyphLib）：
 *   IDC                      → IDC 運算子陣列 [{ op, cp, arity, key }]
 *   isIdc(ch) / arityOf(ch)  → 是否運算子 / 其元數
 *   parseIds(str)            → { ok, tree?, code?, op?, need?, got?, extra? }
 *   describeTree(tree)       → 巢狀大綱（供 UI 繪結構樹）
 *   leafChars(tree)          → 組件葉節點字元陣列
 *   codeFromFile(file)       → 去 .svg 副檔名（aria-label「缺字 {code}」用）
 *   svgUrl(file)             → /lib/Typeface/svgs/<file>
 *   buildSpan({file, ids})   → <span class="glyph" …> 字串
 *   isUploadableSvg(name)    → 副檔名白名單（.svg）
 *   listFiles() / uploadFiles(files) / deleteFile(file) / saveRegistry(entries)
 *   formatSize(bytes) / timestamp(date)
 */
(function (window) {
  'use strict';

  var API = '/api/rare-glyph';
  var SVG_BASE = '/lib/Typeface/svgs/';

  /* ---- IDC 運算子表（U+2FF0–2FFF）。key 對應 locales 的 idc.* ---- */
  var IDC = [
    { op: '⿰', cp: 0x2FF0, arity: 2, key: 'idc.2ff0' }, // ⿰ 左右
    { op: '⿱', cp: 0x2FF1, arity: 2, key: 'idc.2ff1' }, // ⿱ 上下
    { op: '⿲', cp: 0x2FF2, arity: 3, key: 'idc.2ff2' }, // ⿲ 左中右
    { op: '⿳', cp: 0x2FF3, arity: 3, key: 'idc.2ff3' }, // ⿳ 上中下
    { op: '⿴', cp: 0x2FF4, arity: 2, key: 'idc.2ff4' }, // ⿴ 全包圍
    { op: '⿵', cp: 0x2FF5, arity: 2, key: 'idc.2ff5' }, // ⿵ 上包圍
    { op: '⿶', cp: 0x2FF6, arity: 2, key: 'idc.2ff6' }, // ⿶ 下包圍
    { op: '⿷', cp: 0x2FF7, arity: 2, key: 'idc.2ff7' }, // ⿷ 左包圍
    { op: '⿸', cp: 0x2FF8, arity: 2, key: 'idc.2ff8' }, // ⿸ 左上包圍
    { op: '⿹', cp: 0x2FF9, arity: 2, key: 'idc.2ff9' }, // ⿹ 右上包圍
    { op: '⿺', cp: 0x2FFA, arity: 2, key: 'idc.2ffa' }, // ⿺ 左下包圍
    { op: '⿻', cp: 0x2FFB, arity: 2, key: 'idc.2ffb' }, // ⿻ 重疊
    { op: '⿼', cp: 0x2FFC, arity: 2, key: 'idc.2ffc' }, // ⿼ 右包圍（Unicode 15.1）
    { op: '⿽', cp: 0x2FFD, arity: 2, key: 'idc.2ffd' }, // ⿽ 右下包圍
    { op: '⿾', cp: 0x2FFE, arity: 1, key: 'idc.2ffe' }, // ⿾ 水平翻轉（一元）
    { op: '⿿', cp: 0x2FFF, arity: 1, key: 'idc.2fff' }  // ⿿ 旋轉（一元）
  ];

  var MAP = {};
  IDC.forEach(function (e) { MAP[e.op] = e; });

  function isIdc(ch) { return Object.prototype.hasOwnProperty.call(MAP, ch); }
  function arityOf(ch) { return MAP[ch] ? MAP[ch].arity : 0; }

  // 以「碼位」切字（surrogate-safe；CJK 擴展字屬星形平面）
  function toCodePoints(str) { return Array.from(String(str == null ? '' : str)); }

  /**
   * 解析 IDS → 結構樹。回傳：
   *   成功 { ok:true, tree }
   *   空字串 { ok:false, code:'empty' }
   *   運算元不足 { ok:false, code:'needMore', op, need, got }
   *   多餘字元 { ok:false, code:'trailing', extra }
   * 葉節點 = 任何非 IDC 運算子的單一碼位（組件字 / 部件 / U+FFFD 缺字符…）。
   */
  function parseIds(str) {
    var cps = toCodePoints(String(str == null ? '' : str).trim());
    if (!cps.length) return { ok: false, code: 'empty' };
    var pos = 0;

    function node() {
      var ch = cps[pos++];
      var e = MAP[ch];
      if (e) {
        var children = [];
        for (var k = 0; k < e.arity; k++) {
          if (pos >= cps.length) return { err: { code: 'needMore', op: ch, need: e.arity, got: k } };
          var c = node();
          if (c.err) return c;
          children.push(c.val);
        }
        return { val: { op: ch, children: children } };
      }
      return { val: { leaf: ch } };
    }

    var r = node();
    if (r.err) return Object.assign({ ok: false }, r.err);
    if (pos < cps.length) return { ok: false, code: 'trailing', extra: cps.slice(pos).join('') };
    return { ok: true, tree: r.val };
  }

  // 結構樹 → 巢狀大綱（供 UI 繪樹）：{ op, label?, children:[…] } 或 { leaf }
  function describeTree(tree) {
    if (!tree) return null;
    if (tree.leaf != null) return { leaf: tree.leaf };
    return {
      op: tree.op,
      key: MAP[tree.op] ? MAP[tree.op].key : null,
      children: (tree.children || []).map(describeTree)
    };
  }

  // 蒐集葉節點（組件字）
  function leafChars(tree) {
    var out = [];
    (function walk(n) {
      if (!n) return;
      if (n.leaf != null) { out.push(n.leaf); return; }
      (n.children || []).forEach(walk);
    })(tree);
    return out;
  }

  function codeFromFile(file) { return String(file == null ? '' : file).replace(/\.svg$/i, ''); }
  function svgUrl(file) { return SVG_BASE + String(file == null ? '' : file); }
  // 下載用：檔名逐段編碼（全形 ＊／（）＠ 與 CJK 編成 %xx，Express static 解碼後對回原檔）
  function downloadUrl(file) { return SVG_BASE + encodeURIComponent(String(file == null ? '' : file)); }

  // 屬性值跳脫（IDS / 檔名理論上不含這些字元，仍做保險）
  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 產生家族慣例的缺字 span（與 markdown-library / markdown-reader 的 .glyph 相容）：
   * <span class="glyph" style="--g:url('/lib/Typeface/svgs/<file>')" role="img"
   *       aria-label="缺字 <code>" data-ids="<ids>"></span>
   * url() 內以單引號包路徑；style 屬性用雙引號 → 互不衝突。
   */
  function buildSpan(opt) {
    opt = opt || {};
    var file = String(opt.file == null ? '' : opt.file);
    var ids = String(opt.ids == null ? '' : opt.ids).trim();
    var cbeta = String(opt.cbeta == null ? '' : opt.cbeta).trim();
    var code = String(opt.code == null ? '' : opt.code).trim();   // 大正藏/CBETA 缺字碼（如 T014461）
    var uni = String(opt.uni == null ? '' : opt.uni).trim();      // 對應的 Unicode 字（如 𢤱）
    var stem = opt.stem != null ? String(opt.stem) : codeFromFile(file);  // 顯示用識別（檔名去副檔名）
    // style 屬性用雙引號包覆、url() 內用單引號包路徑；路徑內單引號跳脫（極罕見）。
    var urlInner = svgUrl(file).replace(/'/g, "\\'");
    var attrs =
      'class="glyph" ' +
      'style="--g:url(\'' + urlInner + '\')" ' +
      'role="img" ' +
      'aria-label="' + escAttr('缺字 ' + stem) + '"';
    if (ids) attrs += ' data-ids="' + escAttr(ids) + '"';
    if (cbeta) attrs += ' data-cbeta="' + escAttr(cbeta) + '"';   // CBETA 組字式
    if (code) attrs += ' data-code="' + escAttr(code) + '"';      // 大正藏/CBETA 缺字碼
    if (uni) attrs += ' data-uni="' + escAttr(uni) + '"';         // 對應 Unicode 字
    return '<span ' + attrs + '></span>';
  }

  /**
   * 無字形（已有對應 Unicode 字、無 .svg）的「帶 code 註記 span」：
   * <span data-code="T014461" data-uni="𢤱">𢤱</span>（內容為對應字本身）
   * 保留缺字碼來源，利日後轉換／檢索；有對應字時內容即該字。
   */
  function buildCharSpan(opt) {
    opt = opt || {};
    var code = String(opt.code == null ? '' : opt.code).trim();
    var uni = String(opt.uni == null ? '' : opt.uni).trim();
    var attrs = [];
    if (code) attrs.push('data-code="' + escAttr(code) + '"');
    if (uni) attrs.push('data-uni="' + escAttr(uni) + '"');
    return '<span' + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + escAttr(uni) + '</span>';
  }

  function isUploadableSvg(name) { return /\.svg$/i.test(String(name == null ? '' : name)); }

  /* ---- API 包裝（一律回 { ok, ... }；讀取走 no-store + cache-busting） ---- */
  function bust(url) { return url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(); }

  function listFiles() {
    return fetch(bust(API + '/list'), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'list failed');
        return j.files || [];
      });
  }

  function uploadFiles(files) {
    var fd = new FormData();
    Array.prototype.forEach.call(files, function (f) { fd.append('myFiles', f); });
    return fetch(API + '/upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'upload failed');
        return j.files || [];
      });
  }

  function deleteFile(file) {
    return fetch(API + '/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'delete failed');
        return j;
      });
  }

  function saveRegistry(entries) {
    return fetch(API + '/registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: entries })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'registry save failed');
        return j;
      });
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad3(n) { return ('00' + n).slice(-3); }

  // 預設缺字碼 yyyyMMdd-###：### 在「當天」內連續（掃描現有 code 中符合 <當天>-### 的最大號 +1）。
  // 自訂碼（如 T014461）不符此格式，不影響流水號。
  function suggestCode(codes, date) {
    var d = date || new Date();
    var ymd = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var re = new RegExp('^' + ymd + '-(\\d+)$');
    var max = 0;
    (codes || []).forEach(function (c) {
      var m = re.exec(String(c == null ? '' : c).trim());
      if (m) { var n = parseInt(m[1], 10); if (isFinite(n) && n > max) max = n; }
    });
    return ymd + '-' + pad3(max + 1);
  }

  function timestamp(date) {
    var d = date || new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  window.RareGlyphLib = {
    IDC: IDC,
    isIdc: isIdc,
    arityOf: arityOf,
    parseIds: parseIds,
    describeTree: describeTree,
    leafChars: leafChars,
    codeFromFile: codeFromFile,
    svgUrl: svgUrl,
    downloadUrl: downloadUrl,
    buildSpan: buildSpan,
    buildCharSpan: buildCharSpan,
    suggestCode: suggestCode,
    isUploadableSvg: isUploadableSvg,
    listFiles: listFiles,
    uploadFiles: uploadFiles,
    deleteFile: deleteFile,
    saveRegistry: saveRegistry,
    formatSize: formatSize,
    timestamp: timestamp
  };
})(window);

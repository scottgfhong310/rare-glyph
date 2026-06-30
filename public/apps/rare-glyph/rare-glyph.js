/**
 * rare-glyph.js — 頁面控制器 / 膠水（碰 DOM；用 jQuery / Materialize）
 *
 * 職責：載入缺字清單、繪缺字網格、IDC 調色盤、IDS 即時驗證與結構樹、產生 span、
 *       上傳 / 刪除 SVG、新增無字形登錄、寫回登錄、主題 / 語言切換。
 * 純邏輯（IDS 解析、span 產生、API）在 rare-glyph-lib.js（window.RareGlyphLib）。
 *
 * 條目（entry）有兩型，皆以 _key 為記憶體鍵：
 *   - 字形登錄（svg）：entry.file 非空（如 T011774.svg），_key = file
 *   - 無字形登錄（已有對應 Unicode 字、無 svg）：entry.file = ''，_key = 'code:'+code（未存檔暫為 'new:'+seq）
 * 每條目的可編輯資料放 state.metaByKey[_key] = { ids, cbeta, code, uni }（記憶體唯一真相）。
 */
(function () {
  'use strict';
  var Lib = window.RareGlyphLib;

  var THEME_KEY = 'rare-glyph-theme';

  var state = {
    files: [],          // [{ file, hasSvg, stem, size, birthtime, ids, cbeta, code, uni, _key }]
    metaByKey: {},      // { key: { ids, cbeta, code, uni } }
    current: null,      // 目前選中的 _key
    seq: 0,             // 未存檔無字形登錄的臨時 key 序號
    filter: '',         // find 搜尋字串（小寫；跨 file/code/uni/ids/cbeta 比對）
    savedByKey: {}      // 已存檔基準（key → 持久化快照）；與 metaByKey 比對得 dirty
  };

  /* ---------- 小工具 ---------- */
  function t(k, p) { return window.I18n.t(k, p); }

  function toast(msg, cls) {
    if (window.M && M.toast) M.toast({ html: msg, classes: cls || '' });
  }

  var loadingTimer = null;
  function showLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(function () { document.getElementById('loading').classList.add('show'); }, 180);
  }
  function hideLoading() {
    clearTimeout(loadingTimer);
    document.getElementById('loading').classList.remove('show');
  }

  // 側鍵「已執行」微回饋：icon 暫變 check 800ms（#setting-mode 除外）
  function setIconDone(el) {
    var i = el.querySelector('i.material-icons');
    if (!i) return;
    var prev = i.textContent;
    i.textContent = 'check';
    setTimeout(function () { i.textContent = prev; }, 800);
  }

  function cpHex(ch) {
    return 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');   // 也跳脫引號：供屬性（aria-label / style）情境安全
  }

  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // Materialize 原生欄位：設值後同步浮動標籤與 textarea 自動高度
  function syncTextareas() {
    if (!window.M) return;
    try { M.updateTextFields(); } catch (e) {}
    ['ids-input', 'cbeta-input', 'span-output'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && M.textareaAutoResize) { try { M.textareaAutoResize(el); } catch (e) {} }
    });
  }

  // 下載側鍵只在「有 svg 的選字」時顯示（§4.7：檔案動作鍵綁開檔狀態）
  function showDownload(show) {
    ['setting-download', 'setting-download-png'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = show ? 'flex' : 'none';
    });
  }
  // 「回到所選字」側鍵只在有選取時顯示
  function showLocate(show) {
    var el = document.getElementById('setting-locate');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  /* ---------- 頁面捲動導覽 ---------- */
  function scrollPageTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function scrollPageBottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }
  function scrollToSelected() {
    if (!state.current) return;
    var c = document.querySelector('.glyph-cell[data-key="' + cssEsc(state.current) + '"]');
    if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- 條目存取 ---------- */
  function entryByKey(key) {
    for (var i = 0; i < state.files.length; i++) if (state.files[i]._key === key) return state.files[i];
    return null;
  }
  function metaOf(key) {
    if (!state.metaByKey[key]) state.metaByKey[key] = { ids: '', cbeta: '', code: '', uni: '', timestamp: '' };
    return state.metaByKey[key];
  }
  function keyForServer(f) { return f.file ? f.file : ('code:' + (f.code || '')); }

  /* ---------- 未存檔變更偵測（記憶體 vs glyphs.js 已存檔狀態） ----------
   * state.savedByKey 為「上次載入／存檔時的持久化基準」；與當前 metaByKey 比對即得 dirty。*/
  function entrySnap(key) {
    var f = entryByKey(key), m = metaOf(key);
    return { file: (f && f.file) || '', ids: m.ids || '', cbeta: m.cbeta || '', code: m.code || '', uni: m.uni || '', ts: m.timestamp || '' };
  }
  function snapshotCurrent() {
    var snap = {};
    state.files.forEach(function (f) { snap[f._key] = entrySnap(f._key); });
    return snap;
  }
  function entryDirty(key) {
    var sav = state.savedByKey[key];
    if (!sav) return true;                                  // 新增、尚未存檔
    return JSON.stringify(entrySnap(key)) !== JSON.stringify(sav);
  }
  function isDirty() {
    var cur = {};
    for (var i = 0; i < state.files.length; i++) {
      var k = state.files[i]._key; cur[k] = 1;
      if (entryDirty(k)) return true;
    }
    for (var sk in state.savedByKey) { if (!cur[sk]) return true; }   // 被移除但未存檔
    return false;
  }
  // 更新存檔側鍵的「未存檔」提示（橘點 + accent + title）
  function refreshDirty() {
    var dirty = isDirty();
    var btn = document.getElementById('setting-save');
    if (btn) {
      btn.classList.toggle('dirty', dirty);
      btn.title = t(dirty ? 'tool.saveDirty' : 'tool.save');
    }
  }

  /* ---------- 主題 ---------- */
  function applyTheme(theme) {
    var r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.classList.toggle('dark-mode', theme === 'dark');
    r.classList.toggle('light-mode', theme === 'light');
    var icon = document.querySelector('#setting-mode i');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  function initTheme() {
    var saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved);
  }

  /* ---------- IDC 調色盤 ---------- */
  function renderPalette() {
    var pal = document.getElementById('idc-palette');
    pal.innerHTML = '';
    Lib.IDC.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'idc-btn';
      b.title = t(e.key) + '（' + e.arity + '）';
      b.innerHTML = '<span class="idc-op">' + e.op + '</span>' +
        '<span class="idc-arity">' + e.arity + '</span>';
      b.addEventListener('click', function () { insertAtCursor(e.op); });
      pal.appendChild(b);
    });
  }

  // 在 textarea 游標處插入 text；back＝插入後游標回退字數（如插入 '()' 時 back=1 置於括號內）
  function insertAtCaret(ta, text, back) {
    var s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    var en = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(en);
    var pos = s + text.length - (back || 0);
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }
  function insertAtCursor(text) {
    insertAtCaret(document.getElementById('ids-input'), text, 0);
    onIdsInput();
  }

  /* ---------- CBETA 組字運算子調色盤 ---------- */
  var CBETA_OPS = [
    { op: '*', key: 'cbetaop.lr' },        // 左右
    { op: '/', key: 'cbetaop.tb' },        // 上下
    { op: '@', key: 'cbetaop.surround' },  // 包圍
    { op: '-', key: 'cbetaop.sub' },       // 減（移除部件）
    { op: '+', key: 'cbetaop.add' },       // 加（增添部件）
    { op: '()', key: 'cbetaop.group', back: 1 }  // 群組（游標置於括號內）
  ];
  /* ---------- 常用字快速複製（獨立；不影響選取） ---------- */
  var QUICK_CHARS = [
    { ch: '　', cp: 'U+3000', key: 'quick.ideoSpace' },  // 全形空格
    { ch: '〇', cp: 'U+3007', key: 'quick.ideoZero' }    // 〇 表意數字零
  ];
  function renderQuickCopy() {
    var box = document.getElementById('quick-copy');
    box.innerHTML = '';
    QUICK_CHARS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'qc-btn';
      b.title = t(e.key) + '（' + e.cp + '）';
      b.innerHTML = '<span class="qc-char">' + escHtml(e.ch) + '</span>' +
        '<span class="qc-cap">' + escHtml(t(e.key)) + '</span>';
      b.addEventListener('click', function () {
        copyText(e.ch, t('quick.copied', { n: t(e.key) }));   // 純複製，不改 state.current
      });
      box.appendChild(b);
    });
  }

  function renderCbetaPalette() {
    var pal = document.getElementById('cbeta-palette');
    pal.innerHTML = '';
    CBETA_OPS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'idc-btn';
      b.title = t(e.key) + '（' + e.op + '）';
      b.innerHTML = '<span class="idc-op">' + e.op + '</span><span class="idc-arity">' + escHtml(t(e.key)) + '</span>';
      b.addEventListener('click', function () {
        insertAtCaret(document.getElementById('cbeta-input'), e.op, e.back || 0);
        onCbetaInput();
      });
      pal.appendChild(b);
    });
  }

  /* ---------- IDS 驗證 + 結構樹 ---------- */
  function renderValidate(res) {
    var el = document.getElementById('ids-validate');
    el.className = 'ids-validate';
    var icon, msg, cls;
    if (res.code === 'empty') {
      cls = 'neutral'; icon = 'edit_note'; msg = t('validate.empty');
    } else if (res.ok) {
      cls = 'ok'; icon = 'check_circle';
      msg = t('validate.ok', { n: Lib.leafChars(res.tree).length });
    } else if (res.code === 'needMore') {
      cls = 'err'; icon = 'error';
      msg = t('validate.needMore', { op: res.op, name: opName(res.op), need: res.need, got: res.got });
    } else if (res.code === 'trailing') {
      cls = 'err'; icon = 'error';
      msg = t('validate.trailing', { extra: res.extra });
    } else {
      cls = 'err'; icon = 'error'; msg = t('validate.invalid');
    }
    el.classList.add(cls);
    el.innerHTML = '<i class="material-icons">' + icon + '</i><span></span>';
    el.querySelector('span').textContent = msg;
  }

  function opName(op) {
    var e = Lib.IDC.filter(function (x) { return x.op === op; })[0];
    return e ? t(e.key) : op;
  }

  function renderTree(res) {
    var host = document.getElementById('ids-tree');
    if (res.code === 'empty' || (!res.ok && !res.tree)) {
      host.innerHTML = '<span class="tree-empty">' + escHtml(t('ids.treeEmpty')) + '</span>';
      return;
    }
    var d = Lib.describeTree(res.tree);
    host.innerHTML = '';
    var ul = document.createElement('ul');
    ul.appendChild(nodeLi(d));
    host.appendChild(ul);
  }

  function nodeLi(d) {
    var li = document.createElement('li');
    if (d.leaf != null) {
      li.innerHTML = '<span class="node-leaf">' + escHtml(d.leaf) +
        '<span class="leaf-cp">' + cpHex(d.leaf) + '</span></span>';
      return li;
    }
    li.innerHTML = '<span class="node-op">' + escHtml(d.op) +
      '<span class="op-name">' + escHtml(d.key ? t(d.key) : '') + '</span></span>';
    var ul = document.createElement('ul');
    d.children.forEach(function (c) { ul.appendChild(nodeLi(c)); });
    li.appendChild(ul);
    return li;
  }

  /* ---------- 輸入事件 ---------- */
  function onIdsInput() {
    var ids = document.getElementById('ids-input').value;
    var res = Lib.parseIds(ids);
    renderValidate(res);
    renderTree(res);
    if (state.current) {
      metaOf(state.current).ids = ids.trim();
      updateCell(state.current);
      updateOutput();
    }
    syncTextareas();
  }

  function onCbetaInput() {
    if (!state.current) return;
    metaOf(state.current).cbeta = document.getElementById('cbeta-input').value.trim();
    updateCell(state.current);   // 徽章在無 ids 時以 cbeta 遞補，需即時反映
    updateOutput();
    syncTextareas();
  }

  function onCodeInput() {
    if (!state.current) return;
    metaOf(state.current).code = document.getElementById('code-input').value.trim();
    updateCell(state.current);                 // 無字形登錄的格名＝code
    var entry = entryByKey(state.current);
    if (entry && !entry.file) document.getElementById('detail-code').textContent = metaOf(state.current).code || t('files.unnamed');
    updateOutput();
  }

  function onUniInput() {
    if (!state.current) return;
    metaOf(state.current).uni = document.getElementById('uni-input').value.trim();
    updateCell(state.current);
    updateOutput();
  }

  /* ---------- 缺字網格 ---------- */
  // 描述徽章通用規則：有 ids 顯示 ids，否則顯示 cbeta（皆空 → 佔位）
  function descBadge(meta) {
    var desc = meta.ids || meta.cbeta || '';
    var title = meta.ids ? 'IDS' : (meta.cbeta ? 'CBETA' : '');
    return '<span class="cell-ids' + (desc ? '' : ' empty') + '"' +
      (title ? ' title="' + title + '"' : '') + '>' + escHtml(desc) + '</span>';
  }

  function cellInner(f) {
    var meta = metaOf(f._key);
    if (f.file) {
      var stem = Lib.codeFromFile(f.file);
      var uni = meta.uni || '';
      return '<span class="glyph" style="--g:url(\'' + Lib.svgUrl(f.file).replace(/'/g, "\\'") +
          '\')" role="img" aria-label="' + escHtml('缺字 ' + stem) + '"></span>' +
        (uni ? '<span class="cell-uni" title="對應 Unicode 字">' + escHtml(uni) + '</span>' : '') +
        descBadge(meta) +
        '<span class="cell-name">' + escHtml(stem) + '</span>';
    }
    // 無字形登錄
    var u = meta.uni || '';
    return (u
        ? '<span class="cell-char">' + escHtml(u) + '</span>'
        : '<span class="cell-char cell-char-empty">？</span>') +
      descBadge(meta) +
      '<span class="cell-name">' + escHtml(meta.code || t('files.unnamed')) + '</span>' +
      '<span class="cell-tag">' + escHtml(t('files.codeOnlyTag')) + '</span>';
  }

  // find：跨 file / code(檔名) / code(缺字碼) / uni / ids / cbeta 的不分欄位子字串比對
  function matchEntry(f) {
    if (!state.filter) return true;
    var m = metaOf(f._key);
    var hay = [f.file || '', Lib.codeFromFile(f.file || ''), m.code, m.uni, m.ids, m.cbeta]
      .join('\n').toLowerCase();
    return hay.indexOf(state.filter) >= 0;
  }

  function renderGrid() {
    var grid = document.getElementById('glyph-grid');
    var empty = document.getElementById('files-empty');
    var meta = document.getElementById('files-meta');
    grid.innerHTML = '';
    if (!state.files.length) {
      empty.hidden = false;
      meta.textContent = '';
      return;
    }
    empty.hidden = true;
    var shown = state.files.filter(matchEntry);
    meta.textContent = state.filter
      ? t('files.matchCount', { n: shown.length, total: state.files.length })
      : t('files.count', { n: state.files.length });
    shown.forEach(function (f) {
      var cell = document.createElement('div');
      cell.className = 'glyph-cell' + (f.file ? '' : ' codeonly') +
        (f._key === state.current ? ' active' : '') + (entryDirty(f._key) ? ' dirty' : '');
      cell.dataset.key = f._key;
      cell.innerHTML = cellInner(f);
      cell.addEventListener('click', function () { selectEntry(f._key); scrollPageTop(); });
      grid.appendChild(cell);
    });
  }

  function onFind() {
    var inp = document.getElementById('glyph-find');
    state.filter = inp.value.trim().toLowerCase();
    document.getElementById('glyph-find-clear').hidden = !inp.value;
    renderGrid();
  }

  // 重繪單一格（編輯 ids/uni/code 時即時反映）
  function updateCell(key) {
    var cell = document.querySelector('.glyph-cell[data-key="' + cssEsc(key) + '"]');
    var f = entryByKey(key);
    if (!cell || !f) return;
    cell.innerHTML = cellInner(f);
    cell.classList.toggle('dirty', entryDirty(key));
  }

  /* ---------- 選取 + 詳情 + 輸出 ---------- */
  function selectEntry(key) {
    var entry = entryByKey(key);
    if (!entry) return;
    state.current = key;
    var meta = metaOf(key);
    document.querySelectorAll('.glyph-cell').forEach(function (c) {
      c.classList.toggle('active', c.dataset.key === key);
    });

    document.getElementById('ids-input').value = meta.ids;
    document.getElementById('cbeta-input').value = meta.cbeta;
    document.getElementById('code-input').value = meta.code;
    document.getElementById('uni-input').value = meta.uni;

    var res = Lib.parseIds(meta.ids);
    renderValidate(res);
    renderTree(res);

    renderDetail(entry, meta);
    updateOutput();
    syncTextareas();
  }

  function renderDetail(entry, meta) {
    document.getElementById('detail-empty').hidden = true;
    document.getElementById('detail-body').hidden = false;
    showLocate(true);
    var preview = document.querySelector('.detail-preview');
    var dg = document.getElementById('detail-glyph');
    var delLabel = document.querySelector('#detail-delete .del-label');

    if (entry.file) {
      var stem = Lib.codeFromFile(entry.file);
      preview.classList.add('has-svg');
      dg.style.display = '';
      dg.style.setProperty('--g', "url('" + Lib.svgUrl(entry.file).replace(/'/g, "\\'") + "')");
      dg.setAttribute('aria-label', '缺字 ' + stem);
      document.getElementById('detail-code').textContent = stem;
      document.getElementById('detail-file').textContent = entry.file + (entry.size ? '（' + Lib.formatSize(entry.size) + '）' : '');
      if (delLabel) delLabel.textContent = t('detail.delete');
      showDownload(true);
    } else {
      preview.classList.remove('has-svg');
      dg.style.display = 'none';
      document.getElementById('detail-code').textContent = meta.code || t('files.unnamed');
      document.getElementById('detail-file').textContent = t('detail.codeOnlyType');
      if (delLabel) delLabel.textContent = t('detail.removeEntry');
      showDownload(false);
    }
  }

  function updateOutput() {
    if (!state.current) return;
    var key = state.current;
    var entry = entryByKey(key);
    if (!entry) return;
    var meta = metaOf(key);
    var ids = meta.ids || '', cbeta = meta.cbeta || '', code = meta.code || '', uni = meta.uni || '';
    var span, rg = document.getElementById('rendered-glyph');

    if (entry.file) {
      var stem = Lib.codeFromFile(entry.file);
      span = Lib.buildSpan({ file: entry.file, stem: stem, ids: ids, cbeta: cbeta, code: code, uni: uni });
      rg.classList.remove('as-char');
      rg.textContent = '';
      rg.style.setProperty('--g', "url('" + Lib.svgUrl(entry.file).replace(/'/g, "\\'") + "')");
      rg.setAttribute('aria-label', '缺字 ' + stem);
      setAttr(rg, 'data-ids', ids); setAttr(rg, 'data-cbeta', cbeta);
      setAttr(rg, 'data-code', code); setAttr(rg, 'data-uni', uni);
    } else {
      // 無字形登錄：輸出帶 code 的註記 span，內文預覽直接顯示對應字
      span = Lib.buildCharSpan({ code: code, uni: uni });
      rg.classList.add('as-char');
      rg.style.removeProperty('--g');
      rg.textContent = uni;
      rg.removeAttribute('aria-label');
      setAttr(rg, 'data-ids', ''); setAttr(rg, 'data-cbeta', '');
      setAttr(rg, 'data-code', code); setAttr(rg, 'data-uni', uni);
    }
    document.getElementById('span-output').value = span;
    document.getElementById('char-copy').hidden = !uni;

    var du = document.getElementById('detail-uni');
    du.textContent = uni;
    du.hidden = !uni;
    document.getElementById('detail-uni-copy').hidden = !uni;   // 行內複製 icon 隨對應字顯示
    var ctext = document.getElementById('detail-uni-ctext');    // ctext.org 字典查詢連結
    if (uni) { ctext.href = 'https://ctext.org/dictionary.pl?if=gb&char=' + encodeURIComponent(uni); ctext.hidden = false; }
    else { ctext.hidden = true; ctext.removeAttribute('href'); }
    document.getElementById('uni-cp').textContent = uni ? cpHex(uni) : '';
    syncTextareas();
    refreshDirty();
  }

  function setAttr(el, name, val) { if (val) el.setAttribute(name, val); else el.removeAttribute(name); }

  function resetDetail() {
    state.current = null;
    document.getElementById('detail-empty').hidden = false;
    document.getElementById('detail-body').hidden = true;
    showDownload(false);
    showLocate(false);
  }

  /* ---------- 新增無字形登錄 ---------- */
  function addCodeOnly() {
    // 先清掉 find 過濾：新建的空白條目不符任何搜尋字串，否則不會出現在清單
    if (state.filter) {
      state.filter = '';
      document.getElementById('glyph-find').value = '';
      document.getElementById('glyph-find-clear').hidden = true;
    }
    var key = 'new:' + (++state.seq);
    state.files.unshift({ file: '', hasSvg: false, stem: '', size: 0, birthtime: 0, _key: key });
    state.metaByKey[key] = { ids: '', cbeta: '', code: '', uni: '', timestamp: Lib.timestamp() };
    renderGrid();
    selectEntry(key);
    document.getElementById('code-input').focus();
    toast(t('toast.addedCodeOnly'), 'grey');
  }

  /* ---------- 下載（僅 svg 條目） ---------- */
  function downloadCurrent(el) {
    var entry = state.current && entryByKey(state.current);
    if (!entry || !entry.file) return;
    var a = document.createElement('a');
    a.href = Lib.downloadUrl(entry.file);
    a.download = entry.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (el) setIconDone(el);
  }

  function downloadPng(el) {
    var entry = state.current && entryByKey(state.current);
    if (!entry || !entry.file) return;
    var file = entry.file, stem = Lib.codeFromFile(file), SIZE = 1024;
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = SIZE; c.height = SIZE;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        c.toBlob(function (blob) {
          if (!blob) { toast(t('toast.pngFail', { e: 'toBlob' }), 'red'); return; }
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = stem + '.png';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
          if (el) setIconDone(el);
          toast(t('toast.pngDownloaded', { n: stem + '.png' }), 'teal');
        }, 'image/png');
      } catch (e2) {
        toast(t('toast.pngFail', { e: e2.message }), 'red');
      }
    };
    img.onerror = function () { toast(t('toast.pngFail', { e: 'load' }), 'red'); };
    img.src = Lib.downloadUrl(file);
  }

  /* ---------- 載入清單 ---------- */
  function loadFiles() {
    showLoading();
    return Lib.listFiles().then(function (files) {
      var prevMeta = state.metaByKey || {};
      var prevFiles = state.files || [];
      var newMeta = {};
      var newFiles = [];
      var saved = {};   // 已存檔基準＝伺服器（持久化）值
      // 伺服器條目：已在記憶體者保留其（可能未存檔的）編輯，否則取伺服器值
      files.forEach(function (f) {
        f._key = keyForServer(f);
        newMeta[f._key] = prevMeta[f._key] ||
          { ids: f.ids || '', cbeta: f.cbeta || '', code: f.code || '', uni: f.uni || '', timestamp: f.timestamp || '' };
        saved[f._key] = { file: f.file || '', ids: f.ids || '', cbeta: f.cbeta || '', code: f.code || '', uni: f.uni || '', ts: f.timestamp || '' };
        newFiles.push(f);
      });
      // 保留尚未存檔的無字形登錄（'new:' 鍵；upload/reload 不致遺失）；不進 saved → 標記為 dirty
      prevFiles.forEach(function (pf) {
        if (String(pf._key).indexOf('new:') !== 0) return;
        newMeta[pf._key] = prevMeta[pf._key] || { ids: '', cbeta: '', code: '', uni: '', timestamp: '' };
        newFiles.unshift(pf);
      });
      state.metaByKey = newMeta;
      state.files = newFiles;
      state.savedByKey = saved;
      renderGrid();
      if (state.current && state.metaByKey[state.current]) selectEntry(state.current);
      else resetDetail();
      refreshDirty();
    }).catch(function (err) {
      toast(t('toast.listFail', { e: err.message }), 'red');
    }).then(function () { hideLoading(); });
  }

  /* ---------- 上傳 ---------- */
  function uploadFiles(fileList) {
    var svgs = Array.prototype.filter.call(fileList, function (f) { return Lib.isUploadableSvg(f.name); });
    if (!svgs.length) { toast(t('toast.notSvg'), 'orange'); return; }
    showLoading();
    Lib.uploadFiles(svgs).then(function (uploaded) {
      toast(t('toast.uploaded', { n: uploaded.length }), 'green');
      return loadFiles();
    }).catch(function (err) {
      hideLoading();
      toast(t('toast.uploadFail', { e: err.message }), 'red');
    });
  }

  /* ---------- 存檔登錄 ---------- */
  function collectEntries() {
    return state.files.map(function (f) {
      var m = metaOf(f._key);
      return {
        file: f.file || '',
        ids: (m.ids || '').trim(),
        cbeta: (m.cbeta || '').trim(),
        code: (m.code || '').trim(),
        uni: (m.uni || '').trim(),
        timestamp: (m.timestamp || '').trim()   // 缺則後端視為此刻加入
      };
    });
  }

  function saveRegistry(el) {
    var entries = collectEntries();
    // 無字形登錄必須有 code
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].file && !entries[i].code) { toast(t('toast.needCode'), 'orange'); return; }
    }
    showLoading();
    Lib.saveRegistry(entries).then(function (r) {
      hideLoading();
      // 已存檔的 'new:' 無字形登錄就地正規化為 'code:'+code（避免下次 reload 重複）
      state.files.forEach(function (f) {
        if (String(f._key).indexOf('new:') !== 0) return;
        var m = metaOf(f._key);
        var nk = 'code:' + m.code;
        if (nk !== f._key) {
          state.metaByKey[nk] = m;
          delete state.metaByKey[f._key];
          if (state.current === f._key) state.current = nk;
          f._key = nk;
        }
      });
      state.savedByKey = snapshotCurrent();   // 重設已存檔基準 → 清除未存檔提示
      renderGrid();
      if (state.current) selectEntry(state.current);
      if (el) setIconDone(el);
      refreshDirty();
      toast(t('toast.saved', { n: r.count }), 'teal');
    }).catch(function (err) {
      hideLoading();
      toast(t('toast.saveFail', { e: err.message }), 'red');
    });
  }

  /* ---------- 刪除 / 移除 ---------- */
  function deleteCurrent() {
    if (!state.current) return;
    var key = state.current;
    var entry = entryByKey(key);
    if (!entry) return;

    if (entry.file) {
      // 字形登錄：後端刪檔（含 .bak）
      if (!window.confirm(t('confirm.delete', { n: entry.file }))) return;
      showLoading();
      Lib.deleteFile(entry.file).then(function () {
        toast(t('toast.deleted', { n: entry.file }), 'teal');
        resetDetail();
        return loadFiles();
      }).catch(function (err) {
        hideLoading();
        toast(t('toast.deleteFail', { e: err.message }), 'red');
      });
    } else {
      // 無字形登錄：移除登錄
      var m = metaOf(key);
      if (!window.confirm(t('confirm.removeEntry', { n: m.code || t('files.unnamed') }))) return;
      var wasSaved = key.indexOf('code:') === 0;
      delete state.metaByKey[key];
      state.files = state.files.filter(function (f) { return f._key !== key; });
      resetDetail();
      renderGrid();
      refreshDirty();
      if (wasSaved) saveRegistry();           // 寫回 glyphs.js（已持久化過 → 需更新）
      else toast(t('toast.removed'), 'grey');  // 未存檔 → 純記憶體移除
    }
  }

  /* ---------- 複製 ---------- */
  function copyText(text, okMsg) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMsg, 'teal');
      }).catch(function () { toast(t('toast.copyFail'), 'red'); });
    } else {
      toast(t('toast.copyFail'), 'red');
    }
  }

  /* ---------- 語言 ---------- */
  function cycleLang() {
    var langs = window.I18n.langs;
    var idx = langs.indexOf(window.I18n.lang);
    var next = langs[(idx + 1) % langs.length];
    window.I18n.set(next);
    toast(window.I18n.name(next), 'grey');
  }

  /* ---------- 拖拉上傳 ---------- */
  function initDragDrop() {
    var overlay = document.getElementById('drop-overlay');
    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault(); depth++; overlay.classList.add('show');
    });
    window.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault();
    });
    window.addEventListener('dragleave', function (e) {
      e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('show');
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; overlay.classList.remove('show');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });
  }

  /* ---------- i18n 重繪 ---------- */
  function relocalizeDynamic() {
    renderPalette();
    renderCbetaPalette();
    renderQuickCopy();
    renderGrid();
    refreshDirty();   // 重設存檔鍵 title（I18n.apply 會把 data-i18n-title 蓋回非 dirty 版）
    if (state.current) selectEntry(state.current);
    else { var res = Lib.parseIds(document.getElementById('ids-input').value); renderValidate(res); renderTree(res); }
  }

  /* ---------- 綁定 ---------- */
  function bind() {
    document.getElementById('setting-mode').addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('setting-lang').addEventListener('click', function () { cycleLang(); setIconDone(this); });
    document.getElementById('setting-save').addEventListener('click', function () { saveRegistry(this); });
    document.getElementById('setting-download').addEventListener('click', function () { downloadCurrent(this); });
    document.getElementById('setting-download-png').addEventListener('click', function () { downloadPng(this); });
    document.getElementById('setting-menu').addEventListener('click', function () {
      document.getElementById('files-pane').classList.toggle('collapsed'); setIconDone(this);
    });
    document.getElementById('setting-top').addEventListener('click', scrollPageTop);
    document.getElementById('setting-bottom').addEventListener('click', scrollPageBottom);
    document.getElementById('setting-locate').addEventListener('click', scrollToSelected);

    document.getElementById('ids-input').addEventListener('input', onIdsInput);
    document.getElementById('cbeta-input').addEventListener('input', onCbetaInput);
    document.getElementById('code-input').addEventListener('input', onCodeInput);
    document.getElementById('uni-input').addEventListener('input', onUniInput);

    document.getElementById('ids-copy').addEventListener('click', function () {
      copyText(document.getElementById('ids-input').value, t('toast.idsCopied'));
    });
    document.getElementById('cbeta-copy').addEventListener('click', function () {
      copyText(document.getElementById('cbeta-input').value, t('toast.cbetaCopied'));
    });
    document.getElementById('ids-clear').addEventListener('click', function () {
      document.getElementById('ids-input').value = ''; onIdsInput();
    });
    document.getElementById('span-copy').addEventListener('click', function () {
      copyText(document.getElementById('span-output').value, t('toast.spanCopied'));
    });
    document.getElementById('char-copy').addEventListener('click', function () {
      if (state.current) copyText(metaOf(state.current).uni, t('toast.charCopied'));
    });
    document.getElementById('detail-uni-copy').addEventListener('click', function () {
      if (state.current) copyText(metaOf(state.current).uni, t('toast.charCopied'));
    });
    document.getElementById('detail-delete').addEventListener('click', deleteCurrent);

    document.getElementById('glyph-find').addEventListener('input', onFind);
    document.getElementById('glyph-find-clear').addEventListener('click', function () {
      var inp = document.getElementById('glyph-find');
      inp.value = ''; onFind(); inp.focus();
    });

    document.getElementById('add-codeonly').addEventListener('click', addCodeOnly);
    document.getElementById('upload-btn').addEventListener('click', function () {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', function () {
      if (this.files && this.files.length) uploadFiles(this.files);
      this.value = '';
    });

    document.addEventListener('i18n:changed', relocalizeDynamic);

    // 有未存檔變更時，重新整理／關閉分頁前瀏覽器攔截確認
    window.addEventListener('beforeunload', function (e) {
      if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------- 啟動 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    window.I18n.apply(document);
    renderPalette();
    renderCbetaPalette();
    renderQuickCopy();
    bind();
    initDragDrop();
    onIdsInput();          // 初始驗證徽章（空 → neutral）
    loadFiles();
  });
})();

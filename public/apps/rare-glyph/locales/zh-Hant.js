/* 繁體中文（zh-Hant） */
I18n.register('zh-Hant', {
  'title.page': '經典中罕見字管理',
  'title.sub': 'IDS Builder · 表意文字描述序列',

  /* 側鍵 */
  'tool.menu': '顯示／隱藏缺字清單',
  'tool.top': '到頁面最上方',
  'tool.bottom': '到頁面最下方',
  'tool.locate': '回到所選字的位置',
  'tool.mode': '切換 light / dark',
  'tool.lang': '語言',
  'tool.download': '下載目前選中的 SVG',
  'tool.downloadPng': '下載 PNG（白底黑字）',
  'tool.save': '存檔登錄（寫回 glyphs.js）',
  'tool.saveDirty': '● 有未存檔的變更——點擊存檔（寫回 glyphs.js）',

  /* 左：缺字清單 */
  'files.title': '缺字清單',
  'files.upload': '上傳 SVG',
  'files.loading': '載入中…',
  'files.count': '{n} 個缺字',
  'files.matchCount': '{n} / {total} 筆符合',
  'files.findPh': '搜尋 缺字碼 / 對應字 / IDS / CBETA / 檔名…',
  'files.findClear': '清除搜尋',
  'quick.title': '常用字（點擊複製）',
  'quick.ideoSpace': '全形空格',
  'quick.ideoZero': '表意數字零',
  'quick.copied': '已複製 {n}',
  'files.empty': '尚無缺字 SVG。把 <code>.svg</code> 拖進來，或按「上傳 SVG」。',

  /* 中：IDS Builder */
  'ids.title': 'IDS Builder',
  'ids.inputLabel': 'IDS 描述（點上方運算子插入，或直接輸入組件字）',
  'ids.placeholder': '例：⿰口洛',
  'ids.copy': '複製 IDS',
  'ids.clear': '清空',
  'ids.tree': '結構樹',
  'ids.treeEmpty': '（輸入 IDS 後顯示結構樹）',

  /* CBETA 組字式 */
  'cbeta.title': 'CBETA 組字式',
  'cbeta.placeholder': '例：口*洛',
  'cbeta.hint': '依 <a href="https://cbeta.org/character-composition-rules" target="_blank" rel="noopener">CBETA 組字規則</a> 描述（如 <code>口*洛</code>、<code>木*(於-方)</code>）',
  'cbeta.copy': '複製組字式',
  'cbetaop.lr': '左右',
  'cbetaop.tb': '上下',
  'cbetaop.surround': '包圍',
  'cbetaop.sub': '減（移除部件）',
  'cbetaop.add': '加（增添部件）',
  'cbetaop.group': '群組',

  /* 缺字碼 ↔ 對應 Unicode 字 */
  'code.label': '大正藏 / CBETA 缺字碼',
  'code.placeholder': '例：T014461',
  'uni.label': '對應 Unicode 字',
  'uni.placeholder': '例：𢤱',

  /* 無字形登錄（無 .svg、已有對應 Unicode 字） */
  'files.addCodeOnly': '新增無字形',
  'files.codeOnlyTag': '無字形',
  'files.unnamed': '(未命名)',
  'detail.copyChar': '複製對應字',
  'detail.ctext': '在 ctext.org（中國哲學書電子化計劃）查此字',
  'detail.removeEntry': '移除登錄',
  'detail.codeOnlyType': '無字形登錄（已有對應 Unicode 字）',
  'toast.addedCodeOnly': '已新增無字形登錄（填入缺字碼後存檔）',
  'toast.needCode': '無字形登錄需填「缺字碼」',
  'toast.removed': '已移除登錄',
  'toast.charCopied': '已複製對應字',
  'confirm.removeEntry': '移除登錄「{n}」？\n（按存檔才寫回 glyphs.js）',

  /* 驗證 */
  'validate.empty': '尚未輸入 IDS',
  'validate.ok': 'IDS 合法（{n} 個組件）',
  'validate.needMore': '運算子「{op}」（{name}）需要 {need} 個運算元，只取到 {got} 個',
  'validate.trailing': 'IDS 結尾有多餘字元：{extra}',
  'validate.invalid': 'IDS 不合法',

  /* IDC 運算子（U+2FF0–2FFF） */
  'idc.2ff0': '左右',
  'idc.2ff1': '上下',
  'idc.2ff2': '左中右',
  'idc.2ff3': '上中下',
  'idc.2ff4': '全包圍',
  'idc.2ff5': '上包圍',
  'idc.2ff6': '下包圍',
  'idc.2ff7': '左包圍',
  'idc.2ff8': '左上包圍',
  'idc.2ff9': '右上包圍',
  'idc.2ffa': '左下包圍',
  'idc.2ffb': '重疊',
  'idc.2ffc': '右包圍',
  'idc.2ffd': '右下包圍',
  'idc.2ffe': '水平翻轉',
  'idc.2fff': '旋轉',

  /* 右：詳情 */
  'detail.title': '缺字詳情',
  'detail.empty': '從左側選一個缺字，編輯它的 IDS，並取得可貼到佛典文件的 span。',
  'detail.spanLabel': '產生的 span（貼到 markdown-library / markdown-reader 文件）',
  'detail.copySpan': '複製 span',
  'detail.delete': '刪除 SVG',
  'detail.rendered': '內文渲染預覽',

  /* 拖拉 / 載入 */
  'drop.hint': '放開以上傳 SVG 到 /lib/Typeface/svgs/',
  'loading': '載入中…',

  /* Toast / confirm */
  'toast.listFail': '讀取清單失敗：{e}',
  'toast.notSvg': '請選 .svg 檔',
  'toast.uploaded': '已上傳 {n} 個 SVG',
  'toast.uploadFail': '上傳失敗：{e}',
  'toast.saved': '已存檔 {n} 筆 IDS 登錄 → glyphs.js',
  'toast.saveFail': '存檔失敗：{e}',
  'toast.deleted': '已刪除：{n}',
  'toast.deleteFail': '刪除失敗：{e}',
  'toast.pngDownloaded': '已下載 PNG：{n}',
  'toast.pngFail': 'PNG 產生失敗：{e}',
  'toast.idsCopied': '已複製 IDS',
  'toast.cbetaCopied': '已複製組字式',
  'toast.spanCopied': '已複製 span',
  'toast.copyFail': '複製失敗',
  'confirm.delete': '確定刪除 SVG「{n}」？\n（會先備份到 .bak/，可復原）'
}, '繁體中文');

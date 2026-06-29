/**
 * rare-glyph（經典中罕見字管理）— 獨立執行的 Express 伺服器
 *
 * 經典缺字（罕見字）的策劃 / 描述工具，提供：
 *   - 靜態檔（public/）→ 應用在 /apps/rare-glyph/
 *   - 缺字 SVG 語料：/lib/Typeface/svgs/（家族共用 Typeface 語料；與 markdown-library 等共用同一路徑）
 *   - 管理 API：列檔 / 上傳 / 刪除 / 寫回 IDS 登錄（routes/rare-glyph.js）
 *
 * 注意（刻意偏離 canon）：本 app 的語料根是共用的 /lib/Typeface/svgs/，
 *   而非 canon 預設的 /upload/<name>/——因為產出的 <span class="glyph"> 必須指向
 *   markdown-library / markdown-reader 既有引用的同一條共用路徑（見 README / CLAUDE.md）。
 *
 * 啟動： npm install && npm start
 *        預設 http://localhost:3000/apps/rare-glyph/
 */

const express = require('express');
const path = require('path');
const logger = require('morgan');

const appRouter = require('./routes/rare-glyph');

const app = express();

app.use(logger('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/rare-glyph', appRouter);

// 根路徑導向應用頁
app.get('/', (req, res) => res.redirect('/apps/rare-glyph/'));

// 404（API 回 JSON，其餘回純文字）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
  res.status(404).type('text/plain').send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`rare-glyph →  http://localhost:${PORT}/apps/rare-glyph/`);
});

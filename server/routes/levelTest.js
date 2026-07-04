/**
 * Level Test Routes
 * POST /api/level-test/start    - Start a new level test
 * POST /api/level-test/feedback - Submit feedback
 * GET  /api/level-test/status   - Get current test status
 */

const express = require('express');
const router = express.Router();
const { startTest, submitFeedback, getSession, getLevelTextDetail } = require('../services/levelTest');
const { adminRequired } = require('../middleware/auth');
const { getAll, getOne, run } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const { extractArticleFromUrl } = require('../services/webArticle');

function estimateArticleLevel(tokens) {
  const wordsById = new Map();
  for (const token of tokens) {
    if (!token.is_word || !token.word_id) continue;
    if (token.standard_level === null || token.standard_level === undefined) continue;
    if (!wordsById.has(token.word_id)) wordsById.set(token.word_id, token.standard_level);
  }
  const levels = Array.from(wordsById.values());
  const total = levels.length;
  if (total === 0) return { estimatedLevel: 4, totalWords: 0, aboveCount: 0, abovePercent: 0 };
  const candidates = [];
  for (let level = 0; level <= 9; level++) {
    const aboveCount = levels.filter(standardLevel => standardLevel > level).length;
    const ratio = aboveCount / total;
    if (ratio > 0.01 && ratio < 0.15) {
      candidates.push({ level, aboveCount, ratio });
    }
  }
  const selected = candidates[0] || {
    level: levels.every(standardLevel => standardLevel <= 4) ? 4 : Math.min(9, Math.max(...levels)),
    aboveCount: 0,
    ratio: 0,
  };
  return {
    estimatedLevel: selected.level,
    totalWords: total,
    aboveCount: selected.aboveCount,
    abovePercent: Math.round(selected.ratio * 100),
  };
}

// POST /api/level-test/start
router.post('/start', async (req, res, next) => {
  try {
    const result = await startTest();
    res.json({ success: true, data: result, error: null });
  } catch (e) {
    console.error('[level-test] startTest error:', e.message, e.stack);
    next(e);
  }
});

// POST /api/level-test/feedback
router.post('/feedback', async (req, res, next) => {
  try {
    const { sessionId, level, feedback } = req.body;
    if (!sessionId || level === undefined || !feedback) {
      const err = new Error('sessionId, level, and feedback are required');
      err.type = 'validation';
      throw err;
    }

    const result = await submitFeedback(sessionId, level, feedback);
    res.json({ success: true, data: result, error: null });
  } catch (e) {
    next(e);
  }
});

// GET /api/level-test/status/:sessionId
router.get('/status/:sessionId', (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.type = 'not_found';
      throw err;
    }
    res.json({ success: true, data: session, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/texts', adminRequired, async (req, res, next) => {
  try {
    const rows = await getAll(
      `SELECT text_id, level, title, content, source, is_active, created_by, created_at, updated_at
       FROM level_test_texts
       WHERE is_active = 1
       ORDER BY level ASC, created_at DESC`
    );
    res.json({ success: true, data: rows, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/analyze', adminRequired, async (req, res, next) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) {
      const err = new Error('content is required');
      err.type = 'validation';
      throw err;
    }
    const { parse } = require('../services/textParser');
    const tokens = await parse(content);
    const result = estimateArticleLevel(tokens);
    res.json({ success: true, data: result, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/extract-url', adminRequired, async (req, res, next) => {
  try {
    const result = await extractArticleFromUrl(req.body?.url);
    res.json({ success: true, data: result, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/texts', adminRequired, async (req, res, next) => {
  try {
    const level = parseInt(req.body?.level, 10);
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (Number.isNaN(level) || level < 0 || level > 9 || !title || !content) {
      const err = new Error('level, title, and content are required');
      err.type = 'validation';
      throw err;
    }
    const textId = uuidv4();
    await run(
      `INSERT INTO level_test_texts (text_id, level, title, content, source, is_active, created_by)
       VALUES ($1,$2,$3,$4,'admin',1,$5)`,
      [textId, level, title, content, req.user.user_id]
    );
    const row = await getOne('SELECT * FROM level_test_texts WHERE text_id = $1', [textId]);
    res.json({ success: true, data: row, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/texts/:id', adminRequired, async (req, res, next) => {
  try {
    const detail = await getLevelTextDetail(req.params.id);
    if (!detail) {
      const err = new Error('Level test text not found');
      err.type = 'not_found';
      throw err;
    }
    res.json({ success: true, data: detail, error: null });
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/texts/:id', adminRequired, async (req, res, next) => {
  try {
    await run('UPDATE level_test_texts SET is_active = 0, updated_at = now() WHERE text_id = $1', [req.params.id]);
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

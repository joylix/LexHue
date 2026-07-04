const express = require('express');
const { getAll, getOne, run } = require('../database/connection');
const { addWordToDict, fetchFromFreeDictionary, lookupInDict, ruleBasedStrip } = require('../services/lemmatizer');
const { invalidateCaches } = require('../services/textParser');
const { getPagination } = require('../utils/pagination');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();

function estimateStandardLevel(word) {
  const w = word.toLowerCase();
  if (w.length <= 3) return 2;
  if (w.length <= 4) return 3;
  if (w.length >= 10) return 7;
  if (w.length >= 8) return 6;
  return 5;
}

function jsonValue(value) {
  if (value === undefined || value === null || value === '') return '[]';
  return JSON.stringify(Array.isArray(value) ? value : value);
}

router.post('/auto-add', adminRequired, async (req, res, next) => {
  try {
    const word = String(req.body?.word || '').trim().toLowerCase();
    if (!word) {
      const err = new Error('word is required');
      err.type = 'validation';
      throw err;
    }
    const existing = await lookupInDict(word);
    if (existing) {
      return res.json({ success: true, data: { ...existing, method: 'direct', already_existed: true, phonetic: existing.phonetic_us || existing.phonetic_uk }, error: null });
    }
    let apiData = null;
    if (req.body?.auto_fill) apiData = await fetchFromFreeDictionary(word);
    const lemma = apiData?.word || word;
    const entry = await addWordToDict({
      lemma,
      pos: apiData?.pos || null,
      translation: apiData?.translation || null,
      definition_en: apiData?.definition_en || null,
      standard_level: estimateStandardLevel(lemma),
    });
    if (apiData?.phonetic_us || apiData?.phonetic_uk || apiData?.example_sentences) {
      await run(
        `UPDATE dictionary
         SET phonetic_us = COALESCE($1, phonetic_us),
             phonetic_uk = COALESCE($2, phonetic_uk),
             example_sentences = COALESCE($3::jsonb, example_sentences)
         WHERE word_id = $4`,
        [apiData.phonetic_us || null, apiData.phonetic_uk || null, apiData.example_sentences ? JSON.stringify(apiData.example_sentences) : null, entry.word_id]
      );
    }
    invalidateCaches();
    const row = await getOne('SELECT * FROM dictionary WHERE word_id = $1', [entry.word_id]);
    res.json({ success: true, data: { ...row, method: apiData ? 'api_added' : 'manual_added', already_existed: false, phonetic: row.phonetic_us || row.phonetic_uk }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q, level } = req.query;
    const { page, limit, offset } = getPagination(req.query, { limit: 50, maxLimit: 500 });
    const clauses = [];
    const params = [];
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      clauses.push(`(lower(lemma) LIKE $${params.length} OR lower(word_id) LIKE $${params.length})`);
    }
    if (level !== undefined && level !== '') {
      params.push(parseInt(level, 10));
      clauses.push(`standard_level = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = await getOne(`SELECT COUNT(*)::int AS cnt FROM dictionary ${where}`, params);
    const orderParams = [...params];
    let exactOrder = '';
    if (q) {
      orderParams.push(String(q).toLowerCase());
      exactOrder = `CASE WHEN lower(lemma) = lower($${orderParams.length}) THEN 0 ELSE 1 END,`;
    }
    const rows = await getAll(
      `SELECT word_id, lemma, pos, translation, definition_en, standard_level, sort_order
       FROM dictionary ${where}
       ORDER BY ${exactOrder} sort_order ASC, lower(lemma)
       LIMIT $${orderParams.length + 1} OFFSET $${orderParams.length + 2}`,
      [...orderParams, limit, offset]
    );
    res.json({ success: true, data: { items: rows, total: total?.cnt || 0, page, limit }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/youdao', async (req, res, next) => {
  try {
    const { fetchFromYoudao } = require('../services/youdao');
    const data = await fetchFromYoudao(req.query.word);
    res.json({ success: true, data, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/:word_id', async (req, res, next) => {
  try {
    let row = await getOne(
      'SELECT word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk, standard_level, sort_order, collocations, example_sentences FROM dictionary WHERE word_id = $1',
      [req.params.word_id]
    );
    if (!row) row = await getOne('SELECT * FROM dictionary WHERE lower(lemma) = lower($1)', [req.params.word_id]);
    if (!row) {
      const err = new Error('Word not found');
      err.type = 'not_found';
      throw err;
    }
    const relations = await getAll(
      `SELECT wr.*, d.lemma AS target_lemma_text, d.translation AS target_translation
       FROM word_relation wr
       LEFT JOIN dictionary d ON d.word_id = wr.target_word_id
       WHERE wr.word_id = $1`,
      [row.word_id]
    );
    const userRecord = await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, row.word_id]);
    res.json({ success: true, data: { ...row, relations, userRecord }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/', adminRequired, async (req, res, next) => {
  try {
    const { lemma, pos, translation, definition_en, phonetic_us, phonetic_uk, standard_level, collocations, example_sentences } = req.body;
    if (!lemma) {
      const err = new Error('lemma is required');
      err.type = 'validation';
      throw err;
    }
    const id = lemma.toLowerCase();
    const sw = id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    await run(
      `INSERT INTO dictionary
       (word_id, lemma, pos, sw, translation, definition_en, phonetic_us, phonetic_uk, standard_level, collocations, example_sentences, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'manual')`,
      [id, lemma, pos || null, sw, translation || null, definition_en || null, phonetic_us || null, phonetic_uk || null, standard_level || estimateStandardLevel(lemma), jsonValue(collocations), jsonValue(example_sentences)]
    );
    invalidateCaches();
    const row = await getOne('SELECT * FROM dictionary WHERE word_id = $1', [id]);
    res.json({ success: true, data: row, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/:word_id', adminRequired, async (req, res, next) => {
  try {
    const existing = await getOne('SELECT * FROM dictionary WHERE word_id = $1', [req.params.word_id]);
    if (!existing) {
      const err = new Error('Word not found');
      err.type = 'not_found';
      throw err;
    }
    const { lemma, pos, translation, definition_en, phonetic_us, phonetic_uk, standard_level, collocations, example_sentences } = req.body;
    await run(
      `UPDATE dictionary
       SET lemma = COALESCE($1, lemma),
           pos = COALESCE($2, pos),
           translation = COALESCE($3, translation),
           definition_en = COALESCE($4, definition_en),
           phonetic_us = COALESCE($5, phonetic_us),
           phonetic_uk = COALESCE($6, phonetic_uk),
           standard_level = COALESCE($7, standard_level),
           collocations = $8::jsonb,
           example_sentences = $9::jsonb
       WHERE word_id = $10`,
      [
        lemma || null,
        pos || null,
        translation || null,
        definition_en || null,
        phonetic_us || null,
        phonetic_uk || null,
        standard_level || null,
        collocations !== undefined ? jsonValue(collocations) : JSON.stringify(existing.collocations || []),
        example_sentences !== undefined ? jsonValue(example_sentences) : JSON.stringify(existing.example_sentences || []),
        req.params.word_id,
      ]
    );
    invalidateCaches();
    const row = await getOne('SELECT * FROM dictionary WHERE word_id = $1', [req.params.word_id]);
    res.json({ success: true, data: row, error: null });
  } catch (e) {
    next(e);
  }
});

router.delete('/:word_id', adminRequired, async (req, res, next) => {
  try {
    const existing = await getOne('SELECT * FROM dictionary WHERE word_id = $1', [req.params.word_id]);
    if (!existing) {
      const err = new Error('Word not found');
      err.type = 'not_found';
      throw err;
    }
    await run('DELETE FROM dictionary WHERE word_id = $1', [req.params.word_id]);
    invalidateCaches();
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

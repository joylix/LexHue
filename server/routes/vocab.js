const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getAll, getOne, run, transaction } = require('../database/connection');
const { adjustStrangeness } = require('../services/strangeness');
const { invalidateCaches } = require('../services/textParser');
const { getPagination } = require('../utils/pagination');
const { STRANGENESS_LEVELS, DEFAULT_OOV_STRANGENESS, normalizeStrangeness } = require('../constants/strangeness');

const router = express.Router();

async function getConfig(userId, key, fallback = null) {
  const row = await getOne('SELECT value FROM user_config WHERE user_id = $1 AND key = $2', [userId, key]);
  return row ? row.value : fallback;
}

async function setConfig(userId, key, value) {
  await run(
    `INSERT INTO user_config (user_id, key, value)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [userId, key, String(value)]
  );
}

async function upsertVocabStrangeness(userId, wordId, target, actionType, oldValue = null) {
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    const record = await tx.getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    if (record) {
      await tx.run(
        'UPDATE user_vocab SET custom_strangeness = $1, last_reviewed_at = $2, source_type = $3, confirmed = 1 WHERE user_id = $4 AND word_id = $5',
        [target, now, 'manual', userId, wordId]
      );
      oldValue = record.custom_strangeness;
    } else {
      await tx.run(
        `INSERT INTO user_vocab
         (user_id, word_id, custom_strangeness, source_type, user_doc_frequency, first_learned_at, last_reviewed_at, confirmed)
         VALUES ($1,$2,$3,'manual',0,$4,$5,1)`,
        [userId, wordId, target, now, now]
      );
    }
    await tx.run(
      'INSERT INTO modification_log (user_id, log_id, word_id, action_type, old_strangeness, new_strangeness, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, uuidv4(), wordId, actionType, oldValue, target, now]
    );
  });
  return await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
}

router.get('/', async (req, res, next) => {
  try {
    const { min_difficulty, max_difficulty, min_first_learned, last_reviewed_before } = req.query;
    const { page, limit, offset } = getPagination(req.query, { limit: 50, maxLimit: 500 });
    const clauses = ['uv.user_id = $1'];
    const params = [req.user.user_id];
    const add = (clause, value) => {
      params.push(value);
      clauses.push(clause.replace('?', `$${params.length}`));
    };
    if (min_difficulty) add('uv.custom_strangeness >= ?', parseInt(min_difficulty, 10));
    if (max_difficulty) add('uv.custom_strangeness <= ?', parseInt(max_difficulty, 10));
    if (min_first_learned) add('uv.first_learned_at >= ?', min_first_learned);
    if (last_reviewed_before) add('uv.last_reviewed_at <= ?', last_reviewed_before);
    const where = clauses.join(' AND ');
    const rows = await getAll(
      `SELECT uv.*, d.lemma, d.translation, d.pos, d.phonetic_us, d.phonetic_uk
       FROM user_vocab uv
       LEFT JOIN dictionary d ON uv.word_id = d.word_id
       WHERE ${where}
       ORDER BY uv.custom_strangeness DESC, uv.last_reviewed_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = await getOne(`SELECT COUNT(*)::int AS cnt FROM user_vocab uv WHERE ${where}`, params);
    res.json({ success: true, data: { items: rows, total: total?.cnt || 0, page, limit }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/review', async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query, { limit: 20, maxLimit: 500 });
    const rows = await getAll(
      `SELECT uv.*, d.lemma, d.translation, d.pos
       FROM user_vocab uv
       LEFT JOIN dictionary d ON uv.word_id = d.word_id
       WHERE uv.user_id = $1
       ORDER BY uv.last_reviewed_at ASC, uv.custom_strangeness DESC
       LIMIT $2 OFFSET $3`,
      [req.user.user_id, limit, offset]
    );
    const total = await getOne('SELECT COUNT(*)::int AS cnt FROM user_vocab WHERE user_id = $1', [req.user.user_id]);
    res.json({ success: true, data: { items: rows, total: total?.cnt || 0, page, limit }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const userLevel = parseInt(await getConfig(req.user.user_id, 'user_level', '4'), 10);
    const onboardingCompleted = (await getConfig(req.user.user_id, 'onboarding_completed', 'false')) === 'true';
    const strangenessCounts = {};
    for (const s of STRANGENESS_LEVELS) {
      const row = await getOne('SELECT COUNT(*)::int AS cnt FROM user_vocab WHERE user_id = $1 AND custom_strangeness = $2', [req.user.user_id, s]);
      strangenessCounts[s] = row?.cnt || 0;
    }
    const totalWords = Object.values(strangenessCounts).reduce((a, b) => a + b, 0);
    const masteredWords = strangenessCounts[1] || 0;
    const dictWordsRow = await getOne('SELECT COUNT(*)::int AS cnt FROM dictionary WHERE standard_level <= $1', [userLevel]);
    const totalDictWordsAtLevel = dictWordsRow?.cnt || 0;
    const masteredAtLevelRow = await getOne(
      `SELECT COUNT(*)::int AS cnt
       FROM user_vocab uv
       JOIN dictionary d ON uv.word_id = d.word_id
       WHERE uv.user_id = $1 AND d.standard_level <= $2 AND uv.custom_strangeness = 1`,
      [req.user.user_id, userLevel]
    );
    const masteredAtLevel = masteredAtLevelRow?.cnt || 0;
    const upgradeThreshold = 0.8;
    const canUpgrade = totalDictWordsAtLevel > 0 && (masteredAtLevel / totalDictWordsAtLevel) >= upgradeThreshold;
    const nextLevel = canUpgrade ? Math.min(userLevel + 1, 9) : null;
    const masteryPercent = totalDictWordsAtLevel > 0 ? Math.round((masteredAtLevel / totalDictWordsAtLevel) * 100) : 0;
    res.json({
      success: true,
      data: { userLevel, onboardingCompleted, strangenessCounts, totalWords, masteredWords, dictWordsAtLevel: totalDictWordsAtLevel, masteredAtLevel, masteryPercent, canUpgrade, nextLevel, upgradeThreshold: Math.ceil(totalDictWordsAtLevel * upgradeThreshold) },
      error: null,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/upgrade-level', async (req, res, next) => {
  try {
    const currentLevel = parseInt(await getConfig(req.user.user_id, 'user_level', '4'), 10);
    if (currentLevel >= 9) {
      const err = new Error('Already at maximum level');
      err.type = 'validation';
      throw err;
    }
    const totalDictWords = (await getOne('SELECT COUNT(*)::int AS cnt FROM dictionary WHERE standard_level <= $1', [currentLevel]))?.cnt || 0;
    const mastered = (await getOne(
      `SELECT COUNT(*)::int AS cnt
       FROM user_vocab uv JOIN dictionary d ON uv.word_id = d.word_id
       WHERE uv.user_id = $1 AND d.standard_level <= $2 AND uv.custom_strangeness = 1`,
      [req.user.user_id, currentLevel]
    ))?.cnt || 0;
    if (totalDictWords > 0 && (mastered / totalDictWords) < 0.8) {
      const err = new Error(`Need to master at least ${Math.ceil(totalDictWords * 0.8)} words at current level (currently ${mastered})`);
      err.type = 'validation';
      throw err;
    }
    const newLevel = Math.min(currentLevel + 1, 9);
    await setConfig(req.user.user_id, 'user_level', newLevel);
    res.json({ success: true, data: { oldLevel: currentLevel, newLevel, mastered, totalDictWords }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/batch-delete', async (req, res, next) => {
  try {
    const wordIds = Array.isArray(req.body?.word_ids) ? req.body.word_ids : [];
    await run('DELETE FROM user_vocab WHERE user_id = $1 AND word_id = ANY($2::text[])', [req.user.user_id, wordIds]);
    res.json({ success: true, data: { deleted: wordIds.length }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/custom', async (req, res, next) => {
  try {
    const { word_id, translation, definition_en, phonetic, pos } = req.body;
    if (!word_id) {
      const err = new Error('word_id is required');
      err.type = 'validation';
      throw err;
    }
    const wordId = word_id.toLowerCase();
    const oovDefault = normalizeStrangeness(await getConfig(req.user.user_id, 'oov_default_strangeness', DEFAULT_OOV_STRANGENESS), DEFAULT_OOV_STRANGENESS);
    const existing = await getOne('SELECT word_id FROM dictionary WHERE word_id = $1', [wordId]);
    if (!existing) {
      const { addWordToDict } = require('../services/lemmatizer');
      await addWordToDict({ lemma: wordId, pos: pos || null, translation: translation || null, definition_en: definition_en || null, standard_level: 5 });
      if (phonetic) await run('UPDATE dictionary SET phonetic_us = $1 WHERE word_id = $2', [phonetic, wordId]);
      invalidateCaches();
    } else {
      await run(
        `UPDATE dictionary
         SET translation = COALESCE($1, translation),
             definition_en = COALESCE($2, definition_en),
             phonetic_us = COALESCE($3, phonetic_us),
             pos = COALESCE($4, pos)
         WHERE word_id = $5`,
        [translation || null, definition_en || null, phonetic || null, pos || null, wordId]
      );
      invalidateCaches();
    }
    const now = new Date().toISOString();
    await run(
      `INSERT INTO user_vocab
       (user_id, word_id, custom_strangeness, source_type, user_doc_frequency, first_learned_at, last_reviewed_at, user_definition, user_pos, is_custom_word, confirmed)
       VALUES ($1,$2,$3,'manual',0,$4,$5,$6,$7,1,0)
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         custom_strangeness = EXCLUDED.custom_strangeness,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         user_definition = EXCLUDED.user_definition,
         user_pos = EXCLUDED.user_pos,
         is_custom_word = 1`,
      [req.user.user_id, wordId, oovDefault, now, now, translation || null, pos || null]
    );
    const record = await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, wordId]);
    res.json({ success: true, data: record, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/:word_id/history', async (req, res, next) => {
  try {
    const history = await getAll(
      'SELECT * FROM modification_log WHERE user_id = $1 AND word_id = $2 ORDER BY timestamp DESC',
      [req.user.user_id, req.params.word_id]
    );
    res.json({ success: true, data: history, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/:word_id', async (req, res, next) => {
  try {
    const record = await getOne(
      `SELECT uv.*, d.lemma, d.translation, d.pos, d.phonetic_us, d.phonetic_uk, d.collocations, d.example_sentences, d.standard_level
       FROM user_vocab uv
       LEFT JOIN dictionary d ON uv.word_id = d.word_id
       WHERE uv.user_id = $1 AND uv.word_id = $2`,
      [req.user.user_id, req.params.word_id]
    );
    if (!record) {
      const err = new Error('Word not found in user vocabulary');
      err.type = 'not_found';
      throw err;
    }
    const history = await getAll('SELECT * FROM modification_log WHERE user_id = $1 AND word_id = $2 ORDER BY timestamp DESC', [req.user.user_id, req.params.word_id]);
    res.json({ success: true, data: { ...record, history }, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/:word_id/strangeness', async (req, res, next) => {
  try {
    const { direction, current_strangeness } = req.body;
    if (!['up', 'down', 'keep'].includes(direction)) {
      const err = new Error('direction must be "up", "down", or "keep"');
      err.type = 'validation';
      throw err;
    }
    const record = await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, req.params.word_id]);
    const currentValue = record ? normalizeStrangeness(record.custom_strangeness) : normalizeStrangeness(current_strangeness, DEFAULT_OOV_STRANGENESS);
    const newStrangeness = direction === 'keep' ? currentValue : adjustStrangeness(currentValue, direction);
    if (newStrangeness === null) {
      const err = new Error('Cannot adjust strangeness further');
      err.type = 'validation';
      throw err;
    }
    const updated = await upsertVocabStrangeness(req.user.user_id, req.params.word_id, newStrangeness, 'manual_adjust', record?.custom_strangeness ?? null);
    res.json({ success: true, data: { word: updated, oldStrangeness: record?.custom_strangeness ?? null, newStrangeness }, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/:word_id/set-strangeness', async (req, res, next) => {
  try {
    const target = parseInt(req.body?.strangeness, 10);
    if (!STRANGENESS_LEVELS.includes(target)) {
      const err = new Error('strangeness must be 1, 3, 5, or 7');
      err.type = 'validation';
      throw err;
    }
    const record = await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, req.params.word_id]);
    const updated = await upsertVocabStrangeness(req.user.user_id, req.params.word_id, target, 'direct_set', record?.custom_strangeness ?? null);
    res.json({ success: true, data: { word: updated, oldStrangeness: record?.custom_strangeness ?? null, newStrangeness: target }, error: null });
  } catch (e) {
    next(e);
  }
});

router.delete('/:word_id', async (req, res, next) => {
  try {
    const record = await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, req.params.word_id]);
    if (!record) {
      const err = new Error('Word not found in user vocabulary');
      err.type = 'not_found';
      throw err;
    }
    await run('DELETE FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, req.params.word_id]);
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

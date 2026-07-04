const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getAll, getOne, run, transaction } = require('../database/connection');
const { parseWithStrangeness, parse } = require('../services/textParser');
const { adjustStrangeness } = require('../services/strangeness');
const { extractArticleFromUrl } = require('../services/webArticle');

const router = express.Router();

function formatCharLimit(limit) {
  return limit.toLocaleString('en-US');
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).map(t => t.trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

router.post('/extract-url', async (req, res, next) => {
  try {
    const result = await extractArticleFromUrl(req.body?.url);
    res.json({ success: true, data: result, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    let { title, content, tags } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      const err = new Error('文章内容不能为空');
      err.type = 'validation';
      throw err;
    }
    content = content.trim();
    if (content.length > config.articleMaxChars) {
      const err = new Error(`文章内容不能超过 ${formatCharLimit(config.articleMaxChars)} 个字符，当前为 ${formatCharLimit(content.length)} 个字符`);
      err.type = 'validation';
      throw err;
    }
    if (!title || !title.trim()) {
      const firstLine = content.split(/\n/).map(l => l.trim()).find(Boolean) || '';
      title = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine || 'Untitled';
    }

    const articleId = uuidv4();
    const now = new Date().toISOString();
    const contentHash = crypto.createHash('md5').update(content).digest('hex');
    const tokens = await parse(content);
    const wordTokens = tokens.filter(t => t.is_word);
    const newWordCount = new Set(wordTokens.map(t => t.word_id || t.lemma)).size;
    const tagList = normalizeTags(tags);

    await transaction(async (tx) => {
      await tx.run(
        `INSERT INTO articles
         (user_id, article_id, title, content, content_hash, tags, new_word_count, first_study_time, last_study_time)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
        [req.user.user_id, articleId, title, content, contentHash, JSON.stringify(tagList), newWordCount, now, now]
      );
      await tx.run('DELETE FROM article_token_cache WHERE content_hash = $1', [contentHash]);
      for (const tag of tagList) {
        await tx.run(
          `INSERT INTO article_tags (user_id, tag_id, tag_path, article_count)
           VALUES ($1,$2,$3,1)
           ON CONFLICT (user_id, tag_path) DO UPDATE SET article_count = article_tags.article_count + 1`,
          [req.user.user_id, uuidv4(), tag]
        );
      }
    });

    res.json({ success: true, data: { articleId, newWordCount }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, tag, sort = 'last_study_time', order = 'desc' } = req.query;
    const allowedSorts = ['last_study_time', 'first_study_time', 'title', 'new_word_count'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'last_study_time';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const clauses = ['user_id = $1'];
    const params = [req.user.user_id];

    if (status === 'completed') clauses.push('is_completed = 1');
    if (status === 'incomplete') clauses.push('is_completed = 0');
    if (tag) {
      params.push(JSON.stringify(tag));
      clauses.push(`tags @> jsonb_build_array($${params.length}::text)`);
    }

    const articles = await getAll(
      `SELECT * FROM articles WHERE ${clauses.join(' AND ')} ORDER BY ${sortCol} ${sortOrder}`,
      params
    );
    res.json({ success: true, data: articles, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/batch-tag', async (req, res, next) => {
  try {
    const { article_ids, add_tags, remove_tags } = req.body;
    if (!Array.isArray(article_ids)) {
      const err = new Error('article_ids array is required');
      err.type = 'validation';
      throw err;
    }
    await transaction(async (tx) => {
      for (const articleId of article_ids) {
        const article = await tx.getOne('SELECT article_id, tags FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, articleId]);
        if (!article) continue;
        let tags = Array.isArray(article.tags) ? article.tags : [];
        for (const tag of normalizeTags(add_tags)) {
          if (!tags.includes(tag)) tags.push(tag);
          await tx.run(
            `INSERT INTO article_tags (user_id, tag_id, tag_path, article_count)
             VALUES ($1,$2,$3,1)
             ON CONFLICT (user_id, tag_path) DO UPDATE SET article_count = article_tags.article_count + 1`,
            [req.user.user_id, uuidv4(), tag]
          );
        }
        for (const tag of normalizeTags(remove_tags)) {
          tags = tags.filter(t => t !== tag);
          await tx.run('UPDATE article_tags SET article_count = GREATEST(0, article_count - 1) WHERE user_id = $1 AND tag_path = $2', [req.user.user_id, tag]);
        }
        await tx.run('UPDATE articles SET tags = $1::jsonb WHERE user_id = $2 AND article_id = $3', [JSON.stringify(tags), req.user.user_id, articleId]);
      }
    });
    res.json({ success: true, data: { updated: article_ids.length }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/calculate-strangeness', async (req, res, next) => {
  try {
    const words = Array.isArray(req.body?.words) ? req.body.words : [];
    const { batchCalcStrangeness } = require('../services/strangeness');
    const results = await batchCalcStrangeness(words.map(w => ({
      word_id: w.word_id || null,
      standard_level: w.standard_level ?? null,
      is_phrase: false,
    })));
    res.json({ success: true, data: results, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const article = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    if (!article) {
      const err = new Error('Article not found');
      err.type = 'not_found';
      throw err;
    }
    const { title, tags, is_completed, user_difficulty_rating, star_rating, media_links } = req.body;
    const updates = [];
    const params = [req.user.user_id, req.params.id];
    const add = (sql, value) => {
      params.push(value);
      updates.push(`${sql} = $${params.length}`);
    };
    if (title !== undefined) add('title', title);
    if (tags !== undefined) add('tags', JSON.stringify(normalizeTags(tags)));
    if (is_completed !== undefined) add('is_completed', is_completed ? 1 : 0);
    if (user_difficulty_rating !== undefined) add('user_difficulty_rating', user_difficulty_rating);
    if (star_rating !== undefined) add('star_rating', star_rating);
    if (media_links !== undefined) add('media_links', media_links);
    add('last_study_time', new Date().toISOString());
    await run(`UPDATE articles SET ${updates.join(', ')} WHERE user_id = $1 AND article_id = $2`, params);
    const updated = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    res.json({ success: true, data: updated, error: null });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const article = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    if (!article) {
      const err = new Error('Article not found');
      err.type = 'not_found';
      throw err;
    }
    await transaction(async (tx) => {
      await tx.run('DELETE FROM article_annotations WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
      for (const tag of article.tags || []) {
        await tx.run(
          'UPDATE article_tags SET article_count = GREATEST(0, article_count - 1) WHERE user_id = $1 AND tag_path = $2',
          [req.user.user_id, tag]
        );
      }
      await tx.run('DELETE FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    });
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const article = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    if (!article) {
      const err = new Error('Article not found');
      err.type = 'not_found';
      throw err;
    }

    const contentHash = crypto.createHash('md5').update(article.content).digest('hex');
    let tokens = null;
    if (article.content_hash === contentHash) {
      const cached = await getOne('SELECT tokens_json FROM article_token_cache WHERE content_hash = $1', [contentHash]);
      if (cached) tokens = cached.tokens_json;
    }
    if (!tokens) {
      tokens = await parse(article.content);
      await run(
        `INSERT INTO article_token_cache (content_hash, tokens_json, created_at)
         VALUES ($1,$2::jsonb,$3)
         ON CONFLICT (content_hash) DO UPDATE SET tokens_json = EXCLUDED.tokens_json, created_at = EXCLUDED.created_at`,
        [contentHash, JSON.stringify(tokens), new Date().toISOString()]
      );
      await run('UPDATE articles SET content_hash = $1 WHERE user_id = $2 AND article_id = $3', [contentHash, req.user.user_id, req.params.id]);
    }

    const annotations = await getAll(
      'SELECT * FROM article_annotations WHERE user_id = $1 AND article_id = $2 ORDER BY start_char_index',
      [req.user.user_id, req.params.id]
    );
    res.json({ success: true, data: { ...article, tokenized: tokens, annotations }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/batch-review', async (req, res, next) => {
  try {
    const { target_strangeness, direction } = req.body;
    if (!target_strangeness || !direction) {
      const err = new Error('target_strangeness and direction are required');
      err.type = 'validation';
      throw err;
    }
    const article = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    if (!article) {
      const err = new Error('Article not found');
      err.type = 'not_found';
      throw err;
    }
    const tokens = await parseWithStrangeness(article.content);
    const wordTokens = tokens.filter(t => t.is_word && t.strangeness == target_strangeness);
    const uniqueWordIds = [...new Set(wordTokens.map(t => t.word_id).filter(Boolean))];
    let modifiedCount = 0;
    const now = new Date().toISOString();
    await transaction(async (tx) => {
      for (const wordId of uniqueWordIds) {
        const record = await tx.getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [req.user.user_id, wordId]);
        if (!record) continue;
        const newStrangeness = adjustStrangeness(record.custom_strangeness, direction);
        if (newStrangeness === null) continue;
        await tx.run('UPDATE user_vocab SET custom_strangeness = $1, last_reviewed_at = $2, source_type = $3 WHERE user_id = $4 AND word_id = $5', [newStrangeness, now, 'manual', req.user.user_id, wordId]);
        await tx.run('INSERT INTO modification_log (user_id, log_id, word_id, action_type, old_strangeness, new_strangeness, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.user.user_id, uuidv4(), wordId, 'batch_review', record.custom_strangeness, newStrangeness, now]);
        modifiedCount++;
      }
    });
    res.json({ success: true, data: { modifiedCount }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

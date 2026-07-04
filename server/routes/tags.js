const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getAll, getOne, run, transaction } = require('../database/connection');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const tags = await getAll('SELECT * FROM article_tags WHERE user_id = $1 ORDER BY tag_path', [req.user.user_id]);
    res.json({ success: true, data: tags, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tagPath = String(req.body?.tag_path || '').trim();
    if (!tagPath) {
      const err = new Error('tag_path is required');
      err.type = 'validation';
      throw err;
    }
    const tagId = uuidv4();
    await run(
      'INSERT INTO article_tags (user_id, tag_id, tag_path, article_count) VALUES ($1,$2,$3,0)',
      [req.user.user_id, tagId, tagPath]
    );
    const tag = await getOne('SELECT * FROM article_tags WHERE user_id = $1 AND tag_id = $2', [req.user.user_id, tagId]);
    res.json({ success: true, data: tag, error: null });
  } catch (e) {
    if (e.code === '23505') e.type = 'conflict';
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const tagPath = String(req.body?.tag_path || '').trim();
    if (!tagPath) {
      const err = new Error('tag_path is required');
      err.type = 'validation';
      throw err;
    }
    const tag = await getOne('SELECT * FROM article_tags WHERE user_id = $1 AND tag_id = $2', [req.user.user_id, req.params.id]);
    if (!tag) {
      const err = new Error('Tag not found');
      err.type = 'not_found';
      throw err;
    }
    await transaction(async (tx) => {
      await tx.run('UPDATE article_tags SET tag_path = $1 WHERE user_id = $2 AND tag_id = $3', [tagPath, req.user.user_id, req.params.id]);
      const articles = await tx.getAll('SELECT article_id, tags FROM articles WHERE user_id = $1', [req.user.user_id]);
      for (const article of articles) {
        const tags = Array.isArray(article.tags) ? article.tags : [];
        if (tags.includes(tag.tag_path)) {
          const nextTags = tags.map(t => t === tag.tag_path ? tagPath : t);
          await tx.run('UPDATE articles SET tags = $1::jsonb WHERE user_id = $2 AND article_id = $3', [JSON.stringify(nextTags), req.user.user_id, article.article_id]);
        }
      }
    });
    const updated = await getOne('SELECT * FROM article_tags WHERE user_id = $1 AND tag_id = $2', [req.user.user_id, req.params.id]);
    res.json({ success: true, data: updated, error: null });
  } catch (e) {
    if (e.code === '23505') e.type = 'conflict';
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const tag = await getOne('SELECT * FROM article_tags WHERE user_id = $1 AND tag_id = $2', [req.user.user_id, req.params.id]);
    if (!tag) {
      const err = new Error('Tag not found');
      err.type = 'not_found';
      throw err;
    }
    await transaction(async (tx) => {
      const articles = await tx.getAll('SELECT article_id, tags FROM articles WHERE user_id = $1', [req.user.user_id]);
      for (const article of articles) {
        const tags = Array.isArray(article.tags) ? article.tags : [];
        if (tags.includes(tag.tag_path)) {
          await tx.run('UPDATE articles SET tags = $1::jsonb WHERE user_id = $2 AND article_id = $3', [JSON.stringify(tags.filter(t => t !== tag.tag_path)), req.user.user_id, article.article_id]);
        }
      }
      await tx.run('DELETE FROM article_tags WHERE user_id = $1 AND tag_id = $2', [req.user.user_id, req.params.id]);
    });
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

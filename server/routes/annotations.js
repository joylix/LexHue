const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getAll, getOne, run } = require('../database/connection');

const router = express.Router();

router.get('/articles/:id/annotations', async (req, res, next) => {
  try {
    const annotations = await getAll(
      'SELECT * FROM article_annotations WHERE user_id = $1 AND article_id = $2 ORDER BY start_char_index',
      [req.user.user_id, req.params.id]
    );
    res.json({ success: true, data: annotations, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/articles/:id/annotations', async (req, res, next) => {
  try {
    const { start_char_index, end_char_index, note_content } = req.body;
    if (start_char_index === undefined || end_char_index === undefined) {
      const err = new Error('start_char_index and end_char_index are required');
      err.type = 'validation';
      throw err;
    }
    const article = await getOne('SELECT * FROM articles WHERE user_id = $1 AND article_id = $2', [req.user.user_id, req.params.id]);
    if (!article) {
      const err = new Error('Article not found');
      err.type = 'not_found';
      throw err;
    }
    const annotationId = uuidv4();
    const now = new Date().toISOString();
    const selectedText = article.content.slice(start_char_index, end_char_index);
    await run(
      `INSERT INTO article_annotations
       (user_id, annotation_id, article_id, start_char_index, end_char_index, selected_text, note_content, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.user_id, annotationId, req.params.id, start_char_index, end_char_index, selectedText, note_content || '', now]
    );
    const annotation = await getOne('SELECT * FROM article_annotations WHERE user_id = $1 AND annotation_id = $2', [req.user.user_id, annotationId]);
    res.json({ success: true, data: annotation, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/annotations/:id', async (req, res, next) => {
  try {
    const annotation = await getOne('SELECT * FROM article_annotations WHERE user_id = $1 AND annotation_id = $2', [req.user.user_id, req.params.id]);
    if (!annotation) {
      const err = new Error('Annotation not found');
      err.type = 'not_found';
      throw err;
    }
    await run('UPDATE article_annotations SET note_content = $1 WHERE user_id = $2 AND annotation_id = $3', [req.body?.note_content || '', req.user.user_id, req.params.id]);
    const updated = await getOne('SELECT * FROM article_annotations WHERE user_id = $1 AND annotation_id = $2', [req.user.user_id, req.params.id]);
    res.json({ success: true, data: updated, error: null });
  } catch (e) {
    next(e);
  }
});

router.delete('/annotations/:id', async (req, res, next) => {
  try {
    const annotation = await getOne('SELECT * FROM article_annotations WHERE user_id = $1 AND annotation_id = $2', [req.user.user_id, req.params.id]);
    if (!annotation) {
      const err = new Error('Annotation not found');
      err.type = 'not_found';
      throw err;
    }
    await run('DELETE FROM article_annotations WHERE user_id = $1 AND annotation_id = $2', [req.user.user_id, req.params.id]);
    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

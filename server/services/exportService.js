const { getAll, transaction, getCurrentUser } = require('../database/connection');

async function exportJson() {
  const userId = getCurrentUser().user_id;
  const configRows = await getAll('SELECT key, value FROM user_config WHERE user_id = $1', [userId]);
  const userVocab = await getAll('SELECT * FROM user_vocab WHERE user_id = $1', [userId]);
  const articles = await getAll('SELECT * FROM articles WHERE user_id = $1', [userId]);
  const articleTags = await getAll('SELECT * FROM article_tags WHERE user_id = $1', [userId]);
  const annotations = await getAll('SELECT * FROM article_annotations WHERE user_id = $1', [userId]);
  const modLog = await getAll('SELECT * FROM modification_log WHERE user_id = $1', [userId]);
  return {
    version: '2.0',
    exported_at: new Date().toISOString(),
    schema: 'postgresql',
    data: {
      config: configRows,
      user_vocab: userVocab,
      articles,
      article_tags: articleTags,
      article_annotations: annotations,
      modification_log: modLog,
    },
  };
}

async function exportCsv() {
  const userId = getCurrentUser().user_id;
  const rows = await getAll(
    `SELECT COALESCE(d.lemma, uv.word_id) AS lemma,
            COALESCE(d.translation, '') AS translation,
            uv.custom_strangeness AS strangeness,
            uv.last_reviewed_at AS last_reviewed
     FROM user_vocab uv
     LEFT JOIN dictionary d ON uv.word_id = d.word_id
     WHERE uv.user_id = $1
     ORDER BY uv.custom_strangeness DESC, uv.last_reviewed_at ASC`,
    [userId]
  );
  const header = 'lemma,translation,strangeness,last_reviewed';
  return [header, ...rows.map(r => `${escapeCsv(r.lemma)},${escapeCsv(r.translation)},${r.strangeness},${r.last_reviewed || ''}`)].join('\n');
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function importJson(importData) {
  if (!importData || !importData.data) {
    const err = new Error('Invalid import data format');
    err.type = 'validation';
    throw err;
  }
  const userId = getCurrentUser().user_id;
  const data = importData.data;
  await transaction(async (tx) => {
    await tx.run('DELETE FROM modification_log WHERE user_id = $1', [userId]);
    await tx.run('DELETE FROM article_annotations WHERE user_id = $1', [userId]);
    await tx.run('DELETE FROM articles WHERE user_id = $1', [userId]);
    await tx.run('DELETE FROM article_tags WHERE user_id = $1', [userId]);
    await tx.run('DELETE FROM user_vocab WHERE user_id = $1', [userId]);
    await tx.run('DELETE FROM user_config WHERE user_id = $1', [userId]);

    for (const row of data.config || []) {
      await tx.run('INSERT INTO user_config (user_id, key, value) VALUES ($1,$2,$3)', [userId, row.key, row.value]);
    }
    for (const row of data.user_vocab || []) {
      await tx.run(
        `INSERT INTO user_vocab
         (user_id, word_id, custom_strangeness, source_type, user_doc_frequency, first_learned_at, last_reviewed_at, user_definition, user_pos, is_custom_word, mastered_at, ease_factor, interval_days, confirmed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [userId, row.word_id, row.custom_strangeness, row.source_type || 'manual', row.user_doc_frequency || 0, row.first_learned_at, row.last_reviewed_at, row.user_definition, row.user_pos, row.is_custom_word || 0, row.mastered_at, row.ease_factor, row.interval_days, row.confirmed || 0]
      );
    }
    for (const row of data.articles || []) {
      await tx.run(
        `INSERT INTO articles
         (user_id, article_id, title, content, content_hash, tags, new_word_count, first_study_time, last_study_time, is_completed, user_difficulty_rating, star_rating, global_views, global_avg_rating, difficulty_score, media_links)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [userId, row.article_id, row.title, row.content, row.content_hash || null, JSON.stringify(row.tags || []), row.new_word_count || 0, row.first_study_time, row.last_study_time, row.is_completed || 0, row.user_difficulty_rating, row.star_rating, row.global_views || 0, row.global_avg_rating, row.difficulty_score, row.media_links]
      );
    }
    for (const row of data.article_tags || []) {
      await tx.run('INSERT INTO article_tags (user_id, tag_id, tag_path, article_count) VALUES ($1,$2,$3,$4)', [userId, row.tag_id, row.tag_path, row.article_count || 0]);
    }
    for (const row of data.article_annotations || []) {
      await tx.run(
        `INSERT INTO article_annotations
         (user_id, annotation_id, article_id, start_char_index, end_char_index, selected_text, note_content, created_at, upvotes, is_approved)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [userId, row.annotation_id, row.article_id, row.start_char_index, row.end_char_index, row.selected_text, row.note_content, row.created_at, row.upvotes || 0, row.is_approved || 1]
      );
    }
    for (const row of data.modification_log || []) {
      await tx.run(
        'INSERT INTO modification_log (user_id, log_id, word_id, action_type, old_strangeness, new_strangeness, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [userId, row.log_id, row.word_id, row.action_type, row.old_strangeness, row.new_strangeness, row.timestamp]
      );
    }
  });
  return { success: true };
}

function backupDb() {
  const err = new Error('PostgreSQL 版本不支持直接下载 SQLite 数据库文件，请使用 JSON 导出。');
  err.type = 'validation';
  throw err;
}

module.exports = { exportJson, exportCsv, importJson, backupDb };

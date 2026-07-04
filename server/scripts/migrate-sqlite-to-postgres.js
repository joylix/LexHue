const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');
const { init } = require('../database/init');
const { getPool, DEFAULT_USER } = require('../database/connection');

function json(value, fallback = []) {
  if (value === null || value === undefined || value === '') return JSON.stringify(fallback);
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch (e) {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value);
}

async function migrateDictionary(db) {
  const pg = getPool();
  const rows = db.prepare('SELECT * FROM dictionary').all();
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const values = batch.map((row, index) => {
      const base = index * 13;
      params.push(row.word_id, row.lemma, row.pos, row.sw, row.translation, row.definition_en, row.phonetic_us, row.phonetic_uk, row.standard_level, row.sort_order || 0, json(row.collocations), json(row.example_sentences), row.source || 'sqlite');
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12}::jsonb,$${base + 13})`;
    }).join(',');
    await pg.query(
      `INSERT INTO dictionary
       (word_id, lemma, pos, sw, translation, definition_en, phonetic_us, phonetic_uk, standard_level, sort_order, collocations, example_sentences, source)
       VALUES ${values}
       ON CONFLICT (word_id) DO UPDATE SET
         lemma = EXCLUDED.lemma,
         pos = EXCLUDED.pos,
         sw = EXCLUDED.sw,
         translation = EXCLUDED.translation,
         definition_en = EXCLUDED.definition_en,
         phonetic_us = EXCLUDED.phonetic_us,
         phonetic_uk = EXCLUDED.phonetic_uk,
         standard_level = EXCLUDED.standard_level,
         sort_order = EXCLUDED.sort_order,
         collocations = EXCLUDED.collocations,
         example_sentences = EXCLUDED.example_sentences,
         source = EXCLUDED.source`,
      params
    );
    if ((i + batch.length) % 50000 === 0 || i + batch.length === rows.length) {
      console.log(`[MIGRATE] dictionary ${i + batch.length}/${rows.length}`);
    }
  }

  await insertSimpleRows('lemma_map', ['inflected_form', 'lemma'], db.prepare('SELECT * FROM lemma_map').all(), 2);
  await insertSimpleRows('common_abbreviations', ['abbr', 'full_form'], db.prepare('SELECT * FROM common_abbreviations').all(), 2);
  await insertPhrases(db.prepare('SELECT * FROM phrases').all());
  try {
    for (const row of db.prepare('SELECT * FROM word_relation').all()) {
      await pg.query(
        'INSERT INTO word_relation (word_id, relation_type, target_word_id, target_lemma, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (word_id, relation_type, target_word_id) DO NOTHING',
        [row.word_id, row.relation_type, row.target_word_id, row.target_lemma, row.source || 'sqlite']
      );
    }
  } catch (e) {
    // Older dictionaries may not have relations.
  }
  console.log(`[MIGRATE] dictionary rows: ${rows.length}`);
}

async function insertSimpleRows(table, columns, rows, width) {
  const pg = getPool();
  const batchSize = 2000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const values = batch.map((row, index) => {
      const base = index * width;
      for (const col of columns) params.push(row[col]);
      return `(${columns.map((_, colIndex) => `$${base + colIndex + 1}`).join(',')})`;
    }).join(',');
    await pg.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );
  }
}

async function insertPhrases(rows) {
  const pg = getPool();
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const values = batch.map((row, index) => {
      const base = index * 8;
      params.push(row.phrase_id, row.phrase_text, row.separable || 0, row.max_distance || 0, json(row.members), row.pos, row.translation, row.standard_level);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5}::jsonb,$${base + 6},$${base + 7},$${base + 8})`;
    }).join(',');
    await pg.query(
      `INSERT INTO phrases (phrase_id, phrase_text, separable, max_distance, members, pos, translation, standard_level)
       VALUES ${values}
       ON CONFLICT (phrase_id) DO NOTHING`,
      params
    );
  }
}

async function migrateUserdata(db) {
  const pg = getPool();
  const userId = DEFAULT_USER.user_id;
  for (const row of db.prepare('SELECT * FROM config').all()) {
    if (row.key === 'schema_version') continue;
    await pg.query(
      `INSERT INTO user_config (user_id, key, value) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [userId, row.key, row.value]
    );
  }
  for (const row of db.prepare('SELECT * FROM user_vocab').all()) {
    await pg.query(
      `INSERT INTO user_vocab
       (user_id, word_id, custom_strangeness, source_type, user_doc_frequency, first_learned_at, last_reviewed_at, user_definition, user_pos, is_custom_word, mastered_at, ease_factor, interval_days, confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id, word_id) DO UPDATE SET custom_strangeness = EXCLUDED.custom_strangeness`,
      [userId, row.word_id, row.custom_strangeness, row.source_type, row.user_doc_frequency || 0, row.first_learned_at, row.last_reviewed_at, row.user_definition, row.user_pos, row.is_custom_word || 0, row.mastered_at, row.ease_factor, row.interval_days, row.confirmed || 0]
    );
  }
  for (const row of db.prepare('SELECT * FROM articles').all()) {
    await pg.query(
      `INSERT INTO articles
       (user_id, article_id, title, content, content_hash, tags, new_word_count, first_study_time, last_study_time, is_completed, user_difficulty_rating, star_rating, global_views, global_avg_rating, difficulty_score, media_links)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (user_id, article_id) DO NOTHING`,
      [userId, row.article_id, row.title, row.content, row.content_hash, json(row.tags), row.new_word_count || 0, row.first_study_time, row.last_study_time, row.is_completed || 0, row.user_difficulty_rating, row.star_rating, row.global_views || 0, row.global_avg_rating, row.difficulty_score, row.media_links]
    );
  }
  for (const row of db.prepare('SELECT * FROM article_tags').all()) {
    await pg.query('INSERT INTO article_tags (user_id, tag_id, tag_path, article_count) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, tag_path) DO NOTHING', [userId, row.tag_id, row.tag_path, row.article_count || 0]);
  }
  for (const row of db.prepare('SELECT * FROM article_annotations').all()) {
    await pg.query(
      `INSERT INTO article_annotations
       (user_id, annotation_id, article_id, start_char_index, end_char_index, selected_text, note_content, created_at, upvotes, is_approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, annotation_id) DO NOTHING`,
      [userId, row.annotation_id, row.article_id, row.start_char_index, row.end_char_index, row.selected_text, row.note_content, row.created_at, row.upvotes || 0, row.is_approved || 1]
    );
  }
  console.log('[MIGRATE] userdata migrated to local user');
}

async function main() {
  await init();
  await getPool().query('TRUNCATE word_relation, phrases, common_abbreviations, lemma_map, dictionary CASCADE');
  if (fs.existsSync(config.legacyDictionaryDbPath)) {
    await migrateDictionary(new Database(config.legacyDictionaryDbPath, { readonly: true }));
  }
  if (fs.existsSync(config.legacyUserdataDbPath)) {
    await migrateUserdata(new Database(config.legacyUserdataDbPath, { readonly: true }));
  }
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

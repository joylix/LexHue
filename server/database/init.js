const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getPool, readSeed, DEFAULT_USER } = require('./connection');

const DEFAULT_CONFIG = {
  user_level: '3',
  init_mode: 'gradient',
  color_blind_mode: 'false',
  density_threshold: '40',
  onboarding_completed: 'false',
  oov_default_strangeness: '7',
  color_scheme: 'light',
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

async function ensureSchema() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS dictionary (
      word_id TEXT PRIMARY KEY,
      lemma TEXT NOT NULL,
      pos TEXT,
      sw TEXT,
      translation TEXT,
      definition_en TEXT,
      phonetic_us TEXT,
      phonetic_uk TEXT,
      standard_level INTEGER NOT NULL CHECK(standard_level BETWEEN 0 AND 10),
      sort_order INTEGER DEFAULT 0,
      collocations JSONB DEFAULT '[]'::jsonb,
      example_sentences JSONB DEFAULT '[]'::jsonb,
      source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_dict_lemma ON dictionary(lower(lemma));
    CREATE INDEX IF NOT EXISTS idx_dict_level ON dictionary(standard_level);
    CREATE INDEX IF NOT EXISTS idx_dict_sort ON dictionary(sort_order);
    CREATE INDEX IF NOT EXISTS idx_dict_sw ON dictionary(sw);

    CREATE TABLE IF NOT EXISTS lemma_map (
      inflected_form TEXT PRIMARY KEY,
      lemma TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS common_abbreviations (
      abbr TEXT PRIMARY KEY,
      full_form TEXT
    );

    CREATE TABLE IF NOT EXISTS phrases (
      phrase_id TEXT PRIMARY KEY,
      phrase_text TEXT NOT NULL,
      separable INTEGER DEFAULT 0,
      max_distance INTEGER DEFAULT 0,
      members JSONB DEFAULT '[]'::jsonb,
      pos TEXT,
      translation TEXT,
      standard_level INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_phrases_text ON phrases(phrase_text);

    CREATE TABLE IF NOT EXISTS word_relation (
      word_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      target_word_id TEXT NOT NULL,
      target_lemma TEXT,
      source TEXT DEFAULT 'manual',
      PRIMARY KEY (word_id, relation_type, target_word_id)
    );
    CREATE INDEX IF NOT EXISTS idx_word_rel_target ON word_relation(target_word_id);

    CREATE TABLE IF NOT EXISTS user_config (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS user_vocab (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      word_id TEXT NOT NULL,
      custom_strangeness INTEGER NOT NULL CHECK(custom_strangeness IN (1,3,5,7)),
      source_type TEXT DEFAULT 'manual',
      user_doc_frequency INTEGER DEFAULT 0,
      first_learned_at TIMESTAMPTZ,
      last_reviewed_at TIMESTAMPTZ,
      user_definition TEXT,
      user_pos TEXT,
      is_custom_word INTEGER DEFAULT 0,
      mastered_at TIMESTAMPTZ,
      ease_factor REAL,
      interval_days INTEGER,
      confirmed INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, word_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review ON user_vocab(user_id, last_reviewed_at, custom_strangeness);

    CREATE TABLE IF NOT EXISTS articles (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      article_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT,
      tags JSONB DEFAULT '[]'::jsonb,
      new_word_count INTEGER DEFAULT 0,
      first_study_time TIMESTAMPTZ,
      last_study_time TIMESTAMPTZ,
      is_completed INTEGER DEFAULT 0,
      user_difficulty_rating INTEGER,
      star_rating INTEGER,
      global_views INTEGER DEFAULT 0,
      global_avg_rating REAL,
      difficulty_score REAL,
      media_links TEXT,
      PRIMARY KEY (user_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS article_token_cache (
      content_hash TEXT PRIMARY KEY,
      tokens_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL,
      tag_path TEXT NOT NULL,
      article_count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, tag_id),
      UNIQUE (user_id, tag_path)
    );

    CREATE TABLE IF NOT EXISTS article_annotations (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      annotation_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      start_char_index INTEGER NOT NULL,
      end_char_index INTEGER NOT NULL,
      selected_text TEXT,
      note_content TEXT,
      created_at TIMESTAMPTZ,
      upvotes INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, annotation_id)
    );

    CREATE TABLE IF NOT EXISTS modification_log (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      log_id TEXT NOT NULL,
      word_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      old_strangeness INTEGER,
      new_strangeness INTEGER,
      timestamp TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, log_id)
    );

    CREATE TABLE IF NOT EXISTS level_test_texts (
      text_id TEXT PRIMARY KEY,
      level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 9),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT DEFAULT 'admin',
      is_active INTEGER DEFAULT 1,
      created_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_level_test_texts_level ON level_test_texts(level, is_active);
  `);
  await db.query('ALTER TABLE level_test_texts DROP CONSTRAINT IF EXISTS level_test_texts_level_check');
  await db.query('UPDATE level_test_texts SET level = 9 WHERE level > 9');
  await db.query('UPDATE level_test_texts SET level = 0 WHERE level < 0');
  await db.query(`
    ALTER TABLE level_test_texts
    ADD CONSTRAINT level_test_texts_level_check CHECK(level BETWEEN 0 AND 9)
  `);
}

async function seedDefaults() {
  const db = getPool();
  const { salt, hash } = hashPassword('lexhue');
  await db.query(
    `INSERT INTO users (user_id, username, password_hash, salt, display_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO NOTHING`,
    [DEFAULT_USER.user_id, DEFAULT_USER.username, hash, salt, DEFAULT_USER.display_name]
  );
  await db.query("UPDATE users SET role = 'user' WHERE user_id = $1 AND role IS NULL", [DEFAULT_USER.user_id]);

  const adminHash = hashPassword('admin');
  await db.query(
    `INSERT INTO users (user_id, username, password_hash, salt, role, display_name)
     VALUES ('admin', 'admin', $1, $2, 'admin', '管理员')
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username,
       password_hash = EXCLUDED.password_hash,
       salt = EXCLUDED.salt,
       role = 'admin',
       display_name = EXCLUDED.display_name`,
    [adminHash.hash, adminHash.salt]
  );

  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await db.query(
      `INSERT INTO user_config (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [DEFAULT_USER.user_id, key, value]
    );
  }
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await db.query(
      `INSERT INTO user_config (user_id, key, value)
       VALUES ('admin', $1, $2)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [key, value]
    );
  }
}

function parseJson(value, fallback = []) {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

async function seedDictionary() {
  const db = getPool();
  const existing = await db.query('SELECT COUNT(*)::int AS count FROM dictionary');
  if (existing.rows[0].count > 0) return;

  const dictionary = readSeed('dictionary.json', []);
  const lemmaMap = readSeed('lemma_map.json', []);
  const abbreviations = readSeed('abbreviations.json', []);
  const phrases = readSeed('phrases.json', []);

  for (const e of dictionary) {
    const sw = e.word_id ? e.word_id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
    await db.query(
      `INSERT INTO dictionary
       (word_id, lemma, pos, sw, translation, definition_en, phonetic_us, phonetic_uk, standard_level, sort_order, collocations, example_sentences, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
       ON CONFLICT (word_id) DO NOTHING`,
      [
        e.word_id,
        e.lemma,
        e.pos || null,
        sw,
        e.translation || null,
        e.definition_en || null,
        e.phonetic_us || null,
        e.phonetic_uk || null,
        e.standard_level ?? 5,
        e.sort_order || 0,
        JSON.stringify(parseJson(e.collocations)),
        JSON.stringify(parseJson(e.example_sentences)),
        e.source || 'seed',
      ]
    );
  }

  for (const e of lemmaMap) {
    await db.query(
      'INSERT INTO lemma_map (inflected_form, lemma) VALUES ($1, $2) ON CONFLICT (inflected_form) DO NOTHING',
      [e.inflected_form, e.lemma]
    );
  }

  for (const e of abbreviations) {
    await db.query(
      'INSERT INTO common_abbreviations (abbr, full_form) VALUES ($1, $2) ON CONFLICT (abbr) DO NOTHING',
      [e.abbr, e.full_form]
    );
  }

  for (const e of phrases) {
    await db.query(
      `INSERT INTO phrases (phrase_id, phrase_text, separable, max_distance, members, pos, translation, standard_level)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
       ON CONFLICT (phrase_id) DO NOTHING`,
      [e.phrase_id || uuidv4(), e.phrase_text, e.separable || 0, e.max_distance || 0, JSON.stringify(parseJson(e.members)), e.pos || null, e.translation || null, e.standard_level || null]
    );
  }
}

async function seedLevelTestTexts() {
  const db = getPool();
  const existing = await db.query("SELECT COUNT(*)::int AS count FROM level_test_texts WHERE source = 'seed'");
  if (existing.rows[0].count > 0) return;
  const texts = readSeed('level_texts.json', []);
  for (const item of texts) {
    const level = Math.max(0, Math.min(9, parseInt(item.level, 10)));
    await db.query(
      `INSERT INTO level_test_texts (text_id, level, title, content, source, is_active, created_by)
       VALUES ($1,$2,$3,$4,'seed',1,'admin')
       ON CONFLICT (text_id) DO NOTHING`,
      [item.text_id, level, item.title, item.content]
    );
  }
}

async function init() {
  console.log('[INIT] Initializing PostgreSQL schema...');
  await ensureSchema();
  await seedDefaults();
  await seedDictionary();
  await seedLevelTestTexts();
  console.log('[INIT] Done.');
}

if (require.main === module) {
  init().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { init, ensureSchema, seedDefaults, seedDictionary, seedLevelTestTexts, hashPassword, DEFAULT_CONFIG };

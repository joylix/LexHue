/**
 * Strangeness calculation service
 * Computes the "strangeness" (difficulty) level for words/phrases
 * based on user level, init mode, and user vocabulary records.
 */

const { getAll, getOne, getCurrentUser } = require('../database/connection');
const {
  STRANGENESS_LEVELS,
  DEFAULT_OOV_STRANGENESS,
  MAX_STRANGENESS,
  normalizeStrangeness,
} = require('../constants/strangeness');

/**
 * Get a config value from the user database
 */
async function getConfig(key) {
  const row = await getOne('SELECT value FROM user_config WHERE user_id = $1 AND key = $2', [getCurrentUser().user_id, key]);
  return row ? row.value : null;
}

/**
 * Get user vocabulary record for a word_id
 */
async function getUserVocab(wordId) {
  return await getOne('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = $2', [getCurrentUser().user_id, wordId]);
}

function calcGradientStrangeness(standardLevel, userLevel) {
  const diff = standardLevel - userLevel;
  if (diff < 0) return 1;
  if (diff === 0) return 3;
  if (diff === 1) return 5;
  return MAX_STRANGENESS;
}

/**
 * Calculate strangeness for a single word/phrase.
 *
 * @param {object} params
 * @param {string|null} params.word_id - word_id in dictionary, null for OOV
 * @param {number|null} params.standard_level - standard difficulty level (1-10)
 * @param {boolean} params.is_phrase - whether this is a phrase
 * @param {object|null} params.userVocabRecord - pre-fetched user_vocab record (optional)
 * @returns {{ strangeness: number, source: 'manual'|'null' }}
 */
async function calcStrangeness({ word_id, standard_level, is_phrase = false, userVocabRecord = null }) {
  const userLevel = parseInt(await getConfig('user_level') || '3', 10);
  const initMode = await getConfig('init_mode') || 'gradient';
  const oovDefault = normalizeStrangeness(await getConfig('oov_default_strangeness'), DEFAULT_OOV_STRANGENESS);

  // Check user vocabulary record (manual override)
  const record = userVocabRecord !== null ? userVocabRecord : (word_id ? await getUserVocab(word_id) : null);
  if (record && record.source_type === 'manual') {
    return { strangeness: normalizeStrangeness(record.custom_strangeness), source: 'manual' };
  }

  // OOV (Out of Vocabulary) - word not in dictionary
  if (!word_id) {
    return { strangeness: oovDefault, source: 'null' };
  }

  // Strict mode
  if (initMode === 'strict') {
    if (standard_level <= userLevel) {
      return { strangeness: 1, source: 'null' };
    }
    return { strangeness: MAX_STRANGENESS, source: 'null' };
  }

  // Gradient mode
  return { strangeness: calcGradientStrangeness(standard_level, userLevel), source: 'null' };
}

/**
 * Batch calculate strangeness for multiple tokens.
 * Optimized to fetch config once and batch query user_vocab.
 *
 * @param {Array<{word_id: string|null, standard_level: number|null, is_phrase: boolean}>} items
 * @returns {Array<{strangeness: number, source: 'manual'|'null'}>}
 */
async function batchCalcStrangeness(items) {
  const userLevel = parseInt(await getConfig('user_level') || '3', 10);
  const initMode = await getConfig('init_mode') || 'gradient';
  const oovDefault = normalizeStrangeness(await getConfig('oov_default_strangeness'), DEFAULT_OOV_STRANGENESS);

  // Batch fetch all user_vocab records
  const wordIds = [...new Set(items.map(i => i.word_id).filter(Boolean))];
  const vocabMap = new Map();

  if (wordIds.length > 0) {
    const rows = await getAll('SELECT * FROM user_vocab WHERE user_id = $1 AND word_id = ANY($2::text[])', [getCurrentUser().user_id, wordIds]);
    for (const row of rows) {
      vocabMap.set(row.word_id, row);
    }
  }

  return items.map(item => {
    // 1-2 字母的词直接返回最低陌生度
    if (item.word_id && item.word_id.length <= 2) {
      return { strangeness: 1, source: 'null' };
    }

    const record = item.word_id ? vocabMap.get(item.word_id) : null;

    if (record && record.source_type === 'manual') {
      return { strangeness: normalizeStrangeness(record.custom_strangeness), source: 'manual' };
    }
    if (!item.word_id) {
      return { strangeness: oovDefault, source: 'null' };
    }
    if (initMode === 'strict') {
      return {
        strangeness: item.standard_level <= userLevel ? 1 : MAX_STRANGENESS,
        source: 'null'
      };
    }
    return { strangeness: calcGradientStrangeness(item.standard_level, userLevel), source: 'null' };
  });
}

/**
 * Adjust strangeness up or down by one step.
 * Valid strangeness values: 1, 3, 5, 7
 *
 * @param {number} current - current strangeness value
 * @param {'up'|'down'} direction
 * @returns {number|null} new strangeness, or null if cannot adjust
 */
function adjustStrangeness(current, direction) {
  const levels = STRANGENESS_LEVELS;
  const idx = levels.indexOf(current);
  if (idx === -1) return null;

  if (direction === 'down' && idx > 0) return levels[idx - 1];
  if (direction === 'up' && idx < levels.length - 1) return levels[idx + 1];
  return null; // Already at boundary
}

/**
 * Batch calculate strangeness with a specific user level (without modifying config).
 * Used by level test to pre-calculate strangeness for display.
 */
async function batchCalcStrangenessWithLevel(items, level) {
  const userLevel = level;
  // Default values (same as getConfig would return)
  const oovDefault = DEFAULT_OOV_STRANGENESS;

  return items.map(item => {
    // 1-2 字母的词直接返回最低陌生度
    if (item.word_id && item.word_id.length <= 2) {
      return { strangeness: 1, source: 'null' };
    }

    if (!item.word_id) {
      return { strangeness: oovDefault, source: 'null' };
    }
    // Always use gradient mode for level test
    return { strangeness: calcGradientStrangeness(item.standard_level, userLevel), source: 'null' };
  });
}

module.exports = {
  calcStrangeness,
  batchCalcStrangeness,
  batchCalcStrangenessWithLevel,
  adjustStrangeness,
  getConfig,
};

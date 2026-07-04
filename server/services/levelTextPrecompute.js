const fs = require('fs');
const path = require('path');
const config = require('../config');
const { parse } = require('./textParser');
const { batchCalcStrangenessWithLevel } = require('./strangeness');

const levelTextRawPath = path.join(__dirname, '..', 'database', 'seed', 'level_texts.json');
const legacyPrecomputedPath = path.join(__dirname, '..', 'database', 'seed', 'level_texts_precomputed.json');

function readExistingPrecomputed() {
  if (fs.existsSync(config.levelTextPrecomputedPath)) {
    return config.levelTextPrecomputedPath;
  }
  return null;
}

async function buildPrecomputedLevelTexts() {
  const levelTextRaw = JSON.parse(fs.readFileSync(levelTextRawPath, 'utf-8'));

  const built = [];
  for (const item of levelTextRaw) {
    const tokens = await parse(item.content);
    const wordTokens = tokens.filter((token) => token.is_word);
    const strangenessItems = wordTokens.map((token) => ({
      word_id: token.word_id || null,
      standard_level: token.standard_level ?? null,
      is_phrase: !!token.is_phrase_member,
    }));
    const levels = {};
    for (let level = 0; level <= 9; level++) {
      const results = await batchCalcStrangenessWithLevel(strangenessItems, level);
      levels[level] = results.map((result) => result.strangeness);
    }

    built.push({
      level: item.level,
      text_id: item.text_id,
      title: item.title,
      content: item.content,
      tokens: tokens.map((token) => ({
        text: token.text,
        is_word: token.is_word,
        word_id: token.word_id,
        lemma: token.lemma,
        standard_level: token.standard_level,
        start_char: token.start_char,
        end_char: token.end_char,
        is_phrase_member: token.is_phrase_member,
        phrase_id: token.phrase_id,
        phrase_text: token.phrase_text,
      })),
      levels,
    });
  }
  return built;
}

async function ensureLevelTextPrecomputed() {
  const existingPath = readExistingPrecomputed();
  if (existingPath) {
    console.log(`[INIT] Level test precomputed data already exists: ${existingPath}`);
    return existingPath;
  }

  console.log('[INIT] Precomputing level test data...');
  const startTime = Date.now();
  fs.mkdirSync(path.dirname(config.levelTextPrecomputedPath), { recursive: true });
  const result = await buildPrecomputedLevelTexts();
  fs.writeFileSync(config.levelTextPrecomputedPath, JSON.stringify(result, null, 2));
  console.log(`[INIT] Level test precomputed data saved (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  return config.levelTextPrecomputedPath;
}

module.exports = {
  ensureLevelTextPrecomputed,
};

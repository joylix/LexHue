/**
 * Adaptive Level Test Service
 * State machine for determining user's English level.
 */

const { v4: uuidv4 } = require('uuid');
const { run, getAll, getOne, getCurrentUser } = require('../database/connection');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeStrangeness } = require('../constants/strangeness');
const { batchCalcStrangenessWithLevel } = require('./strangeness');

// Load level test texts from precomputed data
let levelTexts = null;

const legacyPrecomputedPath = path.join(__dirname, '..', 'database', 'seed', 'level_texts_precomputed.json');

function getPrecomputedPath() {
  if (fs.existsSync(config.levelTextPrecomputedPath)) {
    return config.levelTextPrecomputedPath;
  }
  return legacyPrecomputedPath;
}

function getLevelTexts() {
  if (!levelTexts) {
    const filePath = getPrecomputedPath();
    levelTexts = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log('[level-test] Loaded precomputed texts:', levelTexts.length, filePath);
  }
  return levelTexts;
}

async function applyLevelStrangeness(textObj, level) {
  if (!textObj) return null;
  const wordTokens = textObj.tokens.filter(token => token.is_word);
  const items = wordTokens.map(token => ({
    word_id: token.word_id || null,
    standard_level: token.standard_level ?? null,
    is_phrase: !!token.is_phrase_member,
  }));
  const calculated = await batchCalcStrangenessWithLevel(items, level);
  const strangenessValues = calculated.map(result => result.strangeness);
  let wordIndex = 0;
  return textObj.tokens.map((token, index) => ({
    ...token,
    strangeness: token.is_word
      ? normalizeStrangeness(strangenessValues[wordIndex++] ?? 1, 1)
      : undefined,
  }));
}

async function buildLevelTextDetail(row) {
  if (!row) return null;
  const { parse } = require('./textParser');
  const parsed = await parse(row.content);
  const tokens = await applyLevelStrangeness({ ...row, tokens: parsed }, row.level);
  return {
    text_id: row.text_id,
    level: row.level,
    title: row.title,
    content: row.content,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tokens,
  };
}

async function getLevelTextDetail(textId) {
  const row = await getOne(
    `SELECT text_id, level, title, content, source, created_at, updated_at
     FROM level_test_texts
     WHERE text_id = $1 AND is_active = 1`,
    [textId]
  );
  return buildLevelTextDetail(row);
}

/**
 * Level Test State Machine
 *
 * Flow:
 * - Start at level 4 (default for new users)
 * - User reads text and provides feedback: 'easy', 'hard', 'confirm', 'skip', 'cancel'
 * - 'easy' -> go up one level
 * - 'hard' -> go down one level
 * - 'confirm' -> use current level as final, mark onboarding complete
 * - 'cancel' -> abort test, keep default level 4
 * - 'skip' -> use default level 4, mark onboarding complete
 *
 * Convergence: when range narrows to 1 level, or max 6 questions asked.
 */

const sessions = new Map();

async function getTextForLevel(level) {
  const row = await getOne(
    `SELECT text_id, level, title, content
     FROM level_test_texts
     WHERE level = $1 AND is_active = 1
     ORDER BY created_at DESC
     LIMIT 1`,
    [level]
  );
  if (row) {
    const { parse } = require('./textParser');
    const tokens = await parse(row.content);
    return {
      text_id: row.text_id,
      level: row.level,
      title: row.title,
      content: row.content,
      tokens,
    };
  }
  return getLevelTexts().find(t => t.level === level);
}

/**
 * Tokenize content using a specific user level for strangeness calculation.
 * Returns tokens array with strangeness data.
 */
function generateSessionId() {
  return 'lt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Start a new level test session.
 * Returns { sessionId, level, text }
 */
async function startTest() {
  const sessionId = generateSessionId();

  // Start at level 4
  const startLevel = 4;
  const textObj = await getTextForLevel(startLevel);

  // Use precomputed tokens and strangeness
  const tokens = await applyLevelStrangeness(textObj, startLevel);

  const session = {
    sessionId,
    currentLevel: startLevel,
    minLevel: 0,
    maxLevel: 9,
    asked: 0,
    history: [],
    completed: false,
    finalLevel: null,
  };

  sessions.set(sessionId, session);

  return {
    sessionId,
    level: startLevel,
    text: textObj ? { text_id: textObj.text_id, title: textObj.title, content: textObj.content, tokens } : null,
  };
}

/**
 * Submit feedback for the current level and get next step.
 */
async function saveLevel(level) {
  const userId = getCurrentUser().user_id;
  await run(
    `INSERT INTO user_config (user_id, key, value)
     VALUES ($1,'user_level',$2)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [userId, String(level)]
  );
  await run(
    `INSERT INTO user_config (user_id, key, value)
     VALUES ($1,'onboarding_completed','true')
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [userId]
  );
}

async function submitFeedback(sessionId, level, feedback) {
  const session = sessions.get(sessionId);
  if (!session) {
    const err = new Error('Level test session not found');
    err.type = 'not_found';
    throw err;
  }

  if (session.completed) {
    const err = new Error('Level test already completed');
    err.type = 'conflict';
    throw err;
  }

  // Handle cancel
  if (feedback === 'cancel') {
    session.completed = true;
    session.finalLevel = null; // No level determined
    return {
      completed: true,
      cancelled: true,
      finalLevel: null,
      nextLevel: null,
      text: null,
    };
  }

  // Handle skip
  if (feedback === 'skip') {
    session.completed = true;
    session.finalLevel = 4;

    await saveLevel(4);

    return {
      completed: true,
      cancelled: false,
      finalLevel: 4,
      nextLevel: null,
      text: null,
    };
  }

  // Handle confirm
  if (feedback === 'confirm') {
    session.completed = true;
    session.finalLevel = session.currentLevel;

    await saveLevel(session.currentLevel);

    return {
      completed: true,
      cancelled: false,
      finalLevel: session.currentLevel,
      nextLevel: null,
      text: null,
    };
  }

  // Record history
  session.history.push({ level, feedback });
  session.asked++;

  // Adjust level based on feedback
  if (feedback === 'easy') {
    session.minLevel = Math.max(session.minLevel, level + 1);
    session.currentLevel = Math.min(level + 1, 9);
  } else if (feedback === 'hard') {
    session.maxLevel = Math.min(session.maxLevel, level - 1);
    session.currentLevel = Math.max(level - 1, 0);
  }

  // Check convergence
  const maxQuestions = 6;

  if (session.asked >= maxQuestions || session.minLevel >= session.maxLevel) {
    session.completed = true;
    session.finalLevel = Math.round((session.minLevel + session.maxLevel) / 2);
    session.currentLevel = session.finalLevel;

    await saveLevel(session.finalLevel);

    return {
      completed: true,
      cancelled: false,
      finalLevel: session.finalLevel,
      nextLevel: null,
      text: null,
    };
  }

  // Get next text - use precomputed data
  const textObj = await getTextForLevel(session.currentLevel);
  const nextLevel = session.currentLevel;
  const tokens = await applyLevelStrangeness(textObj, nextLevel);

  return {
    completed: false,
    cancelled: false,
    finalLevel: null,
    nextLevel: nextLevel,
    text: textObj ? { text_id: textObj.text_id, title: textObj.title, content: textObj.content, tokens } : null,
    asked: session.asked,
  };
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    const timestamp = parseInt(id.split('_')[1], 10);
    if (now - timestamp > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}

// Auto-cleanup every 10 minutes
setInterval(cleanupSessions, 10 * 60 * 1000);

module.exports = {
  startTest,
  submitFeedback,
  getSession,
  cleanupSessions,
  getTextForLevel,
  getLevelTextDetail,
};

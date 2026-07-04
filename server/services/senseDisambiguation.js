/**
 * Sense Disambiguation Service
 * Context-based ranking of word senses for polysemous words.
 *
 * Uses a simple but effective heuristic: look at the surrounding words'
 * POS tags and match them against common collocational patterns for each sense.
 *
 * For example, "watch" as a verb often follows pronouns/nouns (I watch, he watches),
 * while "watch" as a noun often follows articles/adjectives (the watch, a nice watch).
 */

// POS tag mapping from Free Dictionary API POS names to simplified tags
const POS_MAP = {
  noun: 'NOUN',
  verb: 'VERB',
  adjective: 'ADJ',
  adverb: 'ADV',
  pronoun: 'PRON',
  preposition: 'PREP',
  conjunction: 'CONJ',
  determiner: 'DET',
  interjection: 'INTJ',
  exclamation: 'INTJ',
};

/**
 * Get simplified POS tag from API POS name
 */
function simplifyPos(pos) {
  if (!pos) return null;
  return POS_MAP[pos.toLowerCase()] || pos.toUpperCase();
}

/**
 * Score how well a sense matches the surrounding context.
 *
 * Heuristics:
 * 1. If the word's POS in context matches the sense's POS → high score
 * 2. If surrounding words have POS patterns typical for the sense → medium score
 * 3. Default: use sense order from API (first sense is usually most common)
 *
 * @param {Object} token - The target word token (with lemma, senses, etc.)
 * @param {Array} contextTokens - Surrounding tokens (window of ±3 words)
 * @param {Object} sense - A sense object { pos, definitions: [...] }
 * @returns {number} Score (higher = better match)
 */
function scoreSenseContext(token, contextTokens, sense) {
  let score = 0;

  const sensePos = simplifyPos(sense.pos);

  // Heuristic 1: Check if the token's own POS (from API) matches this sense's POS
  // This is the strongest signal
  if (token.pos && simplifyPos(token.pos) === sensePos) {
    score += 10;
  }

  // Heuristic 2: Contextual POS patterns
  // Get the POS tags of surrounding words
  const surroundingPos = contextTokens
    .filter(t => t !== token && t.is_word && t.pos)
    .map(t => simplifyPos(t.pos));

  // Common English patterns:
  // - VERB sense: preceded by PRON/NOUN, followed by NOUN/ADV/PREP
  // - NOUN sense: preceded by ADJ/DET, followed by VERB/PREP
  // - ADJ sense: preceded by ADV/DET, followed by NOUN
  // - ADV sense: preceded by VERB/ADJ, followed by ADJ/VERB

  const prevTokens = contextTokens.filter(t => t.is_word && t !== token);
  const prevPos = prevTokens.length > 0 ? simplifyPos(prevTokens[prevTokens.length - 1].pos) : null;
  const nextTokens = contextTokens.filter(t => t.is_word && t !== token);
  const nextPos = nextTokens.length > 0 ? simplifyPos(nextTokens[0].pos) : null;

  if (sensePos === 'VERB') {
    // Verbs often follow pronouns or nouns (subjects)
    if (prevPos === 'PRON' || prevPos === 'NOUN') score += 3;
    // Verbs often precede nouns (objects) or adverbs
    if (nextPos === 'NOUN' || nextPos === 'ADV' || nextPos === 'PREP') score += 2;
    // After modal verbs or "to"
    if (prevPos === 'VERB') score += 2;
  } else if (sensePos === 'NOUN') {
    // Nouns often follow adjectives or determiners
    if (prevPos === 'ADJ' || prevPos === 'DET') score += 3;
    // Nouns often precede verbs (as subjects) or prepositions
    if (nextPos === 'VERB' || nextPos === 'PREP') score += 2;
  } else if (sensePos === 'ADJ') {
    // Adjectives often follow adverbs or determiners
    if (prevPos === 'ADV' || prevPos === 'DET') score += 3;
    // Adjectives often precede nouns
    if (nextPos === 'NOUN') score += 3;
  } else if (sensePos === 'ADV') {
    // Adverbs often follow verbs or adjectives
    if (prevPos === 'VERB' || prevPos === 'ADJ') score += 3;
    // Adverbs often precede adjectives or verbs
    if (nextPos === 'ADJ' || nextPos === 'VERB') score += 2;
  }

  // Heuristic 3: Prefer senses with more definitions (usually more common)
  if (sense.definitions && sense.definitions.length > 1) {
    score += 1;
  }

  return score;
}

/**
 * Rank senses for a polysemous word based on context.
 *
 * @param {Object} token - The target word token with senses array
 * @param {Array} allTokens - All tokens in the text (for context window)
 * @param {number} tokenIndex - Index of the target token in allTokens
 * @returns {Array} Sorted senses (best match first)
 */
function rankSensesByContext(token, allTokens, tokenIndex) {
  if (!token.senses || token.senses.length <= 1) {
    return token.senses || [];
  }

  // Get context window: ±3 word tokens around the target
  const contextStart = Math.max(0, tokenIndex - 5);
  const contextEnd = Math.min(allTokens.length, tokenIndex + 6);
  const contextWindow = allTokens.slice(contextStart, contextEnd);

  // Score each sense
  const scored = token.senses.map((sense, idx) => ({
    sense,
    score: scoreSenseContext(token, contextWindow, sense),
    originalIndex: idx,
  }));

  // Sort by score descending, then by original order (API order = frequency)
  scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  return scored.map(s => s.sense);
}

/**
 * Get the best matching sense for a word in context.
 *
 * @param {Object} token - The target word token
 * @param {Array} allTokens - All tokens in the text
 * @param {number} tokenIndex - Index of target token
 * @returns {Object|null} Best matching sense or null
 */
function getBestSense(token, allTokens, tokenIndex) {
  const ranked = rankSensesByContext(token, allTokens, tokenIndex);
  return ranked.length > 0 ? ranked[0] : null;
}

module.exports = {
  rankSensesByContext,
  getBestSense,
  scoreSenseContext,
  simplifyPos,
};

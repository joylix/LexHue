/**
 * Lemmatizer Service
 * English word lemmatization with rule-based suffix stripping + irregular form lookup.
 *
 * Strategy:
 * 1. Check lemma_map (irregular forms)
 * 2. Apply rule-based suffix stripping
 * 3. Check dictionary for resulting lemma
 */

const { getAll, getOne, run } = require('../database/connection');

// Cache for lemma map
let _lemmaMap = null;

async function getLemmaMap() {
  if (!_lemmaMap) {
    const rows = await getAll('SELECT inflected_form, lemma FROM lemma_map');
    _lemmaMap = new Map();
    for (const row of rows) {
      _lemmaMap.set(row.inflected_form.toLowerCase(), row.lemma);
    }
    console.log(`[LEMMA] Loaded ${_lemmaMap.size} lemma mappings from database`);
  }
  return _lemmaMap;
}

/**
 * Look up a word in the dictionary by lemma
 * Uses LRU cache to avoid repeated DB queries during batch processing
 */
const _dictCache = new Map();
const _dictCacheMaxSize = 50000;

async function lookupInDict(lemma) {
  const key = lemma.toLowerCase();
  if (_dictCache.has(key)) {
    return _dictCache.get(key);
  }
  const result = await getOne(
    'SELECT word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk, standard_level, collocations, example_sentences FROM dictionary WHERE lower(lemma) = lower($1)',
    [lemma]
  );
  if (_dictCache.size >= _dictCacheMaxSize) {
    // Evict oldest 25% entries
    const keysToDelete = Array.from(_dictCache.keys()).slice(0, Math.floor(_dictCacheMaxSize * 0.25));
    keysToDelete.forEach(k => _dictCache.delete(k));
  }
  _dictCache.set(key, result);
  return result;
}

/**
 * Rule-based suffix stripping for English words.
 * Returns array of candidate lemmas (most likely first).
 */
function ruleBasedStrip(word) {
  const w = word.toLowerCase();
  const candidates = [];

  // -ies → -y (e.g., carries → carry, cities → city)
  if (w.endsWith('ies') && w.length > 4) {
    candidates.push(w.slice(0, -3) + 'y');
  }

  // -ied → -y (e.g., carried → carry)
  if (w.endsWith('ied') && w.length > 4) {
    candidates.push(w.slice(0, -3) + 'y');
  }

  // -ying → -y (e.g., carrying → carry) — but also -ying → -ie (dying → die)
  if (w.endsWith('ying') && w.length > 5) {
    candidates.push(w.slice(0, -3) + 'y');
    candidates.push(w.slice(0, -3) + 'ie');
  }

  // -ing (e.g., running → run, making → make)
  if (w.endsWith('ing') && w.length > 4) {
    const base = w.slice(0, -3);
    candidates.push(base);           // making → mak (not great)
    candidates.push(base + 'e');     // making → make
    if (base.length > 2) {
      // doubled consonant: running → run
      const lastChar = base[base.length - 1];
      const secondLast = base[base.length - 2];
      if (lastChar === secondLast && !'aeiou'.includes(lastChar)) {
        candidates.push(base.slice(0, -1)); // running → run
      }
    }
  }

  // -ed (e.g., walked → walk, wanted → want)
  if (w.endsWith('ed') && w.length > 3) {
    const base = w.slice(0, -2);
    candidates.push(base);           // walked → walk
    candidates.push(base + 'e');     // hoped → hope
    if (base.length > 2) {
      const lastChar = base[base.length - 1];
      const secondLast = base[base.length - 2];
      if (lastChar === secondLast && !'aeiou'.includes(lastChar)) {
        candidates.push(base.slice(0, -1)); // stopped → stop
      }
    }
  }

  // -er (comparative: bigger → big, player → play)
  if (w.endsWith('er') && w.length > 3) {
    const base = w.slice(0, -2);
    candidates.push(base);
    candidates.push(base + 'e');
    if (base.length > 2) {
      const lastChar = base[base.length - 1];
      const secondLast = base[base.length - 2];
      if (lastChar === secondLast && !'aeiou'.includes(lastChar)) {
        candidates.push(base.slice(0, -1));
      }
    }
  }

  // -est (superlative: biggest → big)
  if (w.endsWith('est') && w.length > 4) {
    const base = w.slice(0, -3);
    candidates.push(base);
    candidates.push(base + 'e');
    if (base.length > 2) {
      const lastChar = base[base.length - 1];
      const secondLast = base[base.length - 2];
      if (lastChar === secondLast && !'aeiou'.includes(lastChar)) {
        candidates.push(base.slice(0, -1));
      }
    }
  }

  // -ly (adverb: quickly → quick, happily → happy)
  if (w.endsWith('ly') && w.length > 3) {
    const base = w.slice(0, -2);
    candidates.push(base);
    if (base.endsWith('i')) {
      candidates.push(base.slice(0, -1) + 'y'); // happily → happy
    }
  }

  // -ness (noun: happiness → happy)
  if (w.endsWith('ness') && w.length > 5) {
    const base = w.slice(0, -4);
    candidates.push(base);
    if (base.endsWith('i')) {
      candidates.push(base.slice(0, -1) + 'y');
    }
  }

  // -ment (noun: development → develop)
  if (w.endsWith('ment') && w.length > 5) {
    candidates.push(w.slice(0, -4));
  }

  // -tion/-sion (noun: action → act, decision → decide)
  if (w.endsWith('tion') && w.length > 5) {
    const base = w.slice(0, -4);
    candidates.push(base);
    candidates.push(base + 'e'); // creation → create
  }
  if (w.endsWith('sion') && w.length > 5) {
    const base = w.slice(0, -4);
    candidates.push(base);
    candidates.push(base + 'de'); // decision → decide
    candidates.push(base + 'te'); // conversion → convert
  }

  // -ity (noun: ability → able)
  if (w.endsWith('ity') && w.length > 4) {
    const base = w.slice(0, -3);
    candidates.push(base);
    candidates.push(base + 'e'); // ability → able
  }

  // -ful (adjective: beautiful → beauty — reverse is hard, skip)
  // -less (adjective: homeless → home)
  if (w.endsWith('less') && w.length > 5) {
    candidates.push(w.slice(0, -4));
  }

  // -es (boxes → box, watches → watch, buses → bus)
  if (w.endsWith('es') && w.length > 3) {
    const base = w.slice(0, -2);
    candidates.push(base);
    if (w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ses')) {
      candidates.push(w.slice(0, -1)); // buses → bus
    }
  }

  // -s (cats → cat)
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) {
    candidates.push(w.slice(0, -1));
  }

  return candidates;
}

/**
 * Try to find the lemma for a word.
 * Returns { lemma, dictEntry, method } or null.
 *
 * @param {string} word - The inflected word
 * @returns {{ lemma: string, dictEntry: object|null, method: string }|null}
 */
async function findLemma(word) {
  const lower = word.toLowerCase();

  // Step 0: Clean possessive forms before any processing
  let cleaned = lower;
  if (cleaned.endsWith("'s")) {
    cleaned = cleaned.slice(0, -2);
  } else if (cleaned.endsWith("s'")) {
    cleaned = cleaned.slice(0, -2) + 's';
  } else if (cleaned.endsWith("'")) {
    cleaned = cleaned.slice(0, -1);
  }

  const lemmaMap = await getLemmaMap();

  // Step 1: Check lemma_map first (irregular forms like went->go, children->child)
  const mapKey = lemmaMap.has(cleaned) ? cleaned : (lemmaMap.has(lower) ? lower : null);
  if (mapKey) {
    const lemma = lemmaMap.get(mapKey);
    const dictEntry = await lookupInDict(lemma);
    if (dictEntry) {
      return { lemma, dictEntry, method: 'lemma_map' };
    }
  }

  // Step 2: Check dictionary directly
  const directEntry = await lookupInDict(cleaned);
  if (directEntry) {
    return { lemma: cleaned, dictEntry: directEntry, method: 'direct' };
  }

  // Step 3: Also try original lower (in case it was cleaned incorrectly)
  if (cleaned !== lower) {
    const lowerDirectEntry = await lookupInDict(lower);
    if (lowerDirectEntry) {
      return { lemma: lower, dictEntry: lowerDirectEntry, method: 'direct' };
    }
  }

  // Step 4: Rule-based suffix stripping
  const candidates = ruleBasedStrip(cleaned);
  for (const candidate of candidates) {
    const dictEntry = await lookupInDict(candidate);
    if (dictEntry) {
      return { lemma: candidate, dictEntry, method: 'rule' };
    }
  }

  // Step 5: If no candidate found, return the first candidate with dictEntry=null
  if (candidates.length > 0) {
    return { lemma: candidates[0], dictEntry: null, method: 'rule_nodict' };
  }

  return null;
}

/**
 * Add a new word to the dictionary.
 * Returns the created entry.
 */
async function addWordToDict({ lemma, pos = null, translation = null, definition_en = null, standard_level = 5 }) {
  const id = lemma.toLowerCase();

  const existing = await getOne('SELECT word_id FROM dictionary WHERE word_id = $1', [id]);
  if (existing) {
    return await getOne('SELECT * FROM dictionary WHERE word_id = $1', [id]);
  }

  const sw = id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  // New user-added words get a high sort_order so they appear at the end
  const sortOrder = 999999;

  await run(
    `INSERT INTO dictionary
     (word_id, lemma, pos, sw, translation, definition_en, phonetic_us, phonetic_uk, standard_level, sort_order, collocations, example_sentences)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    [id, lemma, pos, sw, translation, definition_en, null, null, standard_level, sortOrder, '[]', '[]']
  );

  return await getOne('SELECT * FROM dictionary WHERE word_id = $1', [id]);
}

/**
 * Fetch word details from Free Dictionary API (https://dictionaryapi.dev/)
 * Returns structured data or null if not found.
 */
async function fetchFromFreeDictionary(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const entry = data[0];
    
    // Extract phonetic
    let phonetic = entry.phonetic || '';
    if (!phonetic && entry.phonetics && entry.phonetics.length > 0) {
      phonetic = entry.phonetics.find(p => p.text)?.text || '';
    }
    
    // Extract US/UK phonetics
    let phonetic_us = null, phonetic_uk = null;
    if (entry.phonetics) {
      for (const p of entry.phonetics) {
        if (p.text) {
          if (p.audio && p.audio.includes('-us')) phonetic_us = p.text;
          else if (p.audio && p.audio.includes('-uk')) phonetic_uk = p.text;
          else if (!phonetic_us && p.audio) phonetic_us = p.text;
        }
      }
    }
    
    // Extract ALL meanings grouped by POS
    // Each sense: { pos, definitions: [{definition, example, synonyms, antonyms}] }
    const allSenses = [];
    if (entry.meanings && entry.meanings.length > 0) {
      for (const meaning of entry.meanings) {
        const sense = {
          pos: meaning.partOfSpeech,
          definitions: [],
        };
        if (meaning.definitions) {
          for (const def of meaning.definitions) {
            sense.definitions.push({
              definition: def.definition || '',
              example: def.example || null,
              synonyms: def.synonyms || [],
              antonyms: def.antonyms || [],
            });
          }
        }
        allSenses.push(sense);
      }
    }

    // Determine the primary POS using a priority heuristic
    // Priority: verb > noun > adjective > adverb > pronoun > preposition > conjunction > other
    const posPriority = ['verb', 'noun', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'exclamation'];
    let primaryPos = null;
    let primaryDefinition = null;

    for (const priority of posPriority) {
      const sense = allSenses.find(s => s.pos === priority);
      if (sense && sense.definitions.length > 0) {
        primaryPos = sense.pos;
        primaryDefinition = sense.definitions[0].definition;
        break;
      }
    }

    // Fallback: use first available
    if (!primaryPos && allSenses.length > 0) {
      primaryPos = allSenses[0].pos;
      primaryDefinition = allSenses[0].definitions[0]?.definition || null;
    }

    // Build combined definition_en: primary first, then others
    const definitionParts = [];
    if (primaryDefinition) {
      definitionParts.push(primaryDefinition);
    }
    for (const sense of allSenses) {
      if (sense.pos !== primaryPos && sense.definitions.length > 0) {
        const def = sense.definitions[0].definition;
        if (def && !definitionParts.includes(def)) {
          definitionParts.push(`[${sense.pos}] ${def}`);
        }
      }
    }
    const combinedDefinition = definitionParts.join('; ') || null;

    // Extract example sentences (up to 3, from all senses)
    const exampleSentences = [];
    for (const sense of allSenses) {
      for (const def of sense.definitions) {
        if (def.example && exampleSentences.length < 3) {
          exampleSentences.push(def.example);
        }
      }
    }

    // Collect all unique POS tags
    const allPos = [...new Set(allSenses.map(s => s.pos).filter(Boolean))];

    return {
      word: entry.word,
      phonetic: phonetic || null,
      phonetic_us: phonetic_us || null,
      phonetic_uk: phonetic_uk || null,
      pos: primaryPos || null,
      all_pos: allPos,
      definition_en: combinedDefinition,
      primary_definition: primaryDefinition,
      example_sentences: exampleSentences.length > 0 ? exampleSentences : null,
    };
  } catch (e) {
    console.error('Free Dictionary API error:', e.message);
    return null;
  }
}

module.exports = {
  findLemma,
  addWordToDict,
  ruleBasedStrip,
  lookupInDict,
  getLemmaMap,
  fetchFromFreeDictionary,
};

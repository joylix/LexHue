/**
 * Lemma Helper Service
 * Utilities for managing lemma_map entries and generating inflected forms.
 */

const { run, transaction } = require('../database/connection');

/**
 * Add a single inflected_form → lemma mapping to the database lemma_map table.
 * Also updates the in-memory cache if loaded.
 */
async function addLemmaMapping(inflectedForm, lemma) {
  const lower = inflectedForm.toLowerCase();
  const lemmaLower = lemma.toLowerCase();

  // Don't map a word to itself
  if (lower === lemmaLower) return;

  await run('INSERT INTO lemma_map (inflected_form, lemma) VALUES ($1, $2) ON CONFLICT (inflected_form) DO NOTHING', [lower, lemmaLower]);
}

/**
 * Add multiple lemma mappings at once (transaction).
 */
async function addLemmaMappings(mappings) {
  await transaction(async (tx) => {
    for (const { inflected, lemma } of mappings) {
      if (inflected.toLowerCase() !== lemma.toLowerCase()) {
        await tx.run('INSERT INTO lemma_map (inflected_form, lemma) VALUES ($1, $2) ON CONFLICT (inflected_form) DO NOTHING', [inflected.toLowerCase(), lemma.toLowerCase()]);
      }
    }
  });
}

/**
 * Generate common English inflected forms for a lemma.
 * Returns an array of inflected forms.
 *
 * Handles:
 * - Regular verbs: work → works, worked, working
 * - -e verbs: create → creates, created, creating
 * - -y verbs: carry → carries, carried, carrying
 * - Doubled consonant: stop → stops, stopped, stopping
 * - Irregular patterns for common endings
 *
 * @param {string} lemma - The base form of the word
 * @returns {string[]} Array of inflected forms
 */
function generateInflectedForms(lemma) {
  const w = lemma.toLowerCase();
  const forms = new Set();

  // --- Verb forms ---

  // Third person singular: -s / -es
  if (w.endsWith('s') || w.endsWith('sh') || w.endsWith('ch') || w.endsWith('x') || w.endsWith('z') || w.endsWith('o')) {
    forms.add(w + 'es');      // watch → watches, go → goes
  } else if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2])) {
    forms.add(w.slice(0, -1) + 'ies');  // carry → carries, study → studies
  } else {
    forms.add(w + 's');       // work → works
  }

  // Past tense / past participle: -ed
  if (w.endsWith('e')) {
    forms.add(w + 'd');       // create → created, hope → hoped
  } else if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2])) {
    forms.add(w.slice(0, -1) + 'ied');  // carry → carried, study → studied
  } else if (w.length >= 3) {
    // Check for doubled consonant pattern: stop → stopped, plan → planned
    const lastChar = w[w.length - 1];
    const secondLast = w[w.length - 2];
    const thirdLast = w[w.length - 3];
    if (!'aeiou'.includes(lastChar) && 'aeiou'.includes(secondLast) && !'aeiouwxz'.includes(lastChar) && lastChar === lastChar) {
      // CVC pattern: double the last consonant
      if (w.length <= 6) { // Only for shorter words (stop, plan, drop, occur, refer, admit)
        forms.add(w + lastChar + 'ed');  // stop → stopped
      }
    }
    forms.add(w + 'ed');      // walk → walked, work → worked
  }

  // Present participle: -ing
  if (w.endsWith('ie')) {
    forms.add(w.slice(0, -2) + 'ying');  // die → dying, lie → lying
  } else if (w.endsWith('e') && !w.endsWith('ee') && !w.endsWith('ye') && !w.endsWith('oe')) {
    forms.add(w.slice(0, -1) + 'ing');   // create → making → making, hope → hoping
  } else if (w.length >= 3) {
    const lastChar = w[w.length - 1];
    const secondLast = w[w.length - 2];
    const thirdLast = w[w.length - 3];
    if (!'aeiou'.includes(lastChar) && 'aeiou'.includes(secondLast) && !'aeiouwxz'.includes(lastChar)) {
      if (w.length <= 6) {
        forms.add(w + lastChar + 'ing');  // run → running, stop → stopping
      }
    }
    forms.add(w + 'ing');     // work → working, play → playing
  }

  // --- Noun plural forms ---
  if (w.endsWith('s') || w.endsWith('sh') || w.endsWith('ch') || w.endsWith('x') || w.endsWith('z')) {
    forms.add(w + 'es');      // box → boxes, bus → buses
  } else if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2])) {
    forms.add(w.slice(0, -1) + 'ies');  // city → cities, baby → babies
  } else if (w.endsWith('f')) {
    forms.add(w.slice(0, -1) + 'ves');  // leaf → leaves, knife → knives
  } else if (w.endsWith('fe')) {
    forms.add(w.slice(0, -2) + 'ves');  // knife → knives
  } else {
    forms.add(w + 's');       // cat → cats, dog → dogs
  }

  // --- Adjective comparative / superlative ---
  if (w.endsWith('e')) {
    forms.add(w + 'r');       // nice → nicer
    forms.add(w + 'st');      // nice → nicest
  } else if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2])) {
    forms.add(w.slice(0, -1) + 'ier');  // happy → happier
    forms.add(w.slice(0, -1) + 'iest'); // happy → happiest
  } else if (w.length >= 3) {
    const lastChar = w[w.length - 1];
    const secondLast = w[w.length - 2];
    if (!'aeiou'.includes(lastChar) && 'aeiou'.includes(secondLast) && !'wxz'.includes(lastChar) && w.length <= 5) {
      forms.add(w + lastChar + 'er');   // big → bigger, hot → hotter
      forms.add(w + lastChar + 'est');  // big → biggest, hot → hottest
    } else {
      forms.add(w + 'er');      // tall → taller, fast → faster
      forms.add(w + 'est');     // tall → tallest, fast → fastest
    }
  }

  // Remove the lemma itself from forms (shouldn't be there, but safety check)
  forms.delete(w);

  return Array.from(forms);
}

/**
 * Convenience: given an original word and its resolved lemma,
 * auto-register the original word and generated inflected forms in lemma_map.
 *
 * @param {string} originalWord - The word as it appeared in text (e.g., "confirms")
 * @param {string} lemma - The resolved lemma (e.g., "confirm")
 */
async function autoRegisterInflections(originalWord, lemma) {
  const lower = originalWord.toLowerCase();
  const lemmaLower = lemma.toLowerCase();

  // Always map the original word itself
  const mappings = [{ inflected: lower, lemma: lemmaLower }];

  // Generate inflected forms from the lemma and map them all
  const forms = generateInflectedForms(lemmaLower);
  for (const form of forms) {
    if (form !== lower) {
      mappings.push({ inflected: form, lemma: lemmaLower });
    }
  }

  await addLemmaMappings(mappings);
}

module.exports = {
  addLemmaMapping,
  addLemmaMappings,
  generateInflectedForms,
  autoRegisterInflections,
};

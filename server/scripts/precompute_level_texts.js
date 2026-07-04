const fs = require('fs');
const path = require('path');
const { parse } = require('./services/textParser');
const { batchCalcStrangenessWithLevel } = require('./services/strangeness');

const texts = JSON.parse(fs.readFileSync(path.join(__dirname, 'database', 'seed', 'level_texts.json'), 'utf-8'));

const result = texts.map(t => {
  console.log('Processing L' + t.level + ': ' + t.title);
  const tokens = parse(t.content);
  const wordTokens = tokens.filter(tk => tk.is_word);
  const items = wordTokens.map(tk => ({
    word_id: tk.word_id || null,
    standard_level: tk.standard_level ?? null,
    is_phrase: !!tk.is_phrase_member,
  }));
  
  // 为每个等级计算陌生度
  const levels = {};
  for (let lv = 1; lv <= 10; lv++) {
    const results = batchCalcStrangenessWithLevel(items, lv);
    levels[lv] = results.map(r => r.strangeness);
  }
  
  return {
    level: t.level,
    text_id: t.text_id,
    title: t.title,
    content: t.content,
    tokens: tokens.map(tk => ({
      text: tk.text,
      is_word: tk.is_word,
      word_id: tk.word_id,
      lemma: tk.lemma,
      standard_level: tk.standard_level,
      start_char: tk.start_char,
      end_char: tk.end_char,
      is_phrase_member: tk.is_phrase_member,
      phrase_id: tk.phrase_id,
      phrase_text: tk.phrase_text,
    })),
    levels,
  };
});

fs.writeFileSync(
  path.join(__dirname, 'database', 'seed', 'level_texts_precomputed.json'),
  JSON.stringify(result, null, 2)
);

console.log('Done! Generated precomputed data for ' + result.length + ' texts.');

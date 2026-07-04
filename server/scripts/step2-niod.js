/**
 * Step 2: 用新牛津补充 COCA 词的数据
 * 只更新已在 dictionary 中的词（COCA 60000 的词）
 * 补充：translation, definition_en, phonetic, senses
 */
const fs = require('fs');
const db = require('better-sqlite3')('data/dictionary.db');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';

function main() {
  console.log('=== Step 2: Supplement with NIOD ===');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  const keys = Object.keys(niod);
  console.log('NIOD entries:', keys.length);

  const updateStmt = db.prepare(`
    UPDATE dictionary SET
      translation = COALESCE(?, translation),
      definition_en = COALESCE(?, definition_en),
      senses = COALESCE(?, senses)
    WHERE word_id = ?
  `);
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.translation, item.definition_en, item.senses, item.word_id);
    }
  });

  let updated = 0, noData = 0;
  const batch = [];

  for (const key of keys) {
    const word = key.toLowerCase();
    const entry = niod[key];
    
    // 只处理已在 dictionary 中的词
    const existing = db.prepare('SELECT word_id FROM dictionary WHERE word_id = ?').get(word);
    if (!existing) continue;

    if (!entry || Object.keys(entry).length === 0 || !entry.sub_definitions || entry.sub_definitions.length === 0) {
      noData++;
      continue;
    }

    // 构建 senses
    const senses = entry.sub_definitions.map(sd => ({
      pos: entry.parts_of_speech && entry.parts_of_speech.length > 0 ? entry.parts_of_speech[0] : null,
      translation: sd.chinese || null,
      definition_en: sd.english || null,
    }));

    // 取第一个 sub_definition 作为主 translation 和 definition_en
    const mainTranslation = entry.sub_definitions[0].chinese || null;
    const mainDef = entry.sub_definitions[0].english || null;

    batch.push({
      word_id: word,
      translation: mainTranslation,
      definition_en: mainDef,
      senses: JSON.stringify(senses),
    });
    updated++;

    if (batch.length >= 2000) {
      updateMany(batch);
      process.stdout.write(`\rUpdated: ${updated}, No data: ${noData}`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) updateMany(batch);

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);
  console.log(`No NIOD data: ${noData}`);
}

main();

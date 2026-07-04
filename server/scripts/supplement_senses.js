/**
 * 补充 senses 和例句（修正版）
 * 从新牛津提取 sub_definitions 作为 senses
 * 从新牛津提取 examples 作为例句
 */
const fs = require('fs');
const { getDictDb } = require('../database/connection');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';

function main() {
  console.log('=== Supplement senses & examples ===');
  const db = getDictDb();
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));

  // 获取所有需要补充的词（没有 senses 的）
  const allWords = db.prepare("SELECT word_id, senses FROM dictionary ORDER BY sort_order").all();
  console.log('Total words:', allWords.length);

  const sensesStmt = db.prepare('UPDATE dictionary SET senses = ?, example_sentences = ? WHERE word_id = ?');
  const sensesMany = db.transaction((items) => {
    for (const item of items) sensesStmt.run(item.senses, item.examples, item.word_id);
  });

  let sensesUpdated = 0, examplesUpdated = 0;
  const sensesBatch = [];

  for (const { word_id, senses } of allWords) {
    // 如果已有 senses，跳过
    if (senses && senses !== '[]' && senses !== 'null') continue;

    // 查找新牛津条目（先小写，再首字母大写）
    const niodEntry = niod[word_id] || niod[word_id.charAt(0).toUpperCase() + word_id.slice(1)];
    if (!niodEntry) continue;

    // 构建 senses（从 sub_definitions）
    let sensesJson = null;
    if (niodEntry.sub_definitions && niodEntry.sub_definitions.length > 0) {
      const sensesArr = niodEntry.sub_definitions.map(sd => ({
        pos: niodEntry.parts_of_speech && niodEntry.parts_of_speech.length > 0 ? niodEntry.parts_of_speech[0] : null,
        translation: sd.chinese || null,
        definition_en: sd.english || null,
      }));
      sensesJson = JSON.stringify(sensesArr);
    }

    // 提取例句（从 examples）
    let examplesJson = null;
    if (niodEntry.examples && niodEntry.examples.length > 0) {
      const examples = niodEntry.examples.map(ex => ex.english || '').filter(e => e).slice(0, 3);
      if (examples.length > 0) examplesJson = JSON.stringify(examples);
    }

    // 只有有数据才更新
    if (sensesJson || examplesJson) {
      sensesBatch.push({ word_id, senses: sensesJson, examples: examplesJson });
      sensesUpdated++;
      if (examplesJson) examplesUpdated++;

      if (sensesBatch.length >= 2000) {
        sensesMany(sensesBatch);
        process.stdout.write(`\rSenses: ${sensesUpdated}, Examples: ${examplesUpdated}`);
        sensesBatch.length = 0;
      }
    }
  }

  if (sensesBatch.length > 0) sensesMany(sensesBatch);

  console.log(`\nSenses updated: ${sensesUpdated}`);
  console.log(`Examples updated: ${examplesUpdated}`);

  // 最终统计
  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  const withSenses = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE senses IS NOT NULL AND senses != '[]' AND senses != 'null'").get().c;
  const withExamples = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE example_sentences IS NOT NULL AND example_sentences != '[]'").get().c;
  const withPhonetic = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE phonetic_us IS NOT NULL OR phonetic_uk IS NOT NULL').get().c;

  console.log(`\n=== Final Stats ===`);
  console.log(`Total: ${total}`);
  console.log(`With phonetic: ${withPhonetic} (${(100*withPhonetic/total).toFixed(1)}%)`);
  console.log(`With senses: ${withSenses} (${(100*withSenses/total).toFixed(1)}%)`);
  console.log(`With examples: ${withExamples} (${(100*withExamples/total).toFixed(1)}%)`);
}

main();

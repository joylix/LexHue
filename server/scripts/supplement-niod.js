/**
 * 新牛津英汉双解大词典 补充脚本
 * 解析新牛津 JSON → 补充 dictionary 表的 senses 字段
 *
 * 用法: node server/scripts/supplement-niod.js [--dry-run]
 */

const fs = require('fs');
const { getDictDb } = require('../database/connection');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';

function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('=== 新牛津英汉双解大词典 补充脚本 ===');
  console.log('Dry run:', dryRun);

  if (!fs.existsSync(NIOD_JSON)) {
    console.error('ERROR: File not found:', NIOD_JSON);
    process.exit(1);
  }

  const db = getDictDb();

  console.log('Loading NIOD JSON...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  const keys = Object.keys(niod);
  console.log('NIOD total entries:', keys.length);

  const updateStmt = db.prepare('UPDATE dictionary SET senses = ? WHERE word_id = ?');
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.senses, item.word);
    }
  });

  let updated = 0;
  let skippedNoContent = 0;
  let skippedNoMatch = 0;
  const batch = [];

  for (const key of keys) {
    const word = key.toLowerCase();
    const entry = niod[key];

    // 跳过空条目
    if (!entry || Object.keys(entry).length === 0) {
      skippedNoContent++;
      continue;
    }

    // 必须有 sub_definitions 才算有效
    if (!entry.sub_definitions || entry.sub_definitions.length === 0) {
      skippedNoContent++;
      continue;
    }

    // 构建 senses JSON
    const senses = [];

    // 每个 sub_definition 作为一个 sense
    for (const sd of entry.sub_definitions) {
      const sense = {
        pos: entry.parts_of_speech && entry.parts_of_speech.length > 0 ? entry.parts_of_speech[0] : null,
        translation: sd.chinese || null,
        definition_en: sd.english || null,
      };

      // 如果有例句，加到第一个 sense 上
      if (entry.examples && entry.examples.length > 0 && senses.length === 0) {
        sense.examples = entry.examples.map(ex => ({
          en: ex.english || '',
          cn: ex.chinese || '',
        }));
      }

      // 词源加到第一个 sense 上
      if (entry.etymology && senses.length === 0) {
        sense.etymology = entry.etymology;
      }

      senses.push(sense);
    }

    if (senses.length > 0) {
      batch.push({ word, senses: JSON.stringify(senses) });
      updated++;

      if (batch.length >= 2000) {
        if (!dryRun) updateMany(batch);
        process.stdout.write(`\rUpdated: ${updated}, Skipped (no content): ${skippedNoContent}`);
        batch.length = 0;
      }
    }
  }

  if (batch.length > 0 && !dryRun) {
    updateMany(batch);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no content): ${skippedNoContent}`);
  if (dryRun) console.log('(Dry run - no data written)');
}

main();

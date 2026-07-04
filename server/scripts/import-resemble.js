/**
 * Resemble Importer
 * 解析 ECDICT/resemble.txt → word_relation 表（近义词）
 *
 * 格式: % word1, word2, word3, ...
 *       释义文本...
 *
 * 用法: node server/scripts/import-resemble.js
 */

const fs = require('fs');
const path = require('path');
const { getDictDb } = require('../database/connection');

const RESEMBLE_TXT = '/home/joylix/projects/dict/ECDICT/resemble.txt';
const BATCH_SIZE = 5000;

function main() {
  console.log('=== Resemble Importer ===');

  if (!fs.existsSync(RESEMBLE_TXT)) {
    console.error('ERROR: File not found:', RESEMBLE_TXT);
    process.exit(1);
  }

  const db = getDictDb();

  // 先清空旧的 resemble 数据
  db.exec("DELETE FROM word_relation WHERE source = 'resemble'");
  console.log('Cleared old resemble data');

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO word_relation (word_id, relation_type, target_word_id, target_lemma, source) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item.word_id, item.relation_type, item.target_word_id, item.target_lemma, item.source);
    }
  });

  const content = fs.readFileSync(RESEMBLE_TXT, 'utf-8');
  const lines = content.split(/\r?\n/);

  let imported = 0;
  let batch = [];
  let currentWords = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 新的一组近义词
    if (trimmed.startsWith('%')) {
      // 处理上一组
      if (currentWords.length >= 2) {
        for (let i = 0; i < currentWords.length; i++) {
          for (let j = i + 1; j < currentWords.length; j++) {
            const w1 = currentWords[i].toLowerCase();
            const w2 = currentWords[j].toLowerCase();
            batch.push({
              word_id: w1,
              relation_type: 'synonym',
              target_word_id: w2,
              target_lemma: currentWords[j],
              source: 'resemble'
            });
            batch.push({
              word_id: w2,
              relation_type: 'synonym',
              target_word_id: w1,
              target_lemma: currentWords[i],
              source: 'resemble'
            });
            imported += 2;

            if (batch.length >= BATCH_SIZE) {
              insertMany(batch);
              process.stdout.write(`\rImported: ${imported}`);
              batch = [];
            }
          }
        }
      }

      // 解析新的一组词
      const wordsStr = trimmed.substring(1).trim();
      currentWords = wordsStr.split(',').map(w => w.trim()).filter(w => w && !w.startsWith('['));
    }
  }

  // 处理最后一组
  if (currentWords.length >= 2) {
    for (let i = 0; i < currentWords.length; i++) {
      for (let j = i + 1; j < currentWords.length; j++) {
        const w1 = currentWords[i].toLowerCase();
        const w2 = currentWords[j].toLowerCase();
        batch.push({
          word_id: w1,
          relation_type: 'synonym',
          target_word_id: w2,
          target_lemma: currentWords[j],
          source: 'resemble'
        });
        batch.push({
          word_id: w2,
          relation_type: 'synonym',
          target_word_id: w1,
          target_lemma: currentWords[i],
          source: 'resemble'
        });
        imported += 2;
      }
    }
  }

  if (batch.length > 0) {
    insertMany(batch);
  }

  console.log(`\n=== Done ===`);
  console.log(`Imported relations: ${imported}`);

  // 统计
  const stats = db.prepare("SELECT COUNT(*) as total FROM word_relation WHERE source = 'resemble'").get();
  console.log(`Total resemble relations: ${stats.total}`);
}

main();

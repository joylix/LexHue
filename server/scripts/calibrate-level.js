/**
 * COCA 60000 Level Calibrator
 * 读取 COCA 60000 CSV → 更新 dictionary 表的 standard_level
 *
 * 用法: node server/scripts/calibrate-level.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';

// 基于 COCA rank 的 standard_level 分级
function calcStandardLevel(rank) {
  if (!rank || rank <= 0) return 9;
  if (rank <= 500) return 0;
  if (rank <= 1000) return 1;
  if (rank <= 2000) return 2;
  if (rank <= 3000) return 3;
  if (rank <= 5000) return 4;
  if (rank <= 8000) return 5;
  if (rank <= 12000) return 6;
  if (rank <= 20000) return 7;
  if (rank <= 50000) return 8;
  return 9;
}

async function main() {
  console.log('=== COCA 60000 Level Calibrator ===');

  if (!fs.existsSync(COCA_CSV)) {
    console.error('ERROR: File not found:', COCA_CSV);
    process.exit(1);
  }

  const db = getDictDb();

  // 构建 COCA rank 映射
  const fileStream = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const cocaRanks = new Map(); // word -> best rank
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',');
    if (parts.length < 4) continue;
    const rank = parseInt(parts[0].trim());
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (!word || !rank) continue;

    if (!cocaRanks.has(word) || rank < cocaRanks.get(word)) {
      cocaRanks.set(word, rank);
    }
  }

  console.log('COCA unique words:', cocaRanks.size);

  // 更新 dictionary 表中已有的词
  const updateStmt = db.prepare('UPDATE dictionary SET standard_level = ?, static_frequency = ? WHERE word_id = ?');
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.level, item.rank, item.word);
    }
  });

  let updated = 0;
  let notFound = 0;
  const batch = [];

  for (const [word, rank] of cocaRanks) {
    const level = calcStandardLevel(rank);
    batch.push({ word, rank, level });
    updated++;

    if (batch.length >= 5000) {
      updateMany(batch);
      process.stdout.write(`\rUpdated: ${updated}`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    updateMany(batch);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);

  // 统计 standard_level 分布
  const dist = db.prepare('SELECT standard_level, COUNT(*) as cnt FROM dictionary GROUP BY standard_level ORDER BY standard_level').all();
  console.log('\nStandard level distribution:');
  for (const row of dist) {
    console.log(`  Level ${row.standard_level}: ${row.cnt}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

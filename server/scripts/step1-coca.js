/**
 * Step 1: 导入 COCA 60000 作为主词表
 * 写入 word_id, lemma, pos, static_frequency, standard_level
 * 过滤掉带括号的词
 */
const fs = require('fs');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';

// POS 映射
const POS_MAP = {
  'A': 'article', 'V': 'verb', 'C': 'conjunction', 'I': 'preposition',
  'T': 'to', 'P': 'pronoun', 'D': 'determiner', 'X': 'other',
  'R': 'adverb', 'M': 'modal', 'N': 'noun', 'E': 'existential',
  'J': 'adjective', 'U': 'interjection',
};

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
  console.log('=== Step 1: Import COCA 60000 ===');
  const db = getDictDb();

  const fileStream = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO dictionary
    (word_id, lemma, pos, static_frequency, standard_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      insertStmt.run(e.word_id, e.lemma, e.pos, e.static_frequency, e.standard_level);
    }
  });

  let imported = 0, skipped = 0;
  const batch = [];
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',');
    if (parts.length < 4) continue;

    const rank = parseInt(parts[0].trim());
    const posAbbr = parts[1].trim();
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();

    if (!word || !rank) continue;

    // 过滤带括号的词
    if (word.startsWith('(') || word.endsWith(')')) {
      skipped++;
      continue;
    }

    const pos = POS_MAP[posAbbr] || null;
    const level = calcStandardLevel(rank);

    batch.push({ word_id: word, lemma: word, pos, static_frequency: rank, standard_level: level });
    imported++;

    if (batch.length >= 5000) {
      insertMany(batch);
      process.stdout.write(`\rImported: ${imported}, Skipped (paren): ${skipped}`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) insertMany(batch);

  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (parenthesized): ${skipped}`);

  // 验证
  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  console.log('Total entries:', total);
  const dist = db.prepare('SELECT standard_level, COUNT(*) cnt FROM dictionary GROUP BY standard_level ORDER BY standard_level').all();
  console.log('Level distribution:');
  for (const r of dist) console.log('  Level ' + r.standard_level + ': ' + r.cnt);
}

main().catch(err => { console.error(err); process.exit(1); });

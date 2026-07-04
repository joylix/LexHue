/**
 * COCA 60000 Importer
 * 导入 coca60000.csv → dictionary.db
 *
 * 用法: node server/scripts/import-coca.js
 *
 * CSV 格式: RANK #, PoS, word, TOTAL
 * 词性映射: A=article, V=verb, C=conjunction, I=preposition, P=pronoun,
 *          N=noun, R=adverb, J=adjective, U=interjection, M=modal,
 *          D=determiner, T=to, X=other, E=existential
 */

const fs = require('fs');
const path = require('path');
const { getDictDb } = require('../database/connection');

const COCA_CSV = path.join(__dirname, '..', '..', 'coca60000.csv');
const BATCH_SIZE = 5000;

// PoS 映射: COCA 缩写 → 标准词性
const POS_MAP = {
  A: 'article',
  V: 'verb',
  C: 'conjunction',
  I: 'preposition',
  P: 'pronoun',
  N: 'noun',
  R: 'adverb',
  J: 'adjective',
  U: 'interjection',
  M: 'modal',
  D: 'determiner',
  T: 'to',
  X: 'other',
  E: 'existential',
};

// 基于 COCA rank 的 standard_level 分级
// Level 0: 1-500 (最核心)
// Level 1: 501-1000
// Level 2: 1001-2000
// Level 3: 2001-3000
// Level 4: 3001-5000
// Level 5: 5001-8000
// Level 6: 8001-12000
// Level 7: 12001-20000
// Level 8: 20001-40000
// Level 9: 40001-60000
function calcStandardLevel(rank) {
  if (rank <= 500) return 0;
  if (rank <= 1000) return 1;
  if (rank <= 2000) return 2;
  if (rank <= 3000) return 3;
  if (rank <= 5000) return 4;
  if (rank <= 8000) return 5;
  if (rank <= 12000) return 6;
  if (rank <= 20000) return 7;
  if (rank <= 40000) return 8;
  return 9;
}

function main() {
  console.log('=== COCA 60000 Importer ===');

  if (!fs.existsSync(COCA_CSV)) {
    console.error('ERROR: File not found:', COCA_CSV);
    process.exit(1);
  }

  const db = getDictDb();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO dictionary
    (word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk,
     static_frequency, standard_level, collocations, example_sentences, senses,
     exchange, extra, coca_rank, bnc_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      insertStmt.run(
        e.word_id, e.lemma, e.pos, e.translation, e.definition_en,
        e.phonetic_us, e.phonetic_uk, e.static_frequency, e.standard_level,
        e.collocations, e.example_sentences, e.senses,
        e.exchange, e.extra, e.coca_rank, e.bnc_rank
      );
    }
  });

  // 读取 CSV
  const content = fs.readFileSync(COCA_CSV, 'utf-8');
  const lines = content.split(/\r?\n/);
  console.log('Total lines:', lines.length);

  let imported = 0;
  let batch = [];
  const startTime = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 解析 CSV（简单分割，注意 word 字段可能有逗号）
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const rank = parseInt(parts[0].trim());

    // 正则匹配：数字, 空格, PoS, 空格, 逗号, 空格, word, 逗号, total
    // 格式: "1, A ,  the,23782115"
    const match = line.match(/^\d+\s*,\s*([A-Z])\s*,\s*(.+?)\s*,\s*(\d+)\s*$/);
    if (!match) continue;

    const posAbbr = match[1];
    const word = match[2].trim().toLowerCase();
    const total = parseInt(match[3]);

    if (!word || word.length === 0) continue;

    const pos = POS_MAP[posAbbr] || posAbbr.toLowerCase();
    const standardLevel = calcStandardLevel(rank);

    batch.push({
      word_id: word,
      lemma: word,
      pos: pos,
      translation: null,
      definition_en: null,
      phonetic_us: null,
      phonetic_uk: null,
      static_frequency: total,
      standard_level: standardLevel,
      collocations: '[]',
      example_sentences: '[]',
      senses: null,
      exchange: null,
      extra: JSON.stringify({ pos_abbr: posAbbr }),
      coca_rank: rank,
      bnc_rank: 0,
    });

    imported++;

    if (batch.length >= BATCH_SIZE) {
      insertMany(batch);
      process.stdout.write(`\rImported: ${imported}`);
      batch = [];
    }
  }

  // 写入剩余
  if (batch.length > 0) {
    insertMany(batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Time: ${elapsed}s`);
}

main();

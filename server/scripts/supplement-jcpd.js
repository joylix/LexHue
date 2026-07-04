/**
 * 金山词霸2006 音标补充脚本
 * 解析金山词霸 JSON → 补充 dictionary 表的 phonetic_us / phonetic_uk
 *
 * 用法: node server/scripts/supplement-jcpd.js [--dry-run]
 */

const fs = require('fs');
const { getDictDb } = require('../database/connection');

const JCPD_JSON = '/home/joylix/projects/dict/金山词霸2006美国传统词典双解.json';

// 从金山词霸 HTML 中提取 DJ/KK 音标
function extractPhonetic(html, type) {
  if (!html) return null;
  // DJ 音标格式: D.J.[<font ...>xxxxxxxx</font>]
  // KK 音标格式: K.K.[<font ...>xxxxxxxx</font>]
  const pattern = type === 'dj'
    ? /D\.J\.\[<[^>]+>([^<]+)<\/font>\]/
    : /K\.K\.\[<[^>]+>([^<]+)<\/font>\]/;
  const match = html.match(pattern);
  return match ? '/' + match[1] + '/' : null;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('=== 金山词霸2006 音标补充脚本 ===');
  console.log('Dry run:', dryRun);

  if (!fs.existsSync(JCPD_JSON)) {
    console.error('ERROR: File not found:', JCPD_JSON);
    process.exit(1);
  }

  const db = getDictDb();

  console.log('Loading JCPD JSON...');
  const jcpd = JSON.parse(fs.readFileSync(JCPD_JSON, 'utf-8'));
  const entries = jcpd.entries || jcpd;
  console.log('JCPD total entries:', entries.length);

  const updateStmt = db.prepare(
    'UPDATE dictionary SET phonetic_us = COALESCE(?, phonetic_us), phonetic_uk = COALESCE(?, phonetic_uk) WHERE word_id = ?'
  );
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.phonetic_us, item.phonetic_uk, item.word);
    }
  });

  let updated = 0;
  let skipped = 0;
  const batch = [];

  for (const entry of entries) {
    if (!entry.word || !entry.definition) {
      skipped++;
      continue;
    }

    const word = entry.word.toLowerCase();
    const phonetic_us = extractPhonetic(entry.definition, 'dj');
    const phonetic_uk = extractPhonetic(entry.definition, 'kk');

    // 只有至少有一个音标才更新
    if (phonetic_us || phonetic_uk) {
      batch.push({ word, phonetic_us, phonetic_uk });
      updated++;

      if (batch.length >= 2000) {
        if (!dryRun) updateMany(batch);
        process.stdout.write(`\rUpdated: ${updated}, Skipped: ${skipped}`);
        batch.length = 0;
      }
    } else {
      skipped++;
    }
  }

  if (batch.length > 0 && !dryRun) {
    updateMany(batch);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  if (dryRun) console.log('(Dry run - no data written)');
}

main();

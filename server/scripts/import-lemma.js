/**
 * Lemma Map Importer
 * 导入 ECDICT/lemma.en.txt → lemma_map 表
 *
 * 格式: lemma/count -> form1,form2,form3,...
 * 例: be/4109826 -> is,was,are,were,'s,been,being,'re,'m,am,m
 *
 * 用法: node server/scripts/import-lemma.js
 */

const fs = require('fs');
const path = require('path');
const { getDictDb } = require('../database/connection');

const LEMMA_TXT = '/home/joylix/projects/dict/ECDICT/lemma.en.txt';
const BATCH_SIZE = 5000;

function main() {
  console.log('=== Lemma Map Importer ===');

  if (!fs.existsSync(LEMMA_TXT)) {
    console.error('ERROR: File not found:', LEMMA_TXT);
    process.exit(1);
  }

  const db = getDictDb();

  // 先清空旧的 lemma_map
  db.exec('DELETE FROM lemma_map');
  console.log('Cleared old lemma_map data');

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO lemma_map (inflected_form, lemma) VALUES (?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item.inflected, item.lemma);
    }
  });

  const content = fs.readFileSync(LEMMA_TXT, 'utf-8');
  const lines = content.split('\n');

  let imported = 0;
  let batch = [];
  const startTime = Date.now();

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith(';')) continue;

    // 解析格式: lemma/count -> form1,form2,...
    const arrowIdx = trimmed.indexOf('->');
    if (arrowIdx < 0) continue;

    const left = trimmed.substring(0, arrowIdx).trim();
    const right = trimmed.substring(arrowIdx + 2).trim();

    // 提取 lemma（去掉 /count 部分）
    const slashIdx = left.indexOf('/');
    const lemma = (slashIdx >= 0 ? left.substring(0, slashIdx) : left).toLowerCase();

    if (!lemma) continue;

    // 分割变形形式
    const forms = right.split(',').map(f => f.trim().toLowerCase()).filter(f => f && f !== lemma);

    for (const form of forms) {
      batch.push({ inflected: form, lemma });
      imported++;

      if (batch.length >= BATCH_SIZE) {
        insertMany(batch);
        process.stdout.write(`\rImported: ${imported}`);
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    insertMany(batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done ===`);
  console.log(`Imported mappings: ${imported}`);
  console.log(`Time: ${elapsed}s`);

  // 统计
  const stats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT lemma) as lemmas FROM lemma_map').get();
  console.log(`Total mappings: ${stats.total}, Unique lemmas: ${stats.lemmas}`);
}

main();

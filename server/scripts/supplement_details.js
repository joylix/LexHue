/**
 * 补充音标、senses 和例句
 * 
 * 优先级：
 * - 音标：ECDICT > 新世纪
 * - senses：新牛津（中英双解 + 例句）
 * - 例句：新牛津
 */
const fs = require('fs');
const { getDictDb } = require('../database/connection');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const XSJ_JSON = '/home/joylix/projects/dict/新世纪英汉大词典.json';
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';

function parseCSVLine(line) {
  const fields = []; let current = ''; let inQuote = false;
  for (const ch of line) {
    if (inQuote) { if (ch === '"') inQuote = false; else current += ch; }
    else { if (ch === '"') inQuote = true; else if (ch === ',') { fields.push(current); current = ''; } else current += ch; }
  }
  fields.push(current);
  return fields;
}

async function main() {
  const db = getDictDb();
  const startTime = Date.now();

  // 加载数据源
  console.log('Loading dictionaries...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  const xsjj = JSON.parse(fs.readFileSync(XSJ_JSON, 'utf-8'));

  // 扫描 ECDICT 获取音标
  console.log('Scanning ECDICT for phonetics...');
  const ecdictPhonetics = new Map();
  const ecdictStream = fs.createReadStream(ECDICT_CSV, { encoding: 'utf-8' });
  const ecdictLines = (await new Promise(resolve => {
    const data = [];
    ecdictStream.on('data', chunk => data.push(chunk));
    ecdictStream.on('end', () => resolve(data.join('').split(/\r?\n/)));
  }));

  let ecdictCurrent = null;
  for (let i = 1; i < ecdictLines.length; i++) {
    const line = ecdictLines[i];
    if (ecdictCurrent && !line.match(/^["']?[a-zA-Z'-]/)) { ecdictCurrent += '\n' + line; continue; }
    if (ecdictCurrent) {
      const fields = parseCSVLine(ecdictCurrent);
      if (fields.length >= 2) {
        const w = fields[0].trim().toLowerCase();
        const phonetic = fields[1].trim();
        if (phonetic && !ecdictPhonetics.has(w)) ecdictPhonetics.set(w, phonetic);
      }
    }
    ecdictCurrent = line;
  }
  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 2) {
      const w = fields[0].trim().toLowerCase();
      const phonetic = fields[1].trim();
      if (phonetic && !ecdictPhonetics.has(w)) ecdictPhonetics.set(w, phonetic);
    }
  }
  console.log('ECDICT phonetics:', ecdictPhonetics.size);

  // 获取所有需要补充的词
  const allWords = db.prepare('SELECT word_id, phonetic_us, phonetic_uk, senses FROM dictionary ORDER BY sort_order').all();
  console.log('Total words:', allWords.length);

  // 补充音标
  console.log('\n=== Supplementing phonetics ===');
  const phoneticStmt = db.prepare('UPDATE dictionary SET phonetic_us = ?, phonetic_uk = ? WHERE word_id = ?');
  const phoneticMany = db.transaction((items) => {
    for (const item of items) phoneticStmt.run(item.us, item.uk, item.word_id);
  });

  let phoneticUpdated = 0;
  const phoneticBatch = [];

  for (const { word_id, phonetic_us, phonetic_uk } of allWords) {
    // 如果已有音标，跳过
    if (phonetic_us && phonetic_uk) continue;

    let us = phonetic_us, uk = phonetic_uk;

    // 从 ECDICT 获取
    if (!us || !uk) {
      const ep = ecdictPhonetics.get(word_id);
      if (ep) {
        // ECDICT 音标格式：/wɒtʃ/ 或 /wɒtʃ/ /wɑːtʃ/
        const parts = ep.split(/\s+\/\s*/).filter(p => p.startsWith('/'));
        if (parts.length >= 2 && !us) us = parts[0];
        if (parts.length >= 2 && !uk) uk = parts[1];
        else if (parts.length === 1 && !us) us = parts[0];
        else if (!us) us = ep;
      }
    }

    // 从新世纪获取
    if (!us || !uk) {
      const xp = xsjj[word_id];
      if (xp && xp.pronunciation) {
        // 新世纪音标格式：/wɒtʃ/ 或 /wɒtʃ/ /wɑːtʃ/
        const pron = xp.pronunciation;
        const match = pron.match(/\/([^/]+)\//);
        if (match && !us) us = '/' + match[1] + '/';
      }
    }

    if (us || uk) {
      phoneticBatch.push({ word_id, us: us || null, uk: uk || null });
      phoneticUpdated++;
      if (phoneticBatch.length >= 2000) {
        phoneticMany(phoneticBatch);
        process.stdout.write(`\rPhonetics: ${phoneticUpdated}`);
        phoneticBatch.length = 0;
      }
    }
  }
  if (phoneticBatch.length > 0) phoneticMany(phoneticBatch);
  console.log(`\nPhonetics updated: ${phoneticUpdated}`);

  // 补充 senses 和例句
  console.log('\n=== Supplementing senses & examples ===');
  const sensesStmt = db.prepare('UPDATE dictionary SET senses = ?, example_sentences = ? WHERE word_id = ?');
  const sensesMany = db.transaction((items) => {
    for (const item of items) sensesStmt.run(item.senses, item.examples, item.word_id);
  });

  let sensesUpdated = 0, examplesUpdated = 0;
  const sensesBatch = [];

  for (const { word_id, senses } of allWords) {
    // 如果已有 senses，跳过
    if (senses && senses !== '[]' && senses !== 'null') continue;

    const niodEntry = niod[word_id] || niod[word_id.charAt(0).toUpperCase() + word_id.slice(1)];
    if (!niodEntry || !niodEntry.sub_definitions || niodEntry.sub_definitions.length === 0) continue;

    // 构建 senses
    const sensesArr = niodEntry.sub_definitions.map(sd => ({
      pos: niodEntry.penses_of_speech && niodEntry.parts_of_speech.length > 0 ? niodEntry.parts_of_speech[0] : null,
      translation: sd.chinese || null,
      definition_en: sd.english || null,
    }));

    // 提取例句（从所有 sub_definitions 中收集）
    const examples = [];
    if (niodEntry.examples) {
      for (const ex of niodEntry.examples) {
        if (ex.english) examples.push(ex.english);
        if (examples.length >= 3) break;
      }
    }

    sensesBatch.push({
      word_id,
      senses: JSON.stringify(sensesArr),
      examples: examples.length > 0 ? JSON.stringify(examples) : null,
    });
    sensesUpdated++;
    if (examples.length > 0) examplesUpdated++;

    if (sensesBatch.length >= 2000) {
      sensesMany(sensesBatch);
      process.stdout.write(`\rSenses: ${sensesUpdated}, Examples: ${examplesUpdated}`);
      sensesBatch.length = 0;
    }
  }
  if (sensesBatch.length > 0) sensesMany(sensesBatch);
  console.log(`\nSenses updated: ${sensesUpdated}`);
  console.log(`Examples updated: ${examplesUpdated}`);

  // 最终统计
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  const withPhonetic = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE phonetic_us IS NOT NULL OR phonetic_uk IS NOT NULL').get().c;
  const withSenses = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE senses IS NOT NULL AND senses != '[]' AND senses != 'null'").get().c;
  const withExamples = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE example_sentences IS NOT NULL AND example_sentences != '[]'").get().c;

  console.log(`\n========================================`);
  console.log(`=== Supplement Complete (${elapsed}s) ===`);
  console.log(`========================================`);
  console.log(`Total entries: ${total}`);
  console.log(`With phonetic: ${withPhonetic} (${(100*withPhonetic/total).toFixed(1)}%)`);
  console.log(`With senses: ${withSenses} (${(100*withSenses/total).toFixed(1)}%)`);
  console.log(`With examples: ${withExamples} (${(100*withExamples/total).toFixed(1)}%)`);
}

main().catch(err => { console.error(err); process.exit(1); });

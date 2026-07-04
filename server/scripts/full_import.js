/**
 * 完整导入脚本 - 从零开始
 * 
 * 执行顺序：
 * 1. COCA 60000（主词表）
 * 2. ECDICT 牛津词（补充）
 * 3. ECDICT 非牛津词（补充）
 * 4. 补充详细信息
 * 5. lemma_map
 * 6. word_relation
 */
const fs = require('fs');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';
const ECDICT_MARKED = '/home/joylix/projects/dict/ecdict_marked.csv';
const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const XSJ_JSON = '/home/joylix/projects/dict/新世纪英汉大词典.json';
const LEMMA_TXT = '/home/joylix/projects/dict/ECDICT/lemma.en.txt';
const RESEMBLE_TXT = '/home/joylix/projects/dict/ECDICT/resemble.txt';

// POS 映射
const POS_MAP = {
  'A': 'article', 'V': 'verb', 'C': 'conjunction', 'I': 'preposition',
  'T': 'to', 'P': 'pronoun', 'D': 'determiner', 'X': 'other',
  'R': 'adverb', 'M': 'modal', 'N': 'noun', 'E': 'existential',
  'J': 'adjective', 'U': 'interjection',
};

function calcSW(word) { return word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }
function calcLevel(rank) {
  if (!rank || rank <= 0) return 9;
  if (rank <= 500) return 0; if (rank <= 1000) return 1;
  if (rank <= 2000) return 2; if (rank <= 3000) return 3;
  if (rank <= 5000) return 4; if (rank <= 8000) return 5;
  if (rank <= 12000) return 6; if (rank <= 20000) return 7;
  if (rank <= 50000) return 8; return 9;
}

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

  // ========================================
  // 步骤 1: 导入 COCA 60000
  // ========================================
  console.log('\n=== Step 1: Import COCA 60000 ===');
  
  const cocaStream = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const cocaRl = readline.createInterface({ input: cocaStream, crlfDelay: Infinity });

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO dictionary
    (word_id, lemma, pos, sw, static_frequency, standard_level, sort_order, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'coca')
  `);
  const insertMany = db.transaction((entries) => {
    for (const e of entries) insertStmt.run(e.word_id, e.lemma, e.pos, e.sw, e.sf, e.sl, e.so);
  });

  let cocaCount = 0;
  const batch = [];
  let lineNum = 0;

  for await (const line of cocaRl) {
    lineNum++;
    if (lineNum === 1) continue;
    const parts = line.trim().split(',');
    if (parts.length < 4) continue;
    const rank = parseInt(parts[0].trim());
    const posAbbr = parts[1].trim();
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (!word || !rank) continue;
    if (word.startsWith('(') || word.endsWith(')')) continue;

    batch.push({ word_id: word, lemma: word, pos: POS_MAP[posAbbr] || null, sw: calcSW(word), sf: rank, sl: calcLevel(rank), so: rank });
    cocaCount++;
    if (batch.length >= 5000) { insertMany(batch); process.stdout.write(`\rCOCA: ${cocaCount}`); batch.length = 0; }
  }
  if (batch.length > 0) insertMany(batch);
  console.log(`\nCOCA imported: ${cocaCount}`);

  // ========================================
  // 步骤 2: 导入 ECDICT 牛津词
  // ========================================
  console.log('\n=== Step 2: Import ECDICT (Oxford) ===');
  
  const markedStream = fs.createReadStream(ECDICT_MARKED, { encoding: 'utf-8' });
  const markedRl = readline.createInterface({ input: markedStream, crlfDelay: Infinity });

  let oxfordCount = 0, otherCount = 0;
  const oxfordBatch = [];
  const otherBatch = [];
  let markedLineNum = 0;

  for await (const line of markedRl) {
    markedLineNum++;
    if (markedLineNum === 1) continue;
    const parts = line.trim().split(',');
    if (parts.length < 7) continue;
    const word = parts[0].replace(/^"|"$/g, '').toLowerCase();
    const inOxford = parseInt(parts[1]) || 0;
    const pos = parts[4] || null;
    const bnc = parseInt(parts[5]) || 0;
    const frq = parseInt(parts[6]) || 0;

    if (db.prepare('SELECT word_id FROM dictionary WHERE word_id = ?').get(word)) continue;

    const freq = bnc || frq;
    const level = calcLevel(freq);
    const sw = calcSW(word);

    if (inOxford) {
      oxfordBatch.push({ word_id: word, lemma: word, pos, sw, sf: freq, sl: level, so: 100000 + (freq || 999999) });
      oxfordCount++;
      if (oxfordBatch.length >= 2000) { insertMany(oxfordBatch); process.stdout.write(`\rOxford: ${oxfordCount}`); oxfordBatch.length = 0; }
    } else {
      otherBatch.push({ word_id: word, lemma: word, pos, sw, sf: freq, sl: level, so: 200000 + (freq || 999999) });
      otherCount++;
      if (otherBatch.length >= 2000) { insertMany(otherBatch); process.stdout.write(`\rOther: ${otherCount}`); otherBatch.length = 0; }
    }
  }
  if (oxfordBatch.length > 0) insertMany(oxfordBatch);
  if (otherBatch.length > 0) insertMany(otherBatch);
  console.log(`\nECDICT Oxford: ${oxfordCount}, Other: ${otherCount}`);

  // ========================================
  // 步骤 3: 补充详细信息
  // ========================================
  console.log('\n=== Step 3: Supplement details ===');

  // 加载数据源
  console.log('Loading NIOD...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  console.log('Loading XSJ...');
  const xsjj = JSON.parse(fs.readFileSync(XSJ_JSON, 'utf-8'));

  // 扫描 ECDICT 获取详细数据
  console.log('Scanning ECDICT for details...');
  const ecdictData = new Map();
  const ecdictStream = fs.createReadStream('/home/joylix/projects/dict/ECDICT/ecdict.csv', { encoding: 'utf-8' });
  const ecdictRl = readline.createInterface({ input: ecdictStream, crlfDelay: Infinity });
  let ecdictLineNum = 0;
  let ecdictCurrent = null;
  for await (const line of ecdictRl) {
    ecdictLineNum++;
    if (ecdictLineNum === 1) continue;
    if (ecdictCurrent && !line.match(/^["']?[a-zA-Z'-]/)) { ecdictCurrent += '\n' + line; continue; }
    if (ecdictCurrent) {
      const fields = parseCSVLine(ecdictCurrent);
      if (fields.length >= 10) {
        const w = fields[0].trim().toLowerCase();
        if (!ecdictData.has(w)) {
          ecdictData.set(w, {
            phonetic: fields[1].trim() || null,
            definition: fields[2].trim() || null,
            translation: fields[3].trim() || null,
            pos: fields[4].trim() || null,
            collins: fields[5] ? fields[5].trim() || null : null,
            oxford: fields[6] ? fields[6].trim() || null : null,
            exchange: fields[10] ? fields[10].trim() : null,
          });
        }
      }
    }
    ecdictCurrent = line;
  }
  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 10) {
      const w = fields[0].trim().toLowerCase();
      if (!ecdictData.has(w)) {
        ecdictData.set(w, {
          phonetic: fields[1].trim() || null, definition: fields[2].trim() || null,
          translation: fields[3].trim() || null, pos: fields[4].trim() || null,
          collins: fields[5] ? fields[5].trim() || null : null,
          oxford: fields[6] ? fields[6].trim() || null : null,
          exchange: fields[10] ? fields[10].trim() : null,
        });
      }
    }
  }
  console.log('ECDICT details loaded:', ecdictData.size);

  // 更新所有词的详细信息
  const allWords = db.prepare('SELECT word_id FROM dictionary ORDER BY sort_order').all();
  const updateStmt = db.prepare(`
    UPDATE dictionary SET
      translation = COALESCE(?, translation),
      definition_en = COALESCE(?, definition_en),
      phonetic_us = COALESCE(?, phonetic_us),
      phonetic_uk = COALESCE(?, phonetic_uk),
      pos = COALESCE(?, pos),
      exchange = COALESCE(?, exchange),
      senses = COALESCE(?, senses),
      extra = COALESCE(?, extra)
    WHERE word_id = ?
  `);
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.translation, item.definition_en, item.phonetic_us, item.phonetic_uk, item.pos, item.exchange, item.senses, item.extra, item.word_id);
    }
  });

  let updated = 0;
  const updateBatch = [];

  for (const { word_id } of allWords) {
    const ecdict = ecdictData.get(word_id);
    const niodEntry = niod[word_id] || niod[word_id.charAt(0).toUpperCase() + word_id.slice(1)];
    const xsjjEntry = xsjj[word_id];

    let translation = null, definition_en = null, phonetic_us = null, phonetic_uk = null;
    let pos = null, exchange = null, senses = null, extra = null;

    // ECDICT 数据
    if (ecdict) {
      translation = ecdict.translation;
      definition_en = ecdict.definition;
      phonetic_us = ecdict.phonetic;
      pos = ecdict.pos;
      exchange = ecdict.exchange;
      const extraObj = {};
      if (ecdict.collins) extraObj.collins = ecdict.collins;
      if (ecdict.oxford) extraObj.oxford = ecdict.oxford;
      if (Object.keys(extraObj).length > 0) extra = JSON.stringify(extraObj);
    }

    // 新牛津补充
    if (niodEntry && niodEntry.sub_definitions && niodEntry.sub_definitions.length > 0) {
      const niodSenses = niodEntry.sub_definitions.map(sd => ({
        pos: niodEntry.parts_of_speech && niodEntry.parts_of_speech.length > 0 ? niodEntry.parts_of_speech[0] : null,
        translation: sd.chinese || null,
        definition_en: sd.english || null,
      }));
      senses = JSON.stringify(niodSenses);
      if (!definition_en && niodEntry.sub_definitions[0].english) definition_en = niodEntry.sub_definitions[0].english;
      if (!translation && niodEntry.sub_definitions[0].chinese) translation = niodEntry.sub_definitions[0].chinese;
    }

    // 新世纪兜底
    if (xsjjEntry) {
      if (!translation && xsjjEntry.definition) translation = xsjjEntry.definition;
      if (!phonetic_us && xsjjEntry.pronunciation) phonetic_us = xsjjEntry.pronunciation;
      if (!pos && xsjjEntry.word_class) pos = xsjjEntry.word_class;
    }

    updateBatch.push({ word_id, translation, definition_en, phonetic_us, phonetic_uk, pos, exchange, senses, extra });
    updated++;
    if (updateBatch.length >= 2000) { updateMany(updateBatch); process.stdout.write(`\rUpdated: ${updated}`); updateBatch.length = 0; }
  }
  if (updateBatch.length > 0) updateMany(updateBatch);
  console.log(`\nDetails updated: ${updated}`);

  // ========================================
  // 步骤 4: 导入 lemma_map
  // ========================================
  console.log('\n=== Step 4: Import lemma_map ===');
  db.exec('DELETE FROM lemma_map');
  const lemmaStmt = db.prepare('INSERT OR IGNORE INTO lemma_map (inflected_form, lemma) VALUES (?, ?)');
  const lemmaContent = fs.readFileSync(LEMMA_TXT, 'utf-8');
  const lemmaLines = lemmaContent.split(/\r?\n/);
  let lemmaCount = 0;
  const lemmaBatch = [];
  for (const line of lemmaLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    const arrowIdx = trimmed.indexOf('->');
    if (arrowIdx < 0) continue;
    const left = trimmed.substring(0, arrowIdx).trim();
    const slashIdx = left.indexOf('/');
    const lemma = (slashIdx >= 0 ? left.substring(0, slashIdx) : left).toLowerCase();
    const right = trimmed.substring(arrowIdx + 2).trim();
    const forms = right.split(',').map(f => f.trim().toLowerCase()).filter(f => f && f !== lemma);
    for (const form of forms) {
      lemmaBatch.push({ inflected: form, lemma });
      lemmaCount++;
      if (lemmaBatch.length >= 5000) {
        const insertLemma = db.transaction((items) => { for (const i of items) lemmaStmt.run(i.inflected, i.lemma); });
        insertLemma(lemmaBatch);
        process.stdout.write(`\rLemma: ${lemmaCount}`);
        lemmaBatch.length = 0;
      }
    }
  }
  if (lemmaBatch.length > 0) {
    const insertLemma = db.transaction((items) => { for (const i of items) lemmaStmt.run(i.inflected, i.lemma); });
    insertLemma(lemmaBatch);
  }
  console.log(`\nLemma mappings: ${lemmaCount}`);

  // ========================================
  // 步骤 5: 导入 word_relation
  // ========================================
  console.log('\n=== Step 5: Import word_relation ===');
  db.exec("DELETE FROM word_relation WHERE source = 'resemble'");
  const relStmt = db.prepare('INSERT OR IGNORE INTO word_relation (word_id, relation_type, target_word_id, target_lemma, source) VALUES (?, ?, ?, ?, ?)');
  const resembleContent = fs.readFileSync(RESEMBLE_TXT, 'utf-8');
  const resembleLines = resembleContent.split(/\r?\n/);
  let currentWords = [];
  let relCount = 0;
  const relBatch = [];
  for (const line of resembleLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('%')) {
      if (currentWords.length >= 2) {
        for (let i = 0; i < currentWords.length; i++) {
          for (let j = i + 1; j < currentWords.length; j++) {
            const w1 = currentWords[i].toLowerCase();
            const w2 = currentWords[j].toLowerCase();
            relBatch.push({ w1, w2, lemma1: currentWords[i], lemma2: currentWords[j] });
            relCount += 2;
            if (relBatch.length >= 2000) {
              const insertRel = db.transaction((items) => {
                for (const item of items) {
                  relStmt.run(item.w1, 'synonym', item.w2, item.lemma2, 'resemble');
                  relStmt.run(item.w2, 'synonym', item.w1, item.lemma1, 'resemble');
                }
              });
              insertRel(relBatch);
              process.stdout.write(`\rRelations: ${relCount}`);
              relBatch.length = 0;
            }
          }
        }
      }
      currentWords = trimmed.substring(1).trim().split(',').map(w => w.trim()).filter(w => w && !w.startsWith('['));
    }
  }
  if (currentWords.length >= 2) {
    for (let i = 0; i < currentWords.length; i++) {
      for (let j = i + 1; j < currentWords.length; j++) {
        const w1 = currentWords[i].toLowerCase();
        const w2 = currentWords[j].toLowerCase();
        relBatch.push({ w1, w2, lemma1: currentWords[i], lemma2: currentWords[j] });
        relCount += 2;
      }
    }
  }
  if (relBatch.length > 0) {
    const insertRel = db.transaction((items) => {
      for (const item of items) {
        relStmt.run(item.w1, 'synonym', item.w2, item.lemma2, 'resemble');
        relStmt.run(item.w2, 'synonym', item.w1, item.lemma1, 'resemble');
      }
    });
    insertRel(relBatch);
  }
  console.log(`\nRelations: ${relCount}`);

  // ========================================
  // 最终统计
  // ========================================
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  const withTrans = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE translation IS NOT NULL').get().c;
  const withPhonetic = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE phonetic_us IS NOT NULL OR phonetic_uk IS NOT NULL').get().c;
  const withSenses = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE senses IS NOT NULL").get().c;
  const withExchange = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE exchange IS NOT NULL').get().c;

  console.log(`\n========================================`);
  console.log(`=== Import Complete (${elapsed}s) ===`);
  console.log(`========================================`);
  console.log(`Total entries: ${total}`);
  console.log(`With translation: ${withTrans} (${(100*withTrans/total).toFixed(1)}%)`);
  console.log(`With phonetic: ${withPhonetic} (${(100*withPhonetic/total).toFixed(1)}%)`);
  console.log(`With senses: ${withSenses} (${(100*withSenses/total).toFixed(1)}%)`);
  console.log(`With exchange: ${withExchange} (${(100*withExchange/total).toFixed(1)}%)`);
  console.log(`Lemma mappings: ${db.prepare('SELECT COUNT(*) c FROM lemma_map').get().c}`);
  console.log(`Word relations: ${db.prepare('SELECT COUNT(*) c FROM word_relation').get().c}`);

  // COCA 覆盖
  let cocaInDict = 0, cocaTotal = 0;
  const cocaCheck = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const cocaCheckRl = readline.createInterface({ input: cocaCheck, crlfDelay: Infinity });
  let cocaLine = 0;
  for await (const line of cocaCheckRl) {
    cocaLine++;
    if (cocaLine === 1) continue;
    const parts = line.trim().split(',');
    if (parts.length < 4) continue;
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (!word || word.startsWith('(') || word.endsWith(')')) continue;
    cocaTotal++;
    if (db.prepare('SELECT word_id FROM dictionary WHERE word_id = ?').get(word)) cocaInDict++;
  }
  console.log(`COCA 60000 coverage: ${cocaInDict}/${cocaTotal} (${(100*cocaInDict/cocaTotal).toFixed(1)}%)`);

  // 验证前 10 条
  console.log('\nFirst 10 entries:');
  const top10 = db.prepare('SELECT word_id, lemma, pos, sw, static_frequency, standard_level, sort_order FROM dictionary ORDER BY sort_order LIMIT 10').all();
  top10.forEach(r => console.log(`  ${r.sort_order.toString().padStart(6)} ${r.word_id.padEnd(15)} pos=${(r.pos||'null').padEnd(12)} sw=${r.sw.padEnd(15)} freq=${r.static_frequency} level=${r.standard_level}`));
}

main().catch(err => { console.error(err); process.exit(1); });

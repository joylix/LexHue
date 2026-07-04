/**
 * 综合补充脚本
 * 
 * 补充优先级：
 * - pos：COCA JSON > ECDICT CSV > 新世纪 > stardict
 * - phonetic_us：ECDICT > coca-vocab > 新世纪 > stardict
 * - phonetic_uk：ECDICT > coca-vocab > 新世纪 > stardict
 * - senses：新牛津
 * - examples：新牛津
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const COCA_JSON = '/home/joylix/projects/dict/COCA Frequency.json';
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const XSJ_JSON = '/home/joylix/projects/dict/新世纪英汉大词典.json';
const COCA_VOCAB_DIR = '/home/joylix/projects/dict/coca-vocabulary-20000/vocabulary/';

// POS 映射（COCA JSON 的 pos 全称 -> 标准格式）
const COCA_POS_MAP = {
  'noun': 'noun', 'verb': 'verb', 'adjective': 'adjective', 'adverb': 'adverb',
  'preposition': 'preposition', 'conjunction': 'conjunction', 'pronoun': 'pronoun',
  'determiner': 'determiner', 'article': 'article', 'interjection': 'interjection',
  'number': 'number', 'modal': 'modal', 'existential': 'existential',
  '+infinitive': 'infinitive', 'negation': 'negation', 'other': null,
};

// ECDICT pos 映射（简化格式 -> 标准格式）
function normalizePos(pos) {
  if (!pos) return null;
  const p = pos.trim().toLowerCase();
  // 常见映射
  if (p.startsWith('n')) return 'noun';
  if (p.startsWith('v')) return 'verb';
  if (p.startsWith('adj')) return 'adjective';
  if (p.startsWith('adv')) return 'adverb';
  if (p.startsWith('prep')) return 'preposition';
  if (p.startsWith('conj')) return 'conjunction';
  if (p.startsWith('pron')) return 'pronoun';
  if (p.startsWith('det')) return 'determiner';
  if (p.startsWith('interj') || p.startsWith('int')) return 'interjection';
  if (p.startsWith('num')) return 'number';
  if (p.startsWith('art')) return 'article';
  if (p.startsWith('modal') || p === 'modal') return 'modal';
  if (p === 'abbr.' || p === 'abbr') return 'abbreviation';
  if (p === 'prefix') return 'prefix';
  if (p === 'suffix') return 'suffix';
  // 返回原值
  return pos.trim();
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
  // 1. 加载 COCA JSON (pos)
  // ========================================
  console.log('Loading COCA JSON...');
  const cocaJson = JSON.parse(fs.readFileSync(COCA_JSON, 'utf-8'));
  const cocaPosMap = new Map(); // word -> best pos
  for (const [word, entries] of Object.entries(cocaJson)) {
    // 取频率最高的 POS
    let bestPos = null, bestFreq = 0;
    for (const e of entries) {
      if (e.frequency > bestFreq) {
        bestFreq = e.frequency;
        bestPos = COCA_POS_MAP[e.pos] || e.pos;
      }
    }
    if (bestPos) cocaPosMap.set(word.toLowerCase(), bestPos);
  }
  console.log('COCA POS entries:', cocaPosMap.size);

  // ========================================
  // 2. 加载 ECDICT CSV (pos, phonetic, exchange)
  // ========================================
  console.log('Loading ECDICT CSV...');
  const ecdictContent = fs.readFileSync(ECDICT_CSV, 'utf-8');
  const ecdictLines = ecdictContent.split(/\r?\n/);
  const ecdictPosMap = new Map();
  const ecdictPhoneticMap = new Map();
  const ecdictExchangeMap = new Map();

  let ecdictCurrent = null;
  for (let i = 1; i < ecdictLines.length; i++) {
    const line = ecdictLines[i];
    if (ecdictCurrent && !line.match(/^["']?[a-zA-Z'-]/)) { ecdictCurrent += '\n' + line; continue; }
    if (ecdictCurrent) {
      const fields = parseCSVLine(ecdictCurrent);
      if (fields.length >= 10) {
        const w = fields[0].trim().toLowerCase();
        const pos = fields[4].trim();
        const phonetic = fields[1].trim();
        const exchange = fields[10] ? fields[10].trim() : null;
        if (pos) ecdictPosMap.set(w, normalizePos(pos));
        if (phonetic) ecdictPhoneticMap.set(w, phonetic);
        if (exchange) ecdictExchangeMap.set(w, exchange);
      }
    }
    ecdictCurrent = line;
  }
  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 10) {
      const w = fields[0].trim().toLowerCase();
      if (fields[4].trim()) ecdictPosMap.set(w, normalizePos(fields[4].trim()));
      if (fields[1].trim()) ecdictPhoneticMap.set(w, fields[1].trim());
      if (fields[10] && fields[10].trim()) ecdictExchangeMap.set(w, fields[10].trim());
    }
  }
  console.log('ECDICT POS:', ecdictPosMap.size);
  console.log('ECDICT phonetic:', ecdictPhoneticMap.size);
  console.log('ECDICT exchange:', ecdictExchangeMap.size);

  // ========================================
  // 3. 加载新世纪词典 (pos, phonetic)
  // ========================================
  console.log('Loading 新世纪...');
  const xsjj = JSON.parse(fs.readFileSync(XSJ_JSON, 'utf-8'));
  const xsjjPosMap = new Map();
  const xsjjPhoneticMap = new Map();
  for (const [k, v] of Object.entries(xsjj)) {
    if (v) {
      if (v.word_class) xsjjPosMap.set(k.toLowerCase(), normalizePos(v.word_class));
      if (v.pronunciation) xsjjPhoneticMap.set(k.toLowerCase(), v.pronunciation);
    }
  }
  console.log('XSJ POS:', xsjjPosMap.size);
  console.log('XSJ phonetic:', xsjjPhoneticMap.size);

  // ========================================
  // 4. 加载 coca-vocabulary-20000 (phonetic)
  // ========================================
  console.log('Loading COCA vocabulary...');
  const vocabFiles = fs.readdirSync(COCA_VOCAB_DIR).filter(f => f.endsWith('.md'));
  const cocaVocabPhoneticMap = new Map();
  for (const file of vocabFiles) {
    const content = fs.readFileSync(path.join(COCA_VOCAB_DIR, file), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 词行：数字 + 空格 + 词
      const wordMatch = line.match(/^(\d+)\s+(.+)/);
      if (wordMatch) {
        const word = wordMatch[2].trim().toLowerCase();
        // 下一行是音标行
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const phoneticMatch = nextLine.match(/-\s+\[(.*?)\]\s+\[(.*?)\]/);
          if (phoneticMatch) {
            cocaVocabPhoneticMap.set(word, { us: phoneticMatch[1], uk: phoneticMatch[2] });
          }
        }
      }
    }
  }
  console.log('COCA vocab phonetic:', cocaVocabPhoneticMap.size);

  // ========================================
  // 5. 加载新牛津 (senses, examples)
  // ========================================
  console.log('Loading NIOD...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  console.log('NIOD entries:', Object.keys(niod).length);

  // ========================================
  // 6. 获取所有需要补充的词
  // ========================================
  const allWords = db.prepare('SELECT word_id, pos, phonetic_us, phonetic_uk, senses, example_sentences, exchange FROM dictionary ORDER BY sort_order').all();
  console.log('\nTotal words to process:', allWords.length);

  // ========================================
  // 7. 补充 pos
  // ========================================
  console.log('\n=== Supplementing POS ===');
  const posStmt = db.prepare('UPDATE dictionary SET pos = ? WHERE word_id = ?');
  const posMany = db.transaction((items) => { for (const i of items) posStmt.run(i.pos, i.word_id); });

  let posUpdated = 0;
  const posBatch = [];

  for (const { word_id, pos } of allWords) {
    if (pos) continue; // 已有 pos，跳过

    // 按优先级查找
    let newPos = cocaPosMap.get(word_id) || ecdictPosMap.get(word_id) || xsjjPosMap.get(word_id);
    if (newPos) {
      posBatch.push({ word_id, pos: newPos });
      posUpdated++;
      if (posBatch.length >= 2000) { posMany(posBatch); process.stdout.write(`\rPOS: ${posUpdated}`); posBatch.length = 0; }
    }
  }
  if (posBatch.length > 0) posMany(posBatch);
  console.log(`\nPOS updated: ${posUpdated}`);

  // ========================================
  // 8. 补充音标
  // ========================================
  console.log('\n=== Supplementing phonetics ===');
  const phoneticStmt = db.prepare('UPDATE dictionary SET phonetic_us = ?, phonetic_uk = ? WHERE word_id = ?');
  const phoneticMany = db.transaction((items) => { for (const i of items) phoneticStmt.run(i.us, i.uk, i.word_id); });

  let phoneticUpdated = 0;
  const phoneticBatch = [];

  for (const { word_id, phonetic_us, phonetic_uk } of allWords) {
    let us = phonetic_us, uk = phonetic_uk;

    // 如果已有美音，跳过
    if (us && uk) continue;

    // 按优先级查找
    // 1. ECDICT
    if (!us) {
      const ep = ecdictPhoneticMap.get(word_id);
      if (ep) {
        // ECDICT 音标格式：/wɒtʃ/ 或 /wɒtʃ/ /wɑːtʃ/
        const parts = ep.split(/\s+\/\s*/).filter(p => p.startsWith('/'));
        if (parts.length >= 2) { us = parts[0]; uk = parts[1]; }
        else if (parts.length === 1) { us = parts[0]; }
        else { us = ep; }
      }
    }

    // 2. coca-vocab
    if (!us || !uk) {
      const cv = cocaVocabPhoneticMap.get(word_id);
      if (cv) {
        if (!us) us = '/' + cv.us + '/';
        if (!uk) uk = '/' + cv.uk + '/';
      }
    }

    // 3. 新世纪
    if (!us) {
      const xp = xsjjPhoneticMap.get(word_id);
      if (xp) {
        // 新世纪音标格式：/wɒtʃ/ 或 /wɒtʃ/ /wɑːtʃ/
        const match = xp.match(/\/([^/]+)\//);
        if (match) us = '/' + match[1] + '/';
      }
    }

    if (us || uk) {
      phoneticBatch.push({ word_id, us: us || null, uk: uk || null });
      phoneticUpdated++;
      if (phoneticBatch.length >= 2000) { phoneticMany(phoneticBatch); process.stdout.write(`\rPhonetic: ${phoneticUpdated}`); phoneticBatch.length = 0; }
    }
  }
  if (phoneticBatch.length > 0) phoneticMany(phoneticBatch);
  console.log(`\nPhonetic updated: ${phoneticUpdated}`);

  // ========================================
  // 9. 补充 exchange
  // ========================================
  console.log('\n=== Supplementing exchange ===');
  const exchangeStmt = db.prepare('UPDATE dictionary SET exchange = ? WHERE word_id = ?');
  const exchangeMany = db.transaction((items) => { for (const i of items) exchangeStmt.run(i.exchange, i.word_id); });

  let exchangeUpdated = 0;
  const exchangeBatch = [];

  for (const { word_id, exchange } of allWords) {
    if (exchange) continue;
    const ex = ecdictExchangeMap.get(word_id);
    if (ex) {
      exchangeBatch.push({ word_id, exchange: ex });
      exchangeUpdated++;
      if (exchangeBatch.length >= 2000) { exchangeMany(exchangeBatch); process.stdout.write(`\rExchange: ${exchangeUpdated}`); exchangeBatch.length = 0; }
    }
  }
  if (exchangeBatch.length > 0) exchangeMany(exchangeBatch);
  console.log(`\nExchange updated: ${exchangeUpdated}`);

  // ========================================
  // 10. 补充 senses 和 examples
  // ========================================
  console.log('\n=== Supplementing senses & examples ===');
  const sensesStmt = db.prepare('UPDATE dictionary SET senses = ?, example_sentences = ? WHERE word_id = ?');
  const sensesMany = db.transaction((items) => { for (const i of items) sensesStmt.run(i.senses, i.examples, i.word_id); });

  let sensesUpdated = 0, examplesUpdated = 0;
  const sensesBatch = [];

  for (const { word_id, senses, example_sentences } of allWords) {
    if (senses && senses !== '[]' && senses !== 'null') continue;

    const niodEntry = niod[word_id] || niod[word_id.charAt(0).toUpperCase() + word_id.slice(1)];
    if (!niodEntry) continue;

    let sensesJson = null;
    if (niodEntry.sub_definitions && niodEntry.sub_definitions.length > 0) {
      const sensesArr = niodEntry.sub_definitions.map(sd => ({
        pos: niodEntry.parts_of_speech && niodEntry.parts_of_speech.length > 0 ? niodEntry.parts_of_speech[0] : null,
        translation: sd.chinese || null,
        definition_en: sd.english || null,
      }));
      sensesJson = JSON.stringify(sensesArr);
    }

    let examplesJson = null;
    if (niodEntry.examples && niodEntry.examples.length > 0) {
      const examples = niodEntry.examples.map(ex => ex.english || '').filter(e => e).slice(0, 3);
      if (examples.length > 0) examplesJson = JSON.stringify(examples);
    }

    if (sensesJson || examplesJson) {
      sensesBatch.push({ word_id, senses: sensesJson, examples: examplesJson });
      sensesUpdated++;
      if (examplesJson) examplesUpdated++;
      if (sensesBatch.length >= 2000) { sensesMany(sensesBatch); process.stdout.write(`\rSenses: ${sensesUpdated}`); sensesBatch.length = 0; }
    }
  }
  if (sensesBatch.length > 0) sensesMany(sensesBatch);
  console.log(`\nSenses updated: ${sensesUpdated}`);
  console.log(`Examples updated: ${examplesUpdated}`);

  // ========================================
  // 最终统计
  // ========================================
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  const withPos = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE pos IS NOT NULL').get().c;
  const withUs = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE phonetic_us IS NOT NULL').get().c;
  const withUk = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE phonetic_uk IS NOT NULL').get().c;
  const withSenses = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE senses IS NOT NULL AND senses != '[]'").get().c;
  const withExamples = db.prepare("SELECT COUNT(*) c FROM dictionary WHERE example_sentences IS NOT NULL AND example_sentences != '[]'").get().c;
  const withExchange = db.prepare('SELECT COUNT(*) c FROM dictionary WHERE exchange IS NOT NULL').get().c;

  console.log(`\n========================================`);
  console.log(`=== Complete (${elapsed}s) ===`);
  console.log(`========================================`);
  console.log(`Total: ${total}`);
  console.log(`POS: ${withPos} (${(100*withPos/total).toFixed(1)}%)`);
  console.log(`Phonetic US: ${withUs} (${(100*withUs/total).toFixed(1)}%)`);
  console.log(`Phonetic UK: ${withUk} (${(100*withUk/total).toFixed(1)}%)`);
  console.log(`Senses: ${withSenses} (${(100*withSenses/total).toFixed(1)}%)`);
  console.log(`Examples: ${withExamples} (${(100*withExamples/total).toFixed(1)}%)`);
  console.log(`Exchange: ${withExchange} (${(100*withExchange/total).toFixed(1)}%)`);
}

main().catch(err => { console.error(err); process.exit(1); });

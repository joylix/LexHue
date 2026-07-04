/**
 * COCA 60000 补充导入脚本（优化版）
 * 用法: node server/scripts/import-coca-supplement.js
 */

const fs = require('fs');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const JCPD_JSON = '/home/joylix/projects/dict/金山词霸2006美国传统词典双解.json';
const XSJ_JSON = '/home/joylix/projects/dict/新世纪英汉大词典.json';

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

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (inQuote) {
      if (ch === '"') inQuote = false;
      else current += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function extractPhonetic(html, type) {
  if (!html) return null;
  const pattern = type === 'dj'
    ? /D\.J\.\[<[^>]+>([^<]+)<\/font>\]/
    : /K\.K\.\[<[^>]+>([^<]+)<\/font>\]/;
  const match = html.match(pattern);
  return match ? '/' + match[1] + '/' : null;
}

async function main() {
  console.log('=== COCA 60000 Supplement Importer ===');
  const db = getDictDb();

  // 1. 加载 COCA 60000 词表和缺失词
  console.log('Loading COCA 60000...');
  const missing = new Map(); // word -> rank
  const fileStream = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',');
    if (parts.length < 4) continue;
    const rank = parseInt(parts[0].trim());
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (!word || !rank) continue;
    const existing = db.prepare('SELECT word_id FROM dictionary WHERE word_id = ?').get(word);
    if (!existing) missing.set(word, rank);
  }
  console.log('Missing words:', missing.size);

  if (missing.size === 0) {
    console.log('All COCA 60000 words are already in dictionary!');
    return;
  }

  // 2. 加载其他词典（小文件直接加载）
  console.log('Loading other dictionaries...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  const jcpdEntries = (JSON.parse(fs.readFileSync(JCPD_JSON, 'utf-8')).entries || []);
  const xsjj = JSON.parse(fs.readFileSync(XSJ_JSON, 'utf-8'));

  // 构建金山词霸索引
  const jcpdIndex = new Map();
  for (const e of jcpdEntries) {
    if (e.word) jcpdIndex.set(e.word.toLowerCase(), e);
  }
  console.log('Dictionaries loaded');

  // 3. 扫描 ECDICT，只保留缺失词
  console.log('Scanning ECDICT...');
  const ecdictStream = fs.createReadStream(ECDICT_CSV, { encoding: 'utf-8' });
  const ecdictRl = readline.createInterface({ input: ecdictStream, crlfDelay: Infinity });
  const foundInEcdict = new Map();
  let ecdictLineNum = 0;
  let ecdictCurrent = null;
  for await (const line of ecdictRl) {
    ecdictLineNum++;
    if (ecdictLineNum === 1) continue;
    if (ecdictCurrent && !line.match(/^["']?[a-zA-Z'-]/)) {
      ecdictCurrent += '\n' + line;
      continue;
    }
    if (ecdictCurrent) {
      const fields = parseCSVLine(ecdictCurrent);
      if (fields.length >= 4) {
        const w = fields[0].trim().toLowerCase();
        if (missing.has(w) && !foundInEcdict.has(w)) {
          const translation = fields[3].trim();
          if (translation) {
            foundInEcdict.set(w, {
              word: fields[0].trim(),
              phonetic: fields[1].trim() || null,
              definition: fields[2].trim() || null,
              translation: translation,
              pos: fields[4].trim() || null,
              collins: fields[5] ? fields[5].trim() || null : null,
              oxford: fields[6] ? fields[6].trim() || null : null,
              exchange: fields[10] ? fields[10].trim() : null,
            });
          }
        }
      }
    }
    ecdictCurrent = line;
  }
  // 最后一条
  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 4) {
      const w = fields[0].trim().toLowerCase();
      if (missing.has(w) && !foundInEcdict.has(w)) {
        const translation = fields[3].trim();
        if (translation) {
          foundInEcdict.set(w, {
            word: fields[0].trim(), phonetic: fields[1].trim() || null,
            definition: fields[2].trim() || null, translation: translation,
            pos: fields[4].trim() || null,
            collins: fields[5] ? fields[5].trim() || null : null,
            oxford: fields[6] ? fields[6].trim() || null : null,
            exchange: fields[10] ? fields[10].trim() : null,
          });
        }
      }
    }
  }
  console.log('Found in ECDICT:', foundInEcdict.size);

  // 4. 准备写入
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO dictionary
    (word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk,
     static_frequency, standard_level, senses, exchange, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      insertStmt.run(
        e.word_id, e.lemma, e.pos, e.translation, e.definition_en,
        e.phonetic_us, e.phonetic_uk, e.static_frequency, e.standard_level,
        e.senses, e.exchange, e.extra
      );
    }
  });

  let imported = 0;
  const batch = [];
  const sourceStats = { ecdict: 0, niod: 0, xsjj: 0, none: 0 };

  for (const [word, rank] of missing) {
    const level = calcStandardLevel(rank);
    let entry = null;

    // ECDICT
    const ecdict = foundInEcdict.get(word);
    if (ecdict) {
      const extra = {};
      if (ecdict.collins) extra.collins = ecdict.collins;
      if (ecdict.oxford) extra.oxford = ecdict.oxford;
      entry = {
        word_id: word, lemma: word, pos: ecdict.pos,
        translation: ecdict.translation, definition_en: ecdict.definition,
        phonetic_us: ecdict.phonetic, phonetic_uk: null,
        static_frequency: rank, standard_level: level,
        senses: null, exchange: ecdict.exchange,
        extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
      };
      sourceStats.ecdict++;
    }

    // 新牛津补充 senses
    const niodEntry = niod[word] || niod[word.charAt(0).toUpperCase() + word.slice(1)];
    if (niodEntry && niodEntry.sub_definitions && niodEntry.sub_definitions.length > 0) {
      const senses = niodEntry.sub_definitions.map(sd => ({
        pos: niodEntry.parts_of_speech && niodEntry.parts_of_speech.length > 0 ? niodEntry.parts_of_speech[0] : null,
        translation: sd.chinese || null,
        definition_en: sd.english || null,
      }));
      if (!entry) {
        entry = {
          word_id: word, lemma: word, pos: null, translation: null,
          definition_en: niodEntry.sub_definitions[0].english || null,
          phonetic_us: null, phonetic_uk: null,
          static_frequency: rank, standard_level: level,
          senses: JSON.stringify(senses), exchange: null, extra: null,
        };
      } else {
        entry.senses = JSON.stringify(senses);
      }
      sourceStats.niod++;
    }

    // 金山词霸音标
    const jcpdEntry = jcpdIndex.get(word);
    if (jcpdEntry && jcpdEntry.definition) {
      const dj = extractPhonetic(jcpdEntry.definition, 'dj');
      const kk = extractPhonetic(jcpdEntry.definition, 'kk');
      if (!entry) {
        entry = {
          word_id: word, lemma: word, pos: null, translation: null,
          definition_en: null, phonetic_us: dj, phonetic_uk: kk,
          static_frequency: rank, standard_level: level,
          senses: null, exchange: null, extra: null,
        };
      } else {
        if (dj) entry.phonetic_us = dj;
        if (kk) entry.phonetic_uk = kk;
      }
    }

    // 新世纪兜底
    const xsjjEntry = xsjj[word];
    if (!entry && xsjjEntry) {
      entry = {
        word_id: word, lemma: word, pos: xsjjEntry.word_class || null,
        translation: xsjjEntry.definition || null, definition_en: null,
        phonetic_us: xsjjEntry.pronunciation || null, phonetic_uk: null,
        static_frequency: rank, standard_level: level,
        senses: null, exchange: null, extra: null,
      };
      sourceStats.xsjj++;
    }

    if (entry) {
      batch.push(entry);
      imported++;
      if (batch.length >= 2000) {
        insertMany(batch);
        process.stdout.write(`\rImported: ${imported}`);
        batch.length = 0;
      }
    } else {
      sourceStats.none++;
    }
  }

  if (batch.length > 0) insertMany(batch);

  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log('Sources:', JSON.stringify(sourceStats));

  // 最终覆盖率
  let finalInDict = 0;
  const allCoca = new Set();
  const fs2 = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const rl2 = readline.createInterface({ input: fs2, crlfDelay: Infinity });
  let ln = 0;
  for await (const line of rl2) {
    ln++;
    if (ln === 1) continue;
    const parts = line.trim().split(',');
    if (parts.length < 4) continue;
    const w = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (w) allCoca.add(w);
  }
  for (const w of allCoca) {
    if (db.prepare('SELECT word_id FROM dictionary WHERE word_id = ?').get(w)) finalInDict++;
  }
  console.log(`Final COCA 60000 coverage: ${finalInDict}/${allCoca.size} (${(100*finalInDict/allCoca.size).toFixed(1)}%)`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

/**
 * Step 3: 导入 ECDICT 中 COCA 不包含的词
 * 过滤掉带 [地名]、[人名]、[品牌] 标记的专有名词
 * 但保留常见地名/人名（在 COCA 60000 中出现的）
 */
const fs = require('fs');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';

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

function calcStandardLevel(bnc, frq) {
  const rank = bnc || frq;
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
  console.log('=== Step 3: Import ECDICT (non-COCA words) ===');
  const db = getDictDb();

  // 加载 COCA 词集合
  const cocaWords = new Set();
  const cocaStream = fs.createReadStream(COCA_CSV, { encoding: 'utf-8' });
  const cocaRl = readline.createInterface({ input: cocaStream, crlfDelay: Infinity });
  let cocaLineNum = 0;
  for await (const line of cocaRl) {
    cocaLineNum++;
    if (cocaLineNum === 1) continue;
    const parts = line.trim().split(',');
    if (parts.length < 4) continue;
    const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
    if (word) cocaWords.add(word);
  }
  console.log('COCA words:', cocaWords.size);

  // 扫描 ECDICT
  const ecdictStream = fs.createReadStream(ECDICT_CSV, { encoding: 'utf-8' });
  const ecdictRl = readline.createInterface({ input: ecdictStream, crlfDelay: Infinity });

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

  let imported = 0, skippedCoca = 0, skippedProper = 0, skippedNoTrans = 0;
  const batch = [];
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
      if (fields.length >= 5) {
        const word = fields[0].trim();
        const wordLower = word.toLowerCase();
        const phonetic = fields[1].trim() || null;
        const definition = fields[2].trim() || '';
        const translation = fields[3].trim() || null;
        const pos = fields[4].trim() || null;
        const collins = fields[5] ? fields[5].trim() || null : null;
        const oxford = fields[6] ? fields[6].trim() || null : null;
        const bnc = parseInt(fields[8]) || 0;
        const frq = parseInt(fields[9]) || 0;
        const exchange = fields[10] ? fields[10].trim() : null;

        // 跳过 COCA 已有的词
        if (cocaWords.has(wordLower)) {
          skippedCoca++;
          ecdictCurrent = line;
          continue;
        }

        // 跳过带括号的词
        if (wordLower.startsWith('(') || wordLower.endsWith(')')) {
          skippedProper++;
          ecdictCurrent = line;
          continue;
        }

        // 跳过无翻译的词
        if (!translation) {
          skippedNoTrans++;
          ecdictCurrent = line;
          continue;
        }

        // 跳过 ECDICT 标记的专有名词（地名、人名、品牌）
        // 但保留在 COCA 中出现的专有名词
        if (pos && /^\[(地名|人名|品牌|国家|城市|姓氏|名字)\]/.test(pos)) {
          // 检查是否在 COCA 中
          if (!cocaWords.has(wordLower)) {
            skippedProper++;
            ecdictCurrent = line;
            continue;
          }
        }

        const level = calcStandardLevel(bnc, frq);
        const extra = {};
        if (collins) extra.collins = collins;
        if (oxford) extra.oxford = oxford;

        // 解析 exchange
        let inflections = null;
        if (exchange) {
          inflections = {};
          for (const part of exchange.split(',')) {
            const [k, v] = part.split(':');
            if (!k || !v) continue;
            switch (k.trim()) {
              case 's': inflections.plural = v; break;
              case 'p': inflections.past = v; break;
              case '3': inflections['3rd'] = v; break;
              case 'i': inflections.participle = v; break;
              case 'd': inflections.past_participle = v; break;
              case 'r': inflections.comparative = v; break;
              case 't': inflections.superlative = v; break;
            }
          }
          if (Object.keys(inflections).length === 0) inflections = null;
        }

        // 解析音标
        let phonetic_us = null, phonetic_uk = null;
        if (phonetic) {
          const parts = phonetic.split(/\s+\/\s*/).filter(p => p.startsWith('/'));
          if (parts.length >= 2) { phonetic_us = parts[0]; phonetic_uk = parts[1]; }
          else if (parts.length === 1) { phonetic_us = parts[0]; }
          else { phonetic_us = phonetic; }
        }

        batch.push({
          word_id: wordLower, lemma: wordLower, pos, translation, definition_en: definition || null,
          phonetic_us, phonetic_uk, static_frequency: bnc || frq || 0,
          standard_level: level, senses: null, exchange,
          extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
        });
        imported++;

        if (batch.length >= 2000) {
          insertMany(batch);
          process.stdout.write(`\rImported: ${imported}, Skip(COCA): ${skippedCoca}, Skip(proper): ${skippedProper}, Skip(noTrans): ${skippedNoTrans}`);
          batch.length = 0;
        }
      }
    }
    ecdictCurrent = line;
  }

  // 最后一条
  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 5) {
      const word = fields[0].trim();
      const wordLower = word.toLowerCase();
      const translation = fields[3].trim() || null;
      const pos = fields[4].trim() || null;
      if (!cocaWords.has(wordLower) && translation && !wordLower.startsWith('(') && !wordLower.endsWith(')')) {
        if (!pos || !/^\[(地名|人名|品牌|国家|城市|姓氏|名字)\]/.test(pos) || cocaWords.has(wordLower)) {
          // 同上处理...
          const bnc = parseInt(fields[8]) || 0;
          const frq = parseInt(fields[9]) || 0;
          const level = calcStandardLevel(bnc, frq);
          batch.push({
            word_id: wordLower, lemma: wordLower, pos, translation,
            definition_en: fields[2].trim() || null,
            phonetic_us: fields[1].trim() || null, phonetic_uk: null,
            static_frequency: bnc || frq || 0, standard_level: level,
            senses: null, exchange: fields[10] ? fields[10].trim() : null, extra: null,
          });
          imported++;
        }
      }
    }
  }

  if (batch.length > 0) insertMany(batch);

  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (COCA): ${skippedCoca}`);
  console.log(`Skipped (proper noun): ${skippedProper}`);
  console.log(`Skipped (no translation): ${skippedNoTrans}`);

  const total = db.prepare('SELECT COUNT(*) c FROM dictionary').get().c;
  console.log('Total entries:', total);
}

main().catch(err => { console.error(err); process.exit(1); });

/**
 * ECDICT Supplement Importer
 * 从 ecdict.csv 中补充 COCA 词条的 definition_en 和 translation
 * 同时导入 COCA 中没有但 ECDICT 有效的词条（standard_level=9）
 *
 * 用法: node server/scripts/import-ecdict-supplement.js
 */

const fs = require('fs');
const path = require('readline');
const { getDictDb } = require('../database/connection');

const ECDICT_CSV = '/home/jlx/projects/ECDICT/ecdict.csv';
const NUM_FIELDS = 13;
const BATCH_SIZE = 2000;

// 脏数据过滤
function isDirty(word, def) {
  if (!def || def.length < 20) return true;
  if (word.startsWith('-') || word.startsWith("'")) return true;
  if (def.includes('> ') && def.includes('\\n')) return true; // 含引文示例的脏数据
  // 过滤明显不合适的词
  if (/\d/.test(word)) return true; // 含数字
  if (word.length > 40) return true; // 过长（短语）
  if (/^a-/.test(word)) return true; // a- 开头的复合词（a-list, a-line 等）
  if (/^\./.test(word)) return true; // 点开头的缩写
  if (/\.$/.test(word)) return true; // 点结尾的缩写
  if (word.includes('(') || word.includes(')')) return true; // 含括号
  if (word.split('-').length > 3) return true; // 过多连字符
  return false;
}

// 解析 ECDICT CSV（跨行字段处理）
function* parseRecords(content) {
  let recordStart = 0;
  let fieldCount = 0;
  let inQuote = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') { i++; }
        else { inQuote = false; }
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fieldCount++; }
      else if (ch === '\n') {
        if (fieldCount >= NUM_FIELDS - 1) {
          let recordText = content.substring(recordStart, i);
          if (recordText.endsWith('\r')) recordText = recordText.slice(0, -1);
          const fields = splitFields(recordText);
          if (fields.length >= 5) yield fields;
          recordStart = i + 1;
          fieldCount = 0;
        }
      }
    }
  }
}

function splitFields(text) {
  const fields = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { current += '"'; i++; }
        else { inQuote = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

// 从 definition 解析 POS
const POS_MAP = {
  n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb',
  prep: 'preposition', conj: 'conjunction', pron: 'pronoun',
  art: 'article', aux: 'auxiliary', interj: 'interjection',
  int: 'interjection', det: 'determiner', num: 'numeral',
};

function parseSensesFromDef(def) {
  if (!def) return [];
  const senses = [];

  // ECDICT definition 格式: "\nn. xxx\nn. xxx\nv. xxx"
  // 每个义项以 \n + 词性标记 开头
  // 词性标记: n. v. adj. adv. prep. conj. pron. art. aux. interj. int. det. num.
  // 也处理: vb. pr. pp. 等变体

  // 先找到所有词性标记的位置
  const posRegex = /\\n(p\\.?(?:r|p)?\\.?\\s*)?(n|v|adj|adv|prep|conj|pron|art|aux|interj|int|det|num|vb)\\.(\\s)/g;
  const matches = [];
  let m;
  while ((m = posRegex.exec(def)) !== null) {
    const posAbbr = m[2];
    const start = m.index + m[0].length - 1; // 词性标记后的空格之后
    matches.push({ posAbbr, start });
  }

  if (matches.length === 0) {
    // 没有词性标记，整个 definition 作为一个 sense
    return [{ pos: null, definition_en: def.trim(), translation: null }];
  }

  // 按位置分割义项
  for (let i = 0; i < matches.length; i++) {
    const text = def.substring(matches[i].start, i + 1 < matches.length ? matches[i + 1].start : def.length).trim();
    if (text.length < 3) continue;

    const posAbbr = matches[i].posAbbr;
    const pos = POS_MAP[posAbbr] || posAbbr;

    senses.push({ pos, definition_en: text, translation: null });
  }

  return senses.length > 0 ? senses : [{ pos: null, definition_en: def.trim(), translation: null }];
}

function distributeTranslation(translation, senses) {
  if (!translation || senses.length <= 1) {
    if (senses.length === 1) senses[0].translation = translation;
    return senses;
  }
  const sections = translation.split(/\n/).filter(s => s.trim());
  if (sections.length === 1) { senses[0].translation = sections[0].trim(); return senses; }

  for (const section of sections) {
    const posMatch = section.match(/^(n|v|adj|adv|prep|conj|pron|art|aux|interj|int|det|num)\./);
    if (posMatch) {
      const mappedPos = POS_MAP[posMatch[1]];
      const text = section.replace(/^.\.\s*/, '').trim();
      const sense = senses.find(s => s.pos === mappedPos);
      if (sense) sense.translation = text;
    } else {
      const idx = sections.indexOf(section);
      if (idx < senses.length) senses[idx].translation = section.trim();
    }
  }
  if (!senses[0].translation) senses[0].translation = translation.split('\n')[0].trim();
  return senses;
}

function main() {
  console.log('=== ECDICT Supplement Importer ===');

  const db = getDictDb();

  // 获取 COCA 中已有的词
  const cocaRows = db.prepare('SELECT word_id, coca_rank FROM dictionary WHERE coca_rank > 0').all();
  const cocaWords = new Set(cocaRows.map(r => r.word_id));
  console.log('COCA words in DB:', cocaWords.size);

  // 准备语句
  const updateStmt = db.prepare(`
    UPDATE dictionary SET
      definition_en = COALESCE(?, definition_en),
      translation = COALESCE(?, translation),
      senses = COALESCE(?, senses),
      exchange = COALESCE(?, exchange),
      phonetic_us = COALESCE(?, phonetic_us),
      phonetic_uk = COALESCE(?, phonetic_uk),
      extra = COALESCE(?, extra)
    WHERE word_id = ?
  `);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO dictionary
    (word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk,
     static_frequency, standard_level, collocations, example_sentences, senses,
     exchange, extra, coca_rank, bnc_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(
        item.definition_en, item.translation, item.senses,
        item.exchange, item.phonetic_us, item.phonetic_uk,
        item.extra, item.word_id
      );
    }
  });

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

  // 读取 ECDICT
  const raw = fs.readFileSync(ECDICT_CSV, 'utf-8');
  const headerEnd = raw.indexOf('\n');
  const data = raw.substring(headerEnd + 1);

  let supplemented = 0, added = 0, skipped = 0, errors = 0;
  let updateBatch = [], insertBatch = [];
  const startTime = Date.now();

  for (const fields of parseRecords(data)) {
    try {
      if (fields.length < 10) { skipped++; continue; }

      const word = fields[0].trim().toLowerCase();
      const def = (fields[2] || '').trim();
      const translation = (fields[3] || '').trim() || null;
      const phonetic = (fields[1] || '').trim() || null;
      const bnc = parseInt(fields[8]) || 0;
      const frq = parseInt(fields[9]) || 0;
      const exchange = (fields[10] || '').trim() || null;
      const tag = (fields[7] || '').trim() || null;
      const collins = (fields[5] || '').trim() || null;
      const oxford = (fields[6] || '').trim() || null;

      if (isDirty(word, def)) { skipped++; continue; }

      // 解析 senses
      const senses = parseSensesFromDef(def);
      distributeTranslation(translation, senses);

      // 音标处理
      let phonetic_us = null, phonetic_uk = null;
      if (phonetic) {
        const parts = phonetic.split(/\s+\/\s*/).filter(p => p.startsWith('/'));
        if (parts.length >= 2) { phonetic_us = parts[0]; phonetic_uk = parts[1]; }
        else if (parts.length === 1) { phonetic_us = parts[0]; }
        else { phonetic_us = phonetic; }
      }

      // extra
      const extra = {};
      if (tag) extra.tag = tag;
      if (collins) extra.collins = collins;
      if (oxford) extra.oxford = oxford;
      const extraStr = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

      const primaryDef = senses[0]?.definition_en || def;
      const primaryTrans = senses[0]?.translation || translation;
      const sensesStr = senses.length > 1 ? JSON.stringify(senses.map(s => ({
        pos: s.pos,
        translation: s.translation,
        definition_en: s.definition_en,
      }))) : null;

      if (cocaWords.has(word)) {
        // 补充已有词条
        updateBatch.push({
          word_id: word,
          definition_en: primaryDef,
          translation: primaryTrans,
          senses: sensesStr,
          exchange,
          phonetic_us,
          phonetic_uk,
          extra: extraStr,
        });
        supplemented++;
        if (updateBatch.length >= BATCH_SIZE) {
          updateMany(updateBatch);
          process.stdout.write(`\rSupplemented: ${supplemented}, Added: ${added}, Skipped: ${skipped}`);
          updateBatch = [];
        }
      } else {
        // 新词条（不在 COCA 中）— 只导入有排名数据的
        const bestRank = bnc || frq || 0;
        if (bestRank <= 0) { skipped++; continue; } // 无排名，跳过

        insertBatch.push({
          word_id: word,
          lemma: word,
          pos: senses[0]?.pos || null,
          translation: primaryTrans,
          definition_en: primaryDef,
          phonetic_us,
          phonetic_uk,
          static_frequency: bestRank,
          standard_level: 9,
          collocations: '[]',
          example_sentences: '[]',
          senses: sensesStr,
          exchange,
          extra: extraStr,
          coca_rank: 0,
          bnc_rank: bnc,
        });
        added++;
        if (insertBatch.length >= BATCH_SIZE) {
          insertMany(insertBatch);
          process.stdout.write(`\rSupplemented: ${supplemented}, Added: ${added}, Skipped: ${skipped}`);
          insertBatch = [];
        }
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.error('\nError:', e.message);
    }
  }

  // 写入剩余
  if (updateBatch.length > 0) updateMany(updateBatch);
  if (insertBatch.length > 0) insertMany(insertBatch);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n=== Done ===`);
  console.log(`Supplemented (COCA words): ${supplemented}`);
  console.log(`Added (new words):        ${added}`);
  console.log(`Skipped:                  ${skipped}`);
  console.log(`Errors:                   ${errors}`);
  console.log(`Time:                     ${elapsed}s`);

  // 统计
  const stats = db.prepare('SELECT COUNT(*) as total, SUM(coca_rank > 0) as has_coca, SUM(definition_en IS NOT NULL) as has_def FROM dictionary').get();
  console.log(`\nDB stats: total=${stats.total}, has_coca=${stats.has_coca}, has_def=${stats.has_def}`);
}

main();

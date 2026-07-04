/**
 * ECDICT CSV Importer
 * 解析 ecdict.csv → 写入 dictionary.db
 *
 * 用法: node server/scripts/import-ecdict.js [--source=ecdict.csv] [--dry-run] [--limit=N]
 *
 * 过滤规则:
 *  - 跳过 pos 字段含 [地名]、[人名]、[品牌] 等专有名词标签
 *  - 跳过 definition 少于 20 字符的
 *  - 跳过 word 含特殊字符（引号开头等）的
 *  - 跳过 collins/oxford 字段为空的（可选）
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDictDb } = require('../database/connection');

// ============ 配置 ============
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const BATCH_SIZE = 2000; // 每批写入量

// ============ 过滤规则 ============
const SKIP_POS_PATTERNS = [
  /^\[/,          // [地名]、[人名]、[品牌] 等
];

const SKIP_WORD_PATTERNS = [
  /^'/,           // 引号开头的词（如 'hood, 'a）
  /^-/,           // 连字符开头的词
  /\d/,           // 含数字的词（如 3D, MP3）
];

function shouldSkip(word, pos, definition) {
  // 过滤特殊词
  for (const p of SKIP_WORD_PATTERNS) {
    if (p.test(word)) return true;
  }
  // 过滤短 definition
  if (!definition || definition.length < 20) return true;
  // 过滤专有名词标签
  if (pos) {
    for (const p of SKIP_POS_PATTERNS) {
      if (p.test(pos)) return true;
    }
  }
  return false;
}

// ============ CSV 解析 ============
// ECDICT CSV 格式: word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
// 字段可能含引号包裹的换行符，需要正确处理

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuote = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuote = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ============ POS 解析 ============
// 从 definition 字段解析词性和义项
// 格式: "n. a timepiece... / v. to watch... / adj. ..."
// 或者多行: "n. a timepiece...\nv. to watch..."

const POS_MAP = {
  'n': 'noun',
  'v': 'verb',
  'adj': 'adjective',
  'adv': 'adverb',
  'prep': 'preposition',
  'conj': 'conjunction',
  'pron': 'pronoun',
  'art': 'article',
  'aux': 'auxiliary',
  'interj': 'interjection',
  'int': 'interjection',
  'det': 'determiner',
  'num': 'numeral',
  'pref': 'prefix',
  'suf': 'suffix',
  'abbr': 'abbreviation',
};

function parsePosFromDef(def) {
  if (!def) return [];

  const senses = [];
  // 按词性标记分割 definition
  // 匹配: n. v. adj. adv. prep. conj. pron. art. aux. interj. int. det. num. pref. suf. abbr.
  // 也匹配: n./v. adj./adv. 等组合形式
  // 还匹配: p.pr. & vb. n. 等古旧格式

  // 策略: 用正则找到所有词性标记的位置，然后分段
  const posPattern = /(?:^|\\n|\s{2,})((?:p\.?\s*)?(?:pr\.?|pp\.?|vb\.?|n\.?|v\.?|adj\.?|adv\.?|prep\.?|conj\.?|pron\.?|art\.?|aux\.?|interj\.?|int\.?|det\.?|num\.?|pref\.?|suf\.?|abbr\.?)(?:\s*[,/&]\s*(?:p\.?\s*)?(?:pr\.?|pp\.?|vb\.?|n\.?|v\.?|adj\.?|adv\.?|prep\.?|conj\.?|pron\.?|art\.?|aux\.?|interj\.?|int\.?|det\.?|num\.?|pref\.?|suf\.?|abbr\.?))*)\s/g;

  const segments = [];
  let match;
  const matches = [];

  while ((match = posPattern.exec(def)) !== null) {
    matches.push({ pos: match[1].trim(), index: match.index });
  }

  if (matches.length === 0) {
    // 没有词性标记，整个 definition 作为一个 sense
    return [{ pos: null, definition_en: def.trim(), translation: null }];
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].pos.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : def.length;
    const text = def.substring(start, end).trim();
    // 清理开头的冒号、空格等
    const cleanText = text.replace(/^[\s:;,.]+/, '').trim();

    if (cleanText.length < 3) continue; // 跳过过短的义项

    // 解析词性缩写
    const posAbbrs = matches[i].pos.split(/[,/&\s]+/).map(s => s.replace(/\./g, '').trim()).filter(Boolean);
    const mappedPos = [];
    for (const abbr of posAbbrs) {
      const cleanAbbr = abbr.replace(/^(p|pr|pp|vb)\s*/, ''); // 去掉前缀标记
      if (POS_MAP[cleanAbbr]) mappedPos.push(POS_MAP[cleanAbbr]);
      else if (POS_MAP[abbr]) mappedPos.push(POS_MAP[abbr]);
    }

    senses.push({
      pos: mappedPos[0] || null, // 取第一个词性
      all_pos: mappedPos,
      definition_en: cleanText,
      translation: null, // 后面从 translation 字段按段落分配
    });
  }

  return senses.length > 0 ? senses : [{ pos: null, definition_en: def.trim(), translation: null }];
}

// ============ Translation 分配 ============
// translation 字段格式: "n. 银行, 堤, 岸\nv. 存钱"
// 尝试按段落分配给对应的 sense

function distributeTranslation(translation, senses) {
  if (!translation || senses.length <= 1) {
    if (senses.length === 1) senses[0].translation = translation;
    return senses;
  }

  // 按换行或词性标记分割 translation
  const sections = translation.split(/\n/).filter(s => s.trim());

  if (sections.length === 1) {
    // 只有一个段落，分配给所有 senses
    senses[0].translation = sections[0].trim();
    return senses;
  }

  // 尝试按词性标记匹配
  for (const section of sections) {
    const posMatch = section.match(/^(n|v|adj|adv|prep|conj|pron|art|aux|interj|int|det|num)\./);
    if (posMatch) {
      const abbr = posMatch[1];
      const mappedPos = POS_MAP[abbr];
      const text = section.replace(/^.\.\s*/, '').trim();
      // 找到对应词性的 sense
      const sense = senses.find(s => s.pos === mappedPos);
      if (sense) {
        sense.translation = text;
      }
    } else {
      // 没有词性标记，按顺序分配
      const idx = sections.indexOf(section);
      if (idx < senses.length) {
        senses[idx].translation = section.trim();
      }
    }
  }

  // 确保第一个 sense 有 translation
  if (!senses[0].translation) {
    senses[0].translation = translation.split('\n')[0].trim();
  }

  return senses;
}

// ============ Exchange 解析 ============
// 格式: "s:books,p:booked,3:books,i:booking,d:booked"
// s=plural, p=past, 3=3rd person, i=ing, d=past participle

function parseExchange(exchange) {
  if (!exchange || !exchange.trim()) return null;

  const result = {};
  const parts = exchange.split(',');
  for (const part of parts) {
    const [key, value] = part.split(':');
    if (!key || !value) continue;
    switch (key.trim()) {
      case 's': result.plural = value; break;
      case 'p': result.past = value; break;
      case '3': result['3rd'] = value; break;
      case 'i': result.participle = value; break;
      case 'd': result.past_participle = value; break;
      case 'r': result.comparative = value; break;
      case 't': result.superlative = value; break;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ============ Standard Level 分级 ============
// 基于排名: COCA rank > BNC rank > ECDICT frq
// Level 0: rank 1-500 (最核心)
// Level 1: rank 501-1000
// Level 2: rank 1001-2000
// Level 3: rank 2001-3000
// Level 4: rank 3001-5000
// Level 5: rank 5001-8000
// Level 6: rank 8001-12000
// Level 7: rank 12001-20000
// Level 8: rank 20001-50000
// Level 9: rank 50000+ 或无排名

function calcStandardLevel(cocaRank, bnc, frq) {
  // 优先用 COCA rank
  const rank = cocaRank || bnc || frq;
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

// ============ 主流程 ============
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

  const sourceArg = args.find(a => a.startsWith('--source='));
  const sourcePath = sourceArg ? path.resolve(sourceArg.split('=')[1]) : ECDICT_CSV;

  console.log('=== ECDICT Importer ===');
  console.log('Source:', sourcePath);
  console.log('Dry run:', dryRun);
  if (limit !== Infinity) console.log('Limit:', limit);

  if (!fs.existsSync(sourcePath)) {
    console.error('ERROR: Source file not found:', sourcePath);
    process.exit(1);
  }

  // 确保数据库已初始化
  const db = getDictDb();

  // 准备写入语句
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO dictionary
    (word_id, lemma, pos, translation, definition_en, phonetic_us, phonetic_uk,
     static_frequency, standard_level, collocations, example_sentences, senses, exchange, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      insertStmt.run(
        e.word_id, e.lemma, e.pos, e.translation, e.definition_en,
        e.phonetic_us, e.phonetic_uk, e.static_frequency, e.standard_level,
        e.collocations, e.example_sentences, e.senses, e.exchange, e.extra
      );
    }
  });

  // 读取 CSV
  const fileStream = fs.createReadStream(sourcePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNum = 0;
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let batch = [];
  let currentRecord = null; // 用于处理跨行记录

  const startTime = Date.now();

  for await (const line of rl) {
    lineNum++;

    // 跳过 header
    if (lineNum === 1) continue;

    // 处理跨行记录：如果当前行不以引号开头（即新记录），处理上一条
    if (currentRecord && !line.match(/^["']?[a-zA-Z'-]/)) {
      // 这是上一行的延续（definition 中的换行）
      currentRecord.raw += '\n' + line;
      continue;
    }

    // 处理上一条完整记录
    if (currentRecord) {
      const result = processRecord(currentRecord);
      if (result) {
        batch.push(result);
        imported++;
      } else {
        skipped++;
      }

      // 批量写入
      if (batch.length >= BATCH_SIZE) {
        if (!dryRun) insertMany(batch);
        process.stdout.write(`\rImported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
        batch = [];
      }
    }

    // 开始新记录
    currentRecord = { raw: line, lineNum };

    if (imported + skipped >= limit) break;
  }

  // 处理最后一条
  if (currentRecord) {
    const result = processRecord(currentRecord);
    if (result) {
      batch.push(result);
      imported++;
    } else {
      skipped++;
    }
  }

  // 写入剩余
  if (batch.length > 0 && !dryRun) {
    insertMany(batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Time:     ${elapsed}s`);
  if (dryRun) console.log('(Dry run - no data written)');
}

// ============ 处理单条记录 ============
function processRecord(record) {
  try {
    const fields = parseCSVLine(record.raw);
    if (fields.length < 10) return null;

    const word = fields[0].trim();
    const phonetic = fields[1].trim() || null;
    const definition = fields[2].trim() || '';
    const translation = fields[3].trim() || null;
    const pos = fields[4].trim() || null;
    const collins = fields[5].trim() || null;
    const oxford = fields[6].trim() || null;
    const tag = fields[7].trim() || null;
    const bnc = parseInt(fields[8]) || 0;
    const frq = parseInt(fields[9]) || 0;
    const exchange = fields[10] ? fields[10].trim() : null;
    const detail = fields[11] ? fields[11].trim() : null;
    const audio = fields[12] ? fields[12].trim() : null;

    // 过滤
    if (shouldSkip(word, pos, definition)) return null;

    // 解析 POS 和 senses
    const senses = parsePosFromDef(definition);
    distributeTranslation(translation, senses);

    // 主 POS：优先用 pos 字段，否则取第一个 sense 的 pos
    const primaryPos = pos || (senses[0] && senses[0].pos) || null;

    // 主 translation：取第一个 sense 的 translation
    const primaryTranslation = senses[0]?.translation || translation;

    // 主 definition_en：取第一个 sense 的 definition_en
    const primaryDefinition = senses[0]?.definition_en || definition;

    // 解析 exchange
    const inflections = parseExchange(exchange);

    // 构建 senses JSON
    const sensesJson = senses.map((s, idx) => ({
      pos: s.pos,
      translation: s.translation,
      definition_en: s.definition_en,
      frequency: senses.length === 1 ? 1.0 : (senses.length - idx) / senses.length,
      inflections: idx === 0 && inflections ? inflections : undefined,
    }));

    // 提取音标：ECDICT 只有一个 phonetic 字段，尝试区分英美
    let phonetic_us = null, phonetic_uk = null;
    if (phonetic) {
      // 格式可能是 "/wɒtʃ/" 或 "/wɒtʃ/ /wɑːtʃ/"（英美）
      const parts = phonetic.split(/\s+\/\s*/).filter(p => p.startsWith('/'));
      if (parts.length >= 2) {
        phonetic_us = parts[0];
        phonetic_uk = parts[1];
      } else if (parts.length === 1) {
        phonetic_us = parts[0];
      } else {
        phonetic_us = phonetic;
      }
    }

    // 计算 standard_level（此时还没有 COCA rank，先用 bnc/frq）
    const standardLevel = calcStandardLevel(null, bnc, frq);

    // 取最高排名作为 static_frequency（存排名值）
    const bestRank = bnc || frq || 0;

    // extra 字段存扩展信息
    const extra = {};
    if (collins) extra.collins = collins;
    if (oxford) extra.oxford = oxford;
    if (tag) extra.tag = tag;
    if (detail) extra.detail = detail;
    if (audio) extra.audio = audio;

    return {
      word_id: word.toLowerCase(),
      lemma: word.toLowerCase(),
      pos: primaryPos,
      translation: primaryTranslation,
      definition_en: primaryDefinition,
      phonetic_us,
      phonetic_uk,
      static_frequency: bestRank,
      standard_level: standardLevel,
      collocations: '[]',
      example_sentences: '[]',
      senses: JSON.stringify(sensesJson),
      exchange: exchange || null,
      extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
    };
  } catch (e) {
    errors++;
    if (errors <= 10) {
      console.error(`\nError at line ${record.lineNum}:`, e.message);
    }
    return null;
  }
}

// 全局 errors 计数器
let errors = 0;

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

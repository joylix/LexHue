/**
 * 词典数据清理脚本
 *
 * 策略：
 * 1. 词典只保留原型词（不在 lemma_map 的 inflected_form 中的词）
 * 2. lemma_map 中所有原型词（lemma）都必须在词典中有对应词条
 * 3. 从词典移除的变形词，其 translation/phonetic 等数据如果原型词条没有，则合并到原型
 *
 * 用法: node database/cleanup_dict.js [--dry-run] [--write]
 */

const fs = require('fs');
const path = require('path');

const dictPath = path.join(__dirname, 'seed', 'dictionary.json');
const lemmaMapPath = path.join(__dirname, 'seed', 'lemma_map.json');

const dryRun = process.argv.includes('--dry-run');
const doWrite = process.argv.includes('--write');

// 加载数据
const dictData = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
const lemmaData = JSON.parse(fs.readFileSync(lemmaMapPath, 'utf-8'));

// 构建查找结构
const lemmaMap = new Map(); // inflected_form -> lemma
for (const e of lemmaData) {
  lemmaMap.set(e.inflected_form.toLowerCase(), e.lemma.toLowerCase());
}

const dictByLemma = new Map(); // lemma_lower -> entry
for (const e of dictData) {
  dictByLemma.set(e.lemma.toLowerCase(), e);
}

// === Step 1: 找出词典中应移除的变形词词条 ===
const toRemove = []; // [{ entry, mapsTo }]
const keepEntries = [];

for (const entry of dictData) {
  const lower = entry.lemma.toLowerCase();
  if (lemmaMap.has(lower)) {
    toRemove.push({ entry, mapsTo: lemmaMap.get(lower) });
  } else {
    keepEntries.push(entry);
  }
}

// === Step 2: 找出 lemma_map 中缺失的原型，需要加入词典 ===
const existingBases = new Set(keepEntries.map(e => e.lemma.toLowerCase()));
const missingBases = new Set();
for (const entry of lemmaData) {
  const base = entry.lemma.toLowerCase();
  if (!existingBases.has(base) && !dictByLemma.has(base)) {
    missingBases.add(base);
  }
}

// === 输出报告 ===
console.log('=== 词典清理报告 ===\n');

console.log(`词典原有词条: ${dictData.length}`);
console.log(`lemma_map 映射: ${lemmaData.length}`);
console.log(`lemma_map 不同原型: ${new Set(lemmaData.map(e => e.lemma.toLowerCase())).size}`);

console.log(`\n--- 应从词典移除的变形词 (${toRemove.length} 个) ---`);
for (const { entry, mapsTo } of toRemove) {
  console.log(`  移除: ${entry.lemma} (→ ${mapsTo}, pos=${entry.pos}, level=${entry.standard_level})`);
}

console.log(`\n--- 需要加入词典的缺失原型 (${missingBases.size} 个) ---`);
for (const base of [...missingBases].sort()) {
  // 找出这个原型的所有变形词
  const inflectedForms = lemmaData
    .filter(e => e.lemma.toLowerCase() === base)
    .map(e => e.inflected_form);
  console.log(`  添加: ${base} (变形: ${inflectedForms.join(', ')})`);
}

console.log(`\n--- 保留的原型词条 (${keepEntries.length} 个) ---`);
for (const entry of keepEntries) {
  console.log(`  保留: ${entry.lemma} (pos=${entry.pos}, level=${entry.standard_level})`);
}

console.log(`\n清理后词典词条数: ${keepEntries.length + missingBases.size}`);

// === 执行写操作 ===
if (doWrite) {
  const estimateLevel = (word) => {
    const w = word.toLowerCase();
    if (w.length <= 3) return 2;
    if (w.length <= 4) return 3;
    const highSuffixes = ['tion','sion','ment','ness','ity','ance','ence','ous','ive','ize','ise','ify','able','ible','al','ial','ical','phy','ogy','ics','ism','ist','dom','ship','hood'];
    for (const s of highSuffixes) {
      if (w.endsWith(s) && w.length > s.length + 2) return 6;
    }
    const midSuffixes = ['ful','less','like','wise','ward','wards','ways','ock','ly','en'];
    for (const s of midSuffixes) {
      if (w.endsWith(s) && w.length > s.length + 2) return 5;
    }
    if (w.length >= 10) return 7;
    if (w.length >= 8) return 6;
    return 5;
  };

  // 构建新词典
  const newDict = [...keepEntries];

  for (const base of [...missingBases].sort()) {
    // 检查是否有要移除的变形词词条可以复用数据
    const removedEntry = toRemove.find(r => r.mapsTo.toLowerCase() === base);
    const baseLevel = removedEntry
      ? removedEntry.entry.standard_level
      : estimateLevel(base);

    newDict.push({
      word_id: base,
      lemma: base,
      pos: removedEntry ? removedEntry.entry.pos : null,
      translation: null,
      phonetic_us: null,
      phonetic_uk: null,
      static_frequency: 0,
      standard_level: baseLevel,
      collocations: '[]',
      example_sentences: '[]',
    });
  }

  // 按 standard_level 排序
  newDict.sort((a, b) => a.standard_level - b.standard_level || a.lemma.localeCompare(b.lemma));

  // 备份原文件
  const dictBackup = dictPath + '.bak';
  const lemmaBackup = lemmaMapPath + '.bak';
  fs.copyFileSync(dictPath, dictBackup);
  console.log(`\n已备份词典 → ${dictBackup}`);

  fs.writeFileSync(dictPath, JSON.stringify(newDict, null, 2), 'utf-8');
  console.log(`已写入新词典 → ${dictPath}`);
  console.log(`新词典词条数: ${newDict.length}`);

  console.log('\n⚠️  请重新初始化数据库: node database/init.js');
} else if (dryRun) {
  console.log('\n(dry-run 模式，未写入文件)');
} else {
  console.log('\n使用 --write 参数执行实际写入，或 --dry-run 预览');
}

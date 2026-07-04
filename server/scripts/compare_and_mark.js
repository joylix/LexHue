const fs = require('fs');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const COD_JSON = '/home/joylix/projects/dict/简明牛津英语词典第11版.json';
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const OUTPUT_ECDICT = '/home/joylix/projects/dict/ecdict_marked.csv';

// 加载新牛津
console.log('Loading NIOD...');
const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
const niodWords = new Set();
for (const k of Object.keys(niod)) {
  if (niod[k] && Object.keys(niod[k]).length > 0) {
    niodWords.add(k.toLowerCase());
  }
}
console.log('NIOD words:', niodWords.size);

// 加载简明牛津
console.log('Loading COD...');
const cod = JSON.parse(fs.readFileSync(COD_JSON, 'utf-8'));
const codEntries = cod.entries || cod;
const codWords = new Set();
for (const e of codEntries) {
  if (e.word && e.definition && !e.definition.startsWith('@@@LINK')) {
    codWords.add(e.word.toLowerCase());
  }
}
console.log('COD words:', codWords.size);

// 计算并集
const oxfordUnion = new Set([...niodWords, ...codWords]);
console.log('Oxford union (NIOD ∪ COD):', oxfordUnion.size);

// 解析 ECDICT CSV
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

// 扫描 ECDICT 并标记
console.log('\nScanning ECDICT...');
const ecdictContent = fs.readFileSync(ECDICT_CSV, 'utf-8');
const ecdictLines = ecdictContent.split(/\r?\n/);

const output = fs.createWriteStream(OUTPUT_ECDICT);
output.write('word,in_oxford,in_niod,in_cod,pos,bnc,frq\n');

let total = 0, inOxford = 0, notInOxford = 0;
let ecdictCurrent = null;

for (let i = 1; i < ecdictLines.length; i++) {
  const line = ecdictLines[i];
  
  if (ecdictCurrent && !line.match(/^["']?[a-zA-Z'-]/)) {
    ecdictCurrent += '\n' + line;
    continue;
  }

  if (ecdictCurrent) {
    const fields = parseCSVLine(ecdictCurrent);
    if (fields.length >= 10) {
      const word = fields[0].trim();
      const wordLower = word.toLowerCase();
      const pos = fields[4].trim() || '';
      const bnc = parseInt(fields[8]) || 0;
      const frq = parseInt(fields[9]) || 0;

      const inNiod = niodWords.has(wordLower) ? 1 : 0;
      const inCod = codWords.has(wordLower) ? 1 : 0;
      const inOxf = oxfordUnion.has(wordLower) ? 1 : 0;
      
      total++;
      if (inOxf) inOxford++;
      else notInOxford++;

      const escapedWord = word.includes(',') ? '"' + word + '"' : word;
      output.write(`${escapedWord},${inOxf},${inNiod},${inCod},${pos},${bnc},${frq}\n`);
    }
  }
  ecdictCurrent = line;
}

// 最后一条
if (ecdictCurrent) {
  const fields = parseCSVLine(ecdictCurrent);
  if (fields.length >= 10) {
    const word = fields[0].trim();
    const wordLower = word.toLowerCase();
    const pos = fields[4].trim() || '';
    const bnc = parseInt(fields[8]) || 0;
    const frq = parseInt(fields[9]) || 0;
    const inNiod = niodWords.has(wordLower) ? 1 : 0;
    const inCod = codWords.has(wordLower) ? 1 : 0;
    const inOxf = oxfordUnion.has(wordLower) ? 1 : 0;
    total++;
    if (inOxf) inOxford++;
    else notInOxford++;
    const escapedWord = word.includes(',') ? '"' + word + '"' : word;
    output.write(`${escapedWord},${inOxf},${inNiod},${inCod},${pos},${bnc},${frq}\n`);
  }
}

output.end();

console.log('\n=== ECDICT 标记结果 ===');
console.log('Total ECDICT words:', total);
console.log('In Oxford union:', inOxford, '(' + (100*inOxford/total).toFixed(1) + '%)');
console.log('Not in Oxford:', notInOxford, '(' + (100*notInOxford/total).toFixed(1) + '%)');
console.log('Output:', OUTPUT_ECDICT);

// 检查 COCA 60000 覆盖
const COCA_CSV = '/home/joylix/projects/dict/word frequency list 60000 English.csv';
const cocaContent = fs.readFileSync(COCA_CSV, 'utf-8');
const cocaLines = cocaContent.split(/\r?\n/);

let cocaTotal = 0, cocaInOxford = 0, cocaMissingOxford = 0;
const missingSamples = [];
for (let i = 1; i < cocaLines.length; i++) {
  const parts = cocaLines[i].trim().split(',');
  if (parts.length < 4) continue;
  const word = parts.slice(2, parts.length - 1).join(',').trim().toLowerCase();
  if (!word || word.startsWith('(') || word.endsWith(')')) continue;
  cocaTotal++;
  if (oxfordUnion.has(word)) cocaInOxford++;
  else { cocaMissingOxford++; if (missingSamples.length < 20) missingSamples.push(word); }
}

console.log('\n=== COCA 60000 vs 牛津并集 ===');
console.log('COCA words (excl paren):', cocaTotal);
console.log('In Oxford union:', cocaInOxford, '(' + (100*cocaInOxford/cocaTotal).toFixed(1) + '%)');
console.log('Missing Oxford:', cocaMissingOxford, '(' + (100*cocaMissingOxford/cocaTotal).toFixed(1) + '%)');
console.log('Missing samples:', missingSamples.join(', '));

// 检查缺失词在 ECDICT 中是否有
const ecdictWords = new Set();
for (let i = 1; i < ecdictLines.length; i++) {
  const firstComma = ecdictLines[i].indexOf(',');
  if (firstComma < 0) continue;
  ecdictWords.add(ecdictLines[i].substring(0, firstComma).trim().toLowerCase());
}
let missingInEcdict = 0;
for (const w of missingSamples) {
  if (ecdictWords.has(w)) missingInEcdict++;
}
console.log('Missing Oxford but in ECDICT:', missingInEcdict, '/', missingSamples.length);

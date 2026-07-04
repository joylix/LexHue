/**
 * 步骤 1: 比较牛津和 ECDICT 词表，给 ECDICT 词打标记
 * 输出：ecdict_with_oxford_mark.csv
 * 格式：word, in_oxford, ecdict_pos, ecdict_bnc, ecdict_frq
 */
const fs = require('fs');
const readline = require('readline');

const NIOD_JSON = '/home/joylix/projects/dict/新牛津英汉双解大词典.json';
const ECDICT_CSV = '/home/joylix/projects/dict/ECDICT/ecdict.csv';
const OUTPUT_CSV = '/home/joylix/projects/dict/ecdict_marked.csv';

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

async function main() {
  console.log('=== Step 1: Compare NIOD vs ECDICT ===');

  // 加载新牛津词表
  console.log('Loading NIOD...');
  const niod = JSON.parse(fs.readFileSync(NIOD_JSON, 'utf-8'));
  const niodWords = new Set();
  for (const k of Object.keys(niod)) {
    if (niod[k] && Object.keys(niod[k]).length > 0) {
      niodWords.add(k.toLowerCase());
    }
  }
  console.log('NIOD words:', niodWords.size);

  // 扫描 ECDICT，比较并输出
  console.log('Scanning ECDICT...');
  const ecdictStream = fs.createReadStream(ECDICT_CSV, { encoding: 'utf-8' });
  const ecdictRl = readline.createInterface({ input: ecdictStream, crlfDelay: Infinity });

  const output = fs.createWriteStream(OUTPUT_CSV);
  output.write('word,in_oxford,pos,bnc,frq\n');

  let total = 0, inOxford = 0, notInOxford = 0;
  let ecdictCurrent = null;
  let lineNum = 0;

  for await (const line of ecdictRl) {
    lineNum++;
    if (lineNum === 1) continue;

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

        const inOxf = niodWords.has(wordLower) ? 1 : 0;
        total++;
        if (inOxf) inOxford++;
        else notInOxford++;

        // 转义 word 中的逗号
        const escapedWord = word.includes(',') ? '"' + word + '"' : word;
        output.write(`${escapedWord},${inOxf},${pos},${bnc},${frq}\n`);
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
      const inOxf = niodWords.has(wordLower) ? 1 : 0;
      total++;
      if (inOxf) inOxford++;
      else notInOxford++;
      const escapedWord = word.includes(',') ? '"' + word + '"' : word;
      output.write(`${escapedWord},${inOxf},${pos},${bnc},${frq}\n`);
    }
  }

  output.end();
  await new Promise(resolve => output.on('finish', resolve));

  console.log(`\n=== Done ===`);
  console.log(`Total ECDICT words: ${total}`);
  console.log(`In NIOD (Oxford): ${inOxford} (${(100*inOxford/total).toFixed(1)}%)`);
  console.log(`Not in NIOD: ${notInOxford} (${(100*notInOxford/total).toFixed(1)}%)`);
  console.log(`Output: ${OUTPUT_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });

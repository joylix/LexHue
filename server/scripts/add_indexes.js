const Database = require('better-sqlite3');
const db = new Database('data/dictionary.db');
db.pragma('journal_mode = WAL');

// 检查现有索引
const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dictionary'").all();
console.log('Existing indexes:', existing.map(i => i.name));

// 创建 LOWER(lemma) 索引
console.time('idx_dict_lemma_lower');
db.exec("CREATE INDEX IF NOT EXISTS idx_dict_lemma_lower ON dictionary(LOWER(lemma))");
console.timeEnd('idx_dict_lemma_lower');

// 创建复合索引
console.time('idx_dict_sort_lemma');
db.exec("CREATE INDEX IF NOT EXISTS idx_dict_sort_lemma ON dictionary(sort_order, LOWER(lemma))");
console.timeEnd('idx_dict_sort_lemma');

console.time('idx_dict_level_sort');
db.exec("CREATE INDEX IF NOT EXISTS idx_dict_level_sort ON dictionary(standard_level, sort_order)");
console.timeEnd('idx_dict_level_sort');

// 验证
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dictionary'").all();
console.log('All indexes now:', indexes.map(i => i.name));

db.close();
console.log('Done!');

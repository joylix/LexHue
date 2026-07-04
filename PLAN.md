# LexHue 数据架构重构规划

> 编制日期：2026-06-21
> 涵盖：ECDICT/COCA 数据导入、多义词处理、可插拔词典架构

---

## 一、需求总结

### 1.1 根本问题
当前 dictionary 表是"扁平"结构：一个 word_id 对应一行，pos/translation/phonetic 都是单值。这无法表达英语中普遍存在的**一词多义**和**一词多词性**现象。

### 1.2 核心目标
- ECDICT 30万词条作为主数据源，COCA 词频校准难度等级
- 支持一个单词多个词性、多个含义（senses），每个 sense 有独立的 translation/phonetic/examples
- 文章阅读时自动根据上下文判断词性（best_sense）
- 前端展示按词频排序的义项，用户可手动切换
- **可插拔词典架构**：未来可切换牛津、朗文等其他词典数据源

### 1.3 数据源
| 数据源 | 词条数 | 提供内容 | 用途 |
|--------|--------|----------|------|
| ECDICT | 30万+ | word, phonetic, definition, translation, pos, exchange, collins, oxford, tag, bnc, frq | 主数据源 |
| COCA 5000 | 5000 | rank, lemma, PoS, freq, 各genre分布 | 校准 standard_level |
| lemma.en.txt | 18.6万词/8.4万组 | 词形→lemma 映射 | 替代手写 lemma_map.json |

---

## 二、数据库改造

### 2.1 dictionary 表（已有 senses 列，不改结构）

```sql
CREATE TABLE dict.dictionary (
    word_id TEXT PRIMARY KEY,       -- 小写单词形式
    lemma TEXT NOT NULL,            -- 原型（同 word_id 或归一化形式）
    pos TEXT,                       -- 主词性（频率最高的）
    translation TEXT,               -- 主中文释义（逗号分隔）
    definition_en TEXT,             -- 主英文释义
    phonetic_us TEXT,               -- 音标
    phonetic_uk TEXT,               -- 英式音标（暂留空）
    static_frequency INTEGER,       -- 词频原始值（COCA rank 或 ECDICT frq）
    standard_level INTEGER NOT NULL CHECK(standard_level BETWEEN 0 AND 9),
    collocations TEXT,              -- JSON 数组
    example_sentences TEXT,         -- JSON 数组
    senses TEXT,                    -- JSON：多义项数组（核心字段）
    exchange TEXT,                  -- ECDICT 原始 exchange 字符串
    extra TEXT                      -- JSON：collins/oxford/tag/bnc 等扩展信息
);
```

### 2.2 senses JSON 结构（核心改造）

```json
[
  {
    "pos": "noun",
    "translation": "手表；看守；监视",
    "definition_en": "a small portable timepiece...",
    "phonetic": "/wɒtʃ/",
    "frequency": 0.35,
    "examples": ["He checked his watch.", "The guard kept watch."],
    "inflections": {
      "plural": "watches"
    }
  },
  {
    "pos": "verb",
    "translation": "观看；注视；看守",
    "definition_en": "to look at carefully...",
    "phonetic": "/wɒtʃ/",
    "frequency": 0.65,
    "examples": ["I watch TV every night.", "She watched the children."],
    "inflections": {
      "3rd": "watches",
      "past": "watched",
      "participle": "watching",
      "past_participle": "watched"
    }
  }
]
```

**排序规则**：按 frequency 降序，第一个是 primary_sense。

### 2.3 lemma_map 表（已有，扩充数据）

从 ECDICT lemma.en.txt 导入 8.4 万组映射，替代当前手写的 340 条。

### 2.4 新增：词典源元数据表

```sql
CREATE TABLE dict.dictionary_sources (
    source_id TEXT PRIMARY KEY,     -- 'ecdict', 'oxford', 'longman' 等
    source_name TEXT NOT NULL,      -- 显示名称
    version TEXT,                   -- 数据版本
    import_date TEXT,               -- 导入时间
    word_count INTEGER,             -- 词条数
    is_active INTEGER DEFAULT 1     -- 是否启用
);
```

---

## 三、standard_level 分级方案

### 3.1 基于 COCA rank（有 COCA 数据时）

| Level | COCA Rank | 说明 |
|-------|-----------|------|
| 0 | 1 - 500 | 最核心词（the, be, and, of, to...） |
| 1 | 501 - 1000 | 极高频词 |
| 2 | 1001 - 2000 | 高频词 |
| 3 | 2001 - 3000 | 中高频词 |
| 4 | 3001 - 5000 | 中等词 |
| 5 | 5001 - 8000 | 中低频词（COCA 以外用 ECDICT frq 估算） |
| 6 | 8001 - 12000 | 低频词 |
| 7 | 12001 - 20000 | 较生僻词 |
| 8 | 20001 - 30000 | 生僻词 |
| 9 | 30000+ 或未收录 | 极生僻词 |

### 3.2 基于 ECDICT frq（无 COCA 数据时回退）

ECDICT frq 是当代语料库词频排名，映射关系：
- frq ≤ 1000 → Level 1
- frq ≤ 3000 → Level 3
- frq ≤ 5000 → Level 4
- frq ≤ 10000 → Level 5
- frq ≤ 20000 → Level 6
- frq ≤ 30000 → Level 7
- frq ≤ 50000 → Level 8
- frq > 50000 或未收录 → Level 9

---

## 四、可插拔词典架构

### 4.1 架构设计

```
server/
├── dictionaries/                  # 词典数据源目录
│   ├── base/                     # 基础抽象层
│   │   ├── DictionarySource.js   # 词典源接口定义
│   │   └── SenseNormalizer.js    # senses 格式标准化
│   ├── ecdict/                   # ECDICT 数据源
│   │   ├── importer.js           # CSV → DB 导入
│   │   ├── parser.js             # ECDICT 格式解析
│   │   └── data/                 # 原始数据文件
│   │       ├── ecdict.csv
│   │       └── lemma.en.txt
│   ├── coca/                     # COCA 词频数据
│   │   ├── importer.js
│   │   └── data/
│   │       └── COCA_WordFrequency.csv
│   └── oxford/                   # 牛津词典（未来）
│       ├── importer.js
│       └── data/
│           └── ...
```

### 4.2 词典源接口

每个词典源实现统一接口：

```javascript
class DictionarySource {
    // 返回源标识和元数据
    getSourceId()          // 'ecdict', 'oxford', ...
    getSourceName()        // 'ECDICT 英汉双解词典'
    getVersion()           // '1.0.0'

    // 导入数据到 dictionary.db
    async import(db, options)  // 返回导入统计

    // 将原始词条转换为标准 senses 格式
    normalizeSenses(rawEntry)  // 返回标准化 senses 数组

    // 计算 standard_level
    calculateLevel(rawEntry, cocaData)  // 返回 0-9
}
```

### 4.3 导入流程

```
1. 用户下载数据文件到 dictionaries/<source>/data/
2. 运行导入命令：npm run import-dict -- --source=ecdict
3. importer 解析原始文件 → 标准化 senses → 写入 dictionary.db
4. 运行校准命令：npm run calibrate-level -- --source=coca
5. COCA importer 读取词频 → 更新 standard_level
6. 导入 lemma.en.txt → lemma_map 表
```

### 4.4 多源共存策略

- 每个词条记录 `source_id` 标记数据来源
- 查询时优先返回 `is_active=1` 的源数据
- 未来可支持多源合并（如 ECDICT 提供释义 + 牛津提供例句）

---

## 五、后端改造

### 5.1 数据导入脚本

新建 `server/scripts/import-ecdict.js`：
- 解析 ecdict.csv（注意：CSV 字段含换行符，需特殊处理）
- 按 pos 字段分割多词性 → 生成 senses JSON
- 解析 exchange 字段 → 生成 inflections
- 批量写入 dictionary.db（事务 + 分批）
- 进度显示和断点续传

新建 `server/scripts/import-lemma.js`：
- 解析 lemma.en.txt
- 批量写入 lemma_map 表

新建 `server/scripts/calibrate-level.js`：
- 读取 COCA_WordFrequency.csv
- 按 rank 更新 standard_level
- 对无 COCA 数据的词，按 ECDICT frq 估算

### 5.2 API 改造

**GET /api/dictionary/:word_id** 返回格式：
```json
{
  "word_id": "watch",
  "lemma": "watch",
  "pos": "verb",
  "translation": "观看；注视",
  "phonetic_us": "/wɒtʃ/",
  "standard_level": 2,
  "senses": [
    { "pos": "verb", "translation": "观看", "frequency": 0.65, "examples": [...] },
    { "pos": "noun", "translation": "手表", "frequency": 0.35, "examples": [...] }
  ],
  "primary_sense": { "pos": "verb", ... },
  "source": "ecdict"
}
```

**POST /api/dictionary/auto-add** 改造：
- 优先查本地 dictionary.db（已有 30 万词）
- 本地找不到时，回退到 Free Dictionary API
- 不再依赖 API 作为主要数据源

### 5.3 textParser 改造

- lemmatize 步骤：从本地 dictionary.db 查询时直接获取 senses
- disambiguateSenses 步骤：基于上下文 POS 模式匹配 best_sense
- token 数据结构增加：
  - `best_sense`: 上下文匹配的最佳义项
  - `senses`: 所有义项（按 frequency 排序）
  - `primary_sense`: 频率最高的义项

---

## 六、前端改造

### 6.1 WordToken 组件

- tooltip 显示 `best_sense.translation + (pos)`，如 "观看(v.)"
- 鼠标悬停时显示完整释义预览

### 6.2 VocabDetailPopup 组件

- 顶部显示 primary_sense（高亮）
- 下方列出所有 senses 标签页，按 frequency 排序
- 每个 sense 显示：pos badge + translation + phonetic + examples
- 用户可点击切换 active sense

### 6.3 Reading 页面

- 点击单词时，VocabDetailPopup 自动定位到 best_sense
- 用户可在弹窗中切换到其他义项

---

## 七、实施顺序

### Phase 1：数据导入（优先级最高）
1. 创建 dictionaries/ 目录结构
2. 编写 ECDICT importer（CSV 解析 + senses 生成 + 批量写入）
3. 编写 lemma.en.txt importer
4. 编写 COCA level 校准脚本
5. 测试导入 30 万词条

### Phase 2：后端 API 改造
6. 改造 dictionary detail API 返回 senses
7. 改造 auto-add API 优先查本地
8. 改造 textParser 支持 best_sense

### Phase 3：前端改造
9. WordToken tooltip 显示 best_sense
10. VocabDetailPopup 多义项展示
11. Reading 页面集成

### Phase 4：可插拔架构
12. 抽象 DictionarySource 接口
13. 将 ECDICT importer 迁移到 dictionaries/ecdict/
14. 预留 oxford/longman 接口

---

## 八、文件清单

### 新增文件
```
server/
├── scripts/
│   ├── import-ecdict.js          # ECDICT 数据导入
│   ├── import-lemma.js            # lemma 映射导入
│   └── calibrate-level.js         # COCA 词频校准
├── dictionaries/
│   ├── base/
│   │   ├── DictionarySource.js    # 词典源接口
│   │   └── SenseNormalizer.js     # senses 标准化
│   ├── ecdict/
│   │   ├── importer.js
│   │   ├── parser.js
│   │   └── data/                  # 原始数据（gitignore）
│   └── coca/
│       ├── importer.js
│       └── data/
└── database/
    └── seed/
        └── sources.json           # 词典源元数据
```

### 修改文件
```
server/
├── database/
│   ├── connection.js              # 新增 senses/exchange/extra 列
│   └── migrate.js                 # v4 迁移
├── services/
│   ├── textParser.js              # senses 解析 + best_sense
│   ├── lemmatizer.js              # 从本地 DB 获取 senses
│   └── senseDisambiguation.js     # 上下文消歧（增强）
├── routes/
│   └── dictionary.js              # API 返回 senses
client/src/
├── components/
│   ├── WordToken.jsx              # tooltip 显示 best_sense
│   └── VocabDetailPopup.jsx       # 多义项展示
└── pages/
    └── VocabDetail.jsx            # 多义项展示
```

# LexHue 词典功能扩充 工作方案

> 编制日期：2026-06-23
> 基于：PLAN.md（2026-06-21）+ 数据源分析 + 需求讨论

---

## 一、核心设计决策

### 1.1 词频数据处理原则
- **词频 rank 不存储、不显示**：COCA/BNC 原始排名仅用于计算 standard_level（0-9），导入后丢弃
- **列表排序方式**：仅支持两种——①按难度等级（standard_level 升序）②按字母顺序（lemma）
- **去掉 coca_rank / bnc_rank 字段的存储和前端展示**

### 1.2 近义词/反义词策略
- **先建框架，后补数据**：数据库建表、前端留展示区域、导入脚本预留接口
- **数据来源**：ECDICT/resemble.txt（近义词辨析）→ 后续可补充更多来源
- **关系类型**：synonym（近义词）、antonym（反义词）

### 1.3 数据源使用策略

| 数据源 | 用途 | 处理方式 |
|--------|------|----------|
| ECDICT/ecdict.csv | 主词典数据（30万词） | 导入 dictionary 表，计算 standard_level |
| ECDICT/lemma.en.txt | lemma 映射（8.4万组） | 导入 lemma_map 表 |
| ECDICT/resemble.txt | 近义词辨析（8741条） | 导入 word_relation 表 |
| ECDICT/wordroot.txt | 词根数据（1.4万条） | 预留，后续版本使用 |
| COCA 60000 CSV | 校准 standard_level | 仅用于计算，不存储原始 rank |
| COCA Frequency.json | 补充新词 + POS 全称 | 与 CSV 合并使用 |
| coca20000_collins.txt | 柯林斯双解 + 例句 | 后续版本使用 |
| coca-vocabulary-20000 MD | 音标 + 中文释义补充 | 后续版本使用 |

---

## 二、数据库改造

### 2.1 dictionary 表调整

**去掉字段**（不再存储）：
- `coca_rank` — 不再存储原始 COCA 排名
- `bnc_rank` — 不再存储原始 BNC 排名

**保留字段**（现有）：
- `word_id`, `lemma`, `pos`, `translation`, `definition_en`
- `phonetic_us`, `phonetic_uk`
- `static_frequency` — 保留，但仅内部使用（可存 COCA rank 用于排序计算，不对外展示）
- `standard_level` — 核心字段，0-9 难度等级
- `senses` — JSON 多义项
- `exchange` — 词形变化
- `extra` — JSON 扩展信息（collins/oxford/tag 等）
- `collocations`, `example_sentences`

**说明**：static_frequency 字段继续存储 COCA rank 值，仅用于内部排序计算（难度相同时的次级排序），不对外展示。

### 2.2 新增 word_relation 表

```sql
CREATE TABLE dict.word_relation (
    word_id TEXT NOT NULL,           -- 当前词 word_id
    relation_type TEXT NOT NULL,     -- 'synonym' | 'antonym'
    target_word_id TEXT NOT NULL,    -- 目标词 word_id
    target_lemma TEXT,               -- 目标词 lemma（冗余，方便查询）
    source TEXT DEFAULT 'manual',    -- 数据来源：resemble / manual / ...
    PRIMARY KEY (word_id, relation_type, target_word_id)
);
CREATE INDEX idx_word_rel_target ON dict.word_relation(target_word_id);
```

### 2.3 迁移脚本（v5）

```sql
-- v5: 去掉 coca_rank, bnc_rank 的对外使用
-- 注意：字段保留在表中（兼容旧数据），但 API 不再返回
-- 新增 word_relation 表
```

---

## 三、后端改造

### 3.1 dictionary API 改造

**GET /api/dictionary/search**
- 排序参数：`sort=level`（按难度）| `sort=alpha`（按字母）
- 去掉 coca_rank 排序逻辑
- 返回数据中去掉 coca_rank / bnc_rank 字段

**GET /api/dictionary/:word_id**
- 返回数据中去掉 coca_rank / bnc_rank
- 新增 `synonyms` 数组：`[{ word_id, lemma, pos, translation }]`
- 新增 `antonyms` 数组：`[{ word_id, lemma, pos, translation }]`

**新增 GET /api/dictionary/:word_id/relations**
- 返回该词的所有近义词和反义词
- 参数：`?type=synonym|antonym|all`

### 3.2 导入脚本改造

**import-ecdict.js**
- 去掉 coca_rank / bnc_rank 写入
- static_frequency 继续写入（内部排序用）
- senses 生成逻辑保持不变
- exchange 解析逻辑保持不变

**新增 import-resemble.js**
- 解析 ECDICT/resemble.txt
- 提取近义词组 → 写入 word_relation 表
- 格式：`% word1, word2, word3` → 两两互为近义词

**import-lemma.js**
- 路径修正（当前指向旧路径 `/home/jlx/projects/...`）
- 保持现有逻辑

### 3.3 standard_level 计算逻辑

基于 COCA 60000 CSV 的 rank：
- Level 0: rank 1-500
- Level 1: rank 501-1000
- Level 2: rank 1001-2000
- Level 3: rank 2001-3000
- Level 4: rank 3001-5000
- Level 5: rank 5001-8000
- Level 6: rank 8001-12000
- Level 7: rank 12001-20000
- Level 8: rank 20001-50000
- Level 9: rank 50000+ 或无数据

无 COCA 数据时，基于 ECDICT frq 字段回退。

---

## 四、前端改造

### 4.1 DictionaryManager 页面

**排序切换**：
- 新增排序按钮组：`[按难度] [按字母]`
- 默认：按难度（standard_level 升序）
- 去掉 COCA 排名列

**表格列调整**：
- 去掉：COCA 排名列
- 保留：Word ID、Lemma、POS、释义、等级、操作

### 4.2 VocabDetailPopup 组件

**去掉**：
- COCA 排名显示

**新增**：
- 近义词区域：显示 synonyms 列表，点击可跳转到该词详情
- 反义词区域：显示 antonyms 列表，点击可跳转到该词详情
- 无数据时显示"暂无近义词/反义词"或隐藏该区域

### 4.3 VocabDetail 页面

**去掉**：
- COCA 排名显示

**新增**：
- 近义词/反义词展示区域（同 Popup）

---

## 五、实施顺序

### Phase 1：数据库 + 后端 API（1-2 天）

1. 创建数据库迁移脚本 v5（word_relation 表）
2. 改造 dictionary search API（排序逻辑）
3. 改造 dictionary detail API（去掉 rank，新增 relations）
4. 新增 dictionary/:word_id/relations API
5. 改造 import-ecdict.js（去掉 rank 写入）
6. 新增 import-resemble.js
7. 修正 import-lemma.js 路径
8. 测试导入流程

### Phase 2：数据导入（1 天）

1. 导入 ECDICT lemma.en.txt → lemma_map
2. 导入 ECDICT ecdict.csv → dictionary（30万词）
3. 导入 COCA 60000 CSV → 校准 standard_level
4. 导入 ECDICT resemble.txt → word_relation
5. 验证数据完整性

### Phase 3：前端改造（1 天）

1. DictionaryManager 排序切换 + 去 rank 列
2. VocabDetailPopup 去 rank + 加近义词/反义词
3. VocabDetail 去 rank + 加近义词/反义词
4. 联调测试

### Phase 4：可插拔架构（后续）

1. 抽象 DictionarySource 接口
2. 将 ECDICT importer 迁移到 dictionaries/ecdict/
3. 预留 oxford/longman 接口

---

## 六、文件清单

### 修改文件

```
server/
├── database/
│   ├── migrate.js              # 新增 v5 迁移（word_relation 表）
│   └── connection.js           # 去掉 coca_rank/bnc_rank 相关索引
├── routes/
│   └── dictionary.js           # 改造 search/detail API，新增 relations API
├── scripts/
│   ├── import-ecdict.js        # 去掉 coca_rank/bnc_rank 写入
│   ├── import-lemma.js          # 修正文件路径
│   └── import-resemble.js       # 新增：近义词导入
client/src/
├── pages/
│   ├── DictionaryManager.jsx    # 排序切换，去 rank 列
│   └── VocabDetail.jsx          # 去 rank，加近义词/反义词
└── components/
    └── VocabDetailPopup.jsx     # 去 rank，加近义词/反义词
```

### 新增文件

```
server/scripts/import-resemble.js   # 近义词导入脚本
```

---

## 七、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 导入 30 万词耗时过长 | 开发测试周期长 | 分批导入 + 进度显示 + 断点续传 |
| resemble.txt 近义词解析不准确 | 近义词数据质量差 | 人工抽样校验 + 后续修正 |
| 去掉 rank 后排序体验变差 | 同等级单词顺序混乱 | 同等级内按 lemma 字母排序 |
| 近义词跳转到未导入词 | 404 或空数据 | 跳转前检查词是否存在，不存在则提示 |

---

## 八、验收标准

1. dictionary 表 30 万词条导入成功，standard_level 0-9 分布合理
2. lemma_map 表 8.4 万组映射导入成功
3. word_relation 表有近义词数据（>5000 条）
4. DictionaryManager 可按难度/字母两种方式排序
5. 单词详情页显示近义词/反义词（有数据时）
6. 单词详情页不显示 COCA rank
7. 现有功能（阅读标注、陌生度调整、复习等）不受影响

---

## 九、开发记录：阅读导入与陌生度体系优化（2026-07-04）

### 9.1 文章导入优化

- 将粘贴文章默认上限设为 `10,000` 字符，前端即时显示字符数并在超限时禁用导入，后端同步强制校验。
- 新增网页链接导入能力：
  - 后端新增 `/api/articles/extract-url`，服务端抓取 HTML 并使用 `@mozilla/readability` + `jsdom@22.1.0` 提取主体正文。
  - 增加 URL 安全限制：只允许 HTTP/HTTPS，拒绝本机/内网地址，限制 8 秒超时、2MB HTML、最多 3 次重定向，并仅接受 HTML。
  - 增加英文内容检测，抽取结果会截断到文章上限内，再填入现有正文编辑区供用户确认。
- 前端导入页增加“粘贴文本 / 网页链接”模式切换。

### 9.2 陌生度体系调整

- 将用户陌生度由五档改为四档：`1=精通`、`3=熟识`、`5=浅知/初识`、`7=陌生`。
- 移除原 `依稀` 档位，并将旧数据中的 `9` 迁移并归一为 `7`。
- 后端新增 `server/constants/strangeness.js`，集中维护合法陌生度档位、默认 OOV 陌生度和归一化逻辑。
- 数据库 schema 升级到 v7：
  - `user_vocab.custom_strangeness=9` 映射为 `7`
  - 修改历史中的 `old_strangeness/new_strangeness=9` 映射为 `7`
  - `oov_default_strangeness=9` 映射为 `7`
- 新建数据库的 `custom_strangeness` 约束改为 `IN (1,3,5,7)`。

### 9.3 阅读页统计与难度显示

- 阅读页右侧“页面词汇统计”显示四档数量和占文章唯一单词总数的百分比。
- 说明文案调整：
  - `背景色：表示——系统评估`
  - `前景色：表示——已确认`
- 文章标题前新增醒目的文章难度等级显示。
  - 文章难度按文章自身词汇难度计算：对候选 Level 统计 `standard_level > Level` 的词占文章唯一单词总数比例。
  - 阈值集中为常量：`ARTICLE_DIFFICULTY_MIN_ABOVE_RATIO = 0.01`，`ARTICLE_DIFFICULTY_MAX_ABOVE_RATIO = 0.15`。
  - 顶部显示中的“高于本等级词”是相对文章计算出的难度等级。
- 原文章下方“超纲词汇”改名为“您的生词”：
  - 该区域相对用户自身当前等级计算。
  - 仅展示 `陌生(7)` 与 `初识/浅知(5)` 两类。
  - 分项和总计百分比分母均为文章唯一单词总数。

### 9.4 后端稳定性与维护性

- 修复 `/api/vocab/review` 被 `/:word_id` 动态路由截获的问题。
- 新增 `server/utils/pagination.js`，统一分页参数解析和上限控制。
- 字典和词汇列表改为参数化分页，避免非法 `LIMIT/OFFSET` 拼接。
- 将等级测评预计算逻辑从 `server/index.js` 抽离到 `server/services/levelTextPrecompute.js`。
- 等级测评缓存改为写入 `server/data/level_texts_precomputed.json`，旧 seed 缓存仅作为兼容读取。
- `.gitignore` 增加 `*:Zone.Identifier`，避免 WSL/Windows 元数据文件污染工作区。

### 9.5 验证记录

- `client` 生产构建通过：`npm run build`
- 后端关键文件通过 `node --check`
- 本地数据库已迁移到 `schema_version=7`
- 项目已在本地重启并可通过 `http://localhost:5173/` 访问

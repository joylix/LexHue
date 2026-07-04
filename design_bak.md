# 英语单词学习辅助系统 详细设计说明书（本地单机版 V1.0 Final）

**版本**：1.0 Final  
**编制日期**：2026-05-20  
**对应 SRS**：英语单词学习辅助系统 需求规格说明书（本地单机版） V1.0-Local  

本文档整合了初始详细设计、评审反馈及优化决策，可直接交付 AI 编码与测试。

---

## 1. 概述

系统为个人本地部署的 Web 应用，采用 B/S 架构，后端 Node.js + Express，前端 React + Vite + Tailwind CSS，数据持久化于本地 SQLite。所有核心功能（阅读标注、逐档复习、标签管理等）完全本地运行，无需互联网。静态词典与用户数据物理分离，音频按首字母分目录存放。系统支持数据导出/恢复、版本自动迁移、夜间模式、批量复习等增强特性。

---

## 2. 技术选型

| 层面 | 技术 | 说明 |
|------|------|------|
| 后端运行时 | Node.js 18+ | LTS |
| 后端框架 | Express | 轻量，生态成熟 |
| 数据库引擎 | better-sqlite3 | 同步 API，适合本地单机 |
| 数据库文件 | 双文件：`dictionary.db`（只读） + `userdata.db`（读写） | 静态与动态分离，便于备份 |
| 短语匹配 | 连续短语：Aho-Corasick；可分隔短语：特征触发扫描 | 高性能匹配 |
| 文本分词 | 自研（正则 + 映射表） | 支持连字符、缩约词 |
| 前端框架 | React 18 + React Router | SPA |
| 前端 UI | Tailwind CSS（dark: 变体） + Headless UI | 深色/浅色模式支持 |
| 前端构建 | Vite | |
| 音频播放 | Howler.js | 本地音频文件播放 |
| 数据导出 | JSON / CSV 导出，前端触发下载 | |

---

## 3. 项目结构

```
LexHue/
├── server/
│   ├── package.json
│   ├── index.js                # 入口，启动服务
│   ├── config.js               # 端口、DB路径等
│   ├── database/
│   │   ├── init.js             # 初始化数据库、静态表、用户表
│   │   ├── connection.js       # 获取 db 实例（userdata.db，附加 dictionary.db）
│   │   ├── migrate.js          # schema 版本迁移
│   │   └── seed/               # 初始数据 JSON
│   │       ├── dictionary.json
│   │       ├── lemma_map.json
│   │       ├── abbreviations.json
│   │       ├── phrases.json
│   │       └── level_texts.json
│   ├── routes/
│   │   ├── articles.js
│   │   ├── vocab.js
│   │   ├── tags.js
│   │   ├── annotations.js
│   │   ├── config.js
│   │   ├── export.js
│   │   └── dictionary.js
│   ├── services/
│   │   ├── textParser.js       # 文本解析（含 AC 自动机、短语匹配）
│   │   ├── strangeness.js      # 陌生度计算逻辑
│   │   ├── levelTest.js        # 自适应测评逻辑
│   │   └── exportService.js    # 导出/恢复
│   ├── middleware/
│   │   └── errorHandler.js
│   └── data/
│       ├── dictionary.db       # 静态词典（只读）
│       ├── audio/              # 发音文件（按首字母分目录）
│       │   └── en-us/
│       │       └── a/
│       │           └── apple.mp3
│       └── userdata.db         # 动态用户数据（运行时创建）
├── client/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/                # axios 实例，后端代理
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── LevelTest.jsx
│   │   │   ├── Reading.jsx
│   │   │   ├── ArticleList.jsx
│   │   │   ├── ArticleDetail.jsx
│   │   │   ├── VocabManager.jsx
│   │   │   ├── VocabDetail.jsx
│   │   │   ├── ReviewList.jsx
│   │   │   ├── TagsManager.jsx
│   │   │   ├── Settings.jsx
│   │   │   └── ExportImport.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── WordToken.jsx
│   │   │   ├── AnnotationDrawer.jsx
│   │   │   ├── VocabDetailPopup.jsx
│   │   │   ├── ColorLegend.jsx
│   │   │   └── ConfirmDialog.jsx
│   │   ├── hooks/
│   │   ├── utils/
│   │   │   └── tokenRenderer.jsx  # 优化渲染：合并无样式 token
│   │   └── styles/
│   └── public/
├── start.sh / start.bat
└── README.md
```

---

## 4. 数据库设计

采用双文件策略，通过 `ATTACH DATABASE` 挂载只读词典库：

```js
const db = require('better-sqlite3')('data/userdata.db');
db.pragma('journal_mode = WAL');
db.exec(`ATTACH DATABASE 'data/dictionary.db' AS dict`);
```

### 4.1 静态词典 (`dictionary.db`，只读)

**表 `dict.dictionary`**：
```sql
CREATE TABLE dict.dictionary (
    word_id TEXT PRIMARY KEY,
    lemma TEXT NOT NULL,
    pos TEXT,
    translation TEXT,
    phonetic_us TEXT,
    phonetic_uk TEXT,
    static_frequency INTEGER,
    standard_level INTEGER NOT NULL CHECK(standard_level BETWEEN 1 AND 10),
    collocations TEXT,          -- JSON array
    example_sentences TEXT      -- JSON array
);
```

**表 `dict.lemma_map`**：
```sql
CREATE TABLE dict.lemma_map (
    inflected_form TEXT PRIMARY KEY,
    lemma TEXT NOT NULL
);
```
预置映射包括缩约词（`don't` → `do`，`it's` → `it` 等）、连字符形式（`well-known` → `well-known` 作为独立条目存在，或拆分为子词映射）。

**表 `dict.common_abbreviations`**：
```sql
CREATE TABLE dict.common_abbreviations (
    abbr TEXT PRIMARY KEY,
    full_form TEXT
);
```

**表 `dict.phrases`**（短语库）：
```sql
CREATE TABLE dict.phrases (
    phrase_id TEXT PRIMARY KEY,
    phrase_text TEXT NOT NULL,
    separable INTEGER DEFAULT 0,  -- 0 不可分隔，1 可分隔
    max_distance INTEGER DEFAULT 0,
    members TEXT,                -- JSON array
    pos TEXT,
    translation TEXT,
    standard_level INTEGER
);
```

### 4.2 用户数据库 (`userdata.db`，读写)

**配置表**：
```sql
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
);
```
默认插入项：
| key | default value |
|-----|---------------|
| user_level | 3 |
| init_mode | strict |
| color_blind_mode | false |
| density_threshold | 40 |
| onboarding_completed | false |
| oov_default_strangeness | 9 |
| color_scheme | light |
| schema_version | 1 |

**用户词库**：
```sql
CREATE TABLE user_vocab (
    word_id TEXT PRIMARY KEY,
    custom_strangeness INTEGER NOT NULL CHECK(custom_strangeness IN (1,3,5,7,9)),
    source_type TEXT DEFAULT 'manual',
    user_doc_frequency INTEGER DEFAULT 0,
    first_learned_at TEXT,
    last_reviewed_at TEXT,
    user_definition TEXT,
    user_pos TEXT,
    is_custom_word INTEGER DEFAULT 0,
    mastered_at TEXT,
    ease_factor REAL,
    interval_days INTEGER
);
CREATE INDEX idx_review ON user_vocab(last_reviewed_at, custom_strangeness);
```

**文章表**：
```sql
CREATE TABLE articles (
    article_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,                   -- JSON array of tag paths
    new_word_count INTEGER DEFAULT 0,
    first_study_time TEXT,
    last_study_time TEXT,
    is_completed INTEGER DEFAULT 0,
    user_difficulty_rating INTEGER,
    star_rating INTEGER,
    global_views INTEGER DEFAULT 0,
    global_avg_rating REAL,
    difficulty_score REAL,
    media_links TEXT
);
```

**标签表**：
```sql
CREATE TABLE article_tags (
    tag_id TEXT PRIMARY KEY,
    tag_path TEXT NOT NULL UNIQUE,
    article_count INTEGER DEFAULT 0
);
```

**批注表**：
```sql
CREATE TABLE article_annotations (
    annotation_id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    start_char_index INTEGER NOT NULL,
    end_char_index INTEGER NOT NULL,
    selected_text TEXT,
    note_content TEXT,
    created_at TEXT,
    user_id TEXT,
    upvotes INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 1
);
```

**修改日志**：
```sql
CREATE TABLE modification_log (
    log_id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    old_strangeness INTEGER,
    new_strangeness INTEGER,
    timestamp TEXT NOT NULL
);
```

### 4.3 版本迁移机制

`server/database/migrate.js` 在启动时读取 `config.schema_version`，与代码常量 `LATEST_SCHEMA = 1` 比对，若低则按顺序执行迁移脚本（SQL 或函数）。例如从 0→1 执行建表语句。所有迁移在事务内完成。

---

## 5. API 接口设计

Base URL: `http://localhost:3000/api`  
响应格式：`{ success: boolean, data: any, error: { code: string, message: string } | null }`

### 5.1 配置

- `GET /api/config` → 返回所有配置键值对（不包括 schema_version）。
- `PUT /api/config` → 请求体 `{ "key": "value", ... }`，更新配置。影响陌生度计算、色弱模式等的变更立即生效。

### 5.2 自适应测评

- `POST /api/level-test/start` → 返回 `{ nextLevel, text }`
- `POST /api/level-test/feedback` → 请求体 `{ level, feedback }`，返回 `{ nextLevel, finalLevel, text, recommendedArticles }`

### 5.3 文章管理

**`POST /api/articles`**  
导入文章，请求体 `{ title, content }`。后端解析并存储，返回 `{ articleId, tokenized: [...] }`。

**`GET /api/articles`**  
列表，支持 `?status=completed|incomplete&tag=...&sort=last_study_time&order=desc`。

**`GET /api/articles/:id`** → 文章详情 + tokenized 数组（实时根据最新配置和用户词库生成）。  

**`PUT /api/articles/:id`** → 更新元数据（标题、标签、完成状态、评分等）。  

**`DELETE /api/articles/:id`** → 级联删除批注，扣减词条篇数，更新标签计数（事务内）。  

**`POST /api/articles/batch-tag`** → `{ article_ids, add_tags, remove_tags }`

**`POST /api/articles/:id/batch-review`** → 批量复习操作，请求体 `{ target_strangeness: 9|7|5|3, direction: "down" }`，将该文章中所有对应陌生度的单词逐档下调一级，返回修改数量。

### 5.4 词汇管理

- `GET /api/vocab` → 多条件筛选：`?min_difficulty&max_difficulty&min_first_learned&last_reviewed_before`，支持分页。
- `GET /api/vocab/:word_id` → 详情 + 最近修改历史。
- `PUT /api/vocab/:word_id/strangeness` → `{ direction: "up" | "down" }`，逐档校验，更新 `last_reviewed_at`。
- `DELETE /api/vocab/:word_id` → 恢复为 null 状态。
- `POST /api/vocab/batch-delete` → `{ word_ids }`。
- `POST /api/vocab/custom` → 添加自定义 OOV，默认陌生度为 `oov_default_strangeness` 配置值。
- `GET /api/vocab/review` → 待复习列表，按 `last_reviewed_at ASC, custom_strangeness DESC`，支持 `?page&limit`。
- `GET /api/vocab/:word_id/history` → 完整修改日志。

### 5.5 标签管理

标准 CRUD：`GET /api/tags`，`POST /api/tags`，`PUT /api/tags/:id`，`DELETE /api/tags/:id`。重命名级联更新文章 JSON 字段中的标签路径。

### 5.6 批注管理

- `GET /api/articles/:id/annotations`
- `POST /api/articles/:id/annotations` → `{ start_char_index, end_char_index, note_content }`
- `PUT /api/annotations/:id` → 修改内容
- `DELETE /api/annotations/:id`

### 5.7 数据导出与恢复

- `GET /api/export/json` → 导出所有用户数据 JSON，不包含词典。
- `POST /api/import/json` → 上传 JSON，**事务**内清空并导入，导入前自动备份旧 `userdata.db` 为 `userdata_backup_{timestamp}.db`。
- `GET /api/export/csv` → 导出词汇 CSV（lemma, translation, strangeness, last_reviewed）。
- `GET /api/backup/db` → 直接下载 `userdata.db` 文件。

### 5.8 词典查询

- `GET /api/dictionary/search?q=...` → 支持模糊匹配（`LIKE '%keyword%'`），返回简要列表。
- `GET /api/dictionary/:word_id` → 词条详情。

---

## 6. 前端路由与组件

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 仪表板：最近文章、待复习数量、快速入口 |
| `/level-test` | LevelTest | 自适应测评交互 |
| `/reading/:articleId` | Reading | 核心阅读页面，标注渲染、批量复习 |
| `/articles` | ArticleList | 列表、筛选、批量打标 |
| `/articles/new` | ImportArticle | 导入文章 |
| `/vocab` | VocabManager | 词汇管理，多条件过滤 |
| `/vocab/:wordId` | VocabDetail | 词条详情及历史 |
| `/review` | ReviewList | 待复习列表，可逐档操作 |
| `/tags` | TagsManager | 标签管理 |
| `/settings` | Settings | 个人设置（等级、模式、色弱、深色、OOV 默认等） |
| `/export` | ExportImport | 数据导出/恢复/备份 |

**关键全局组件**：
- `Layout`：导航栏根据 `color_scheme` 自动切换深色/浅色，侧边栏菜单。
- `WordToken`：渲染单个 token，根据 strangeness 应用颜色和下划线，处理点击弹出详情。
- `tokenRenderer.jsx`：将连续的低级 token（strangeness=1 且无批注、非缩写、非短语）合并为纯文本字符串，减少 DOM 节点。
- `VocabDetailPopup`：点击生词弹出的 Drawer/Card，显示释义、发音按钮、搭配、例句，提供“降低难度”/“提高难度”按钮。
- `ColorLegend`：颜色图例浮层。

**阅读页面批量复习入口**：工具栏“批量降级”按钮，弹出选项“所有 9→7”、“所有 7→5”等，确认后调用 `POST /api/articles/:id/batch-review`。

---

## 7. 核心算法与流程

### 7.1 文本解析引擎 (`textParser.js`)

**步骤**：

1. **分段**：保留换行符。
2. **Tokenization**：使用正则 `/\b[a-zA-Z]+(?:[-'][a-zA-Z]+)*\b/g` 匹配单词（支持连字符和缩约词 `don't`）。记录每个 token 的 `start_char`、`end_char`、`text`。非单词字符（标点、数字等）作为独立 token，`is_word=false`。
3. **缩写检测**：
   - 匹配常识缩写表，标记 `is_abbreviation=true`。
   - 括号定义检测：如 `Retrieval-Augmented Generation (RAG)`，记录局部映射。
4. **词形还原**：
   - 查询 `lemma_map`，若命中则 `lemma = mapped_lemma`；若为连字符形式，先整体查，再拆分查。
   - 缩约词如 `don't` 直接映射至 `do`（前端仍显示原文）。
   - 未命中且词典无记录 → 标记 OOV。
5. **短语匹配**：
   - **连续不可分隔短语**：使用 Aho-Corasick 算法一次性扫描全部连续短语，标记 `phrase_group_id`。
   - **可分隔短语**：为每个可分隔短语的动词部分建立哈希。扫描 token 流，命中动词时向后搜索 ≤5 个 token 内的小品词，若匹配则分配 `phrase_group_id`。
   - 重叠时取最长匹配。
6. **陌生度计算**：调用 `strangeness.js` 为每个单词/短语计算最终陌生度及来源。
7. **验证**：单元测试确保 tokens 原文拼接（`tokens.map(t=>t.text).join('')`）完全等于原始 `content`。

### 7.2 陌生度计算逻辑 (`strangeness.js`)

输入：`word_id`, `standard_level`, `user_level`, `init_mode`, `is_phrase`, 用户词库记录。  
输出：`{ strangeness, source }`

```
function calc(word_id, standard_level, user_level, init_mode, record):
    if record exists (source='manual'): return { record.custom_strangeness, 'manual' }
    if word_id is null (OOV): return { config.oov_default_strangeness || 9, 'null' }
    if init_mode == 'strict':
        if standard_level <= user_level: return { 1, 'null' }
        else: return { 9, 'null' }
    else: // gradient
        diff = standard_level - user_level
        if diff <= 0: return { 1, 'null' }
        if diff == 1: return { 5, 'null' }
        if diff == 2: return { 7, 'null' }
        return { 9, 'null' }
```

短语的 `standard_level` 取成员中最高的难度等级；若短语存在于用户词库（极少），优先使用手动记录。

### 7.3 自适应测评

状态机实现同初始设计，但增加“跳过测评”后直接使用 `user_level=3`，并将 `onboarding_completed` 设为 true。

### 7.4 逐档复习与批量操作

单次升降：
```
if direction == 'down' and current > 1: new = current - 2
if direction == 'up' and current < 9: new = current + 2
else: reject
```

批量复习接口：读取文章 tokenized 列表（实时生成），筛选出 `strangeness == target && source == 'manual'` 的 `word_id` 去重，依次执行降档操作（每词一步），记录日志，返回修改数量。

### 7.5 数据导出与恢复

导出 JSON 结构：
```json
{
  "version": "1.0",
  "exported_at": "...",
  "schema_version": 1,
  "data": {
    "config": [{"key":"...","value":"..."}],
    "user_vocab": [...],
    "articles": [...],
    "article_tags": [...],
    "article_annotations": [...],
    "modification_log": [...]
  }
}
```
恢复时：
1. 备份当前 `userdata.db`。
2. 开启事务，清空所有动态表。
3. 插入数据，保持原有 ID。
4. 重新计算 `user_doc_frequency`（扫描所有文章内容，统计词条出现文章数）和 `article_tags.article_count`。
5. 提交事务。任何错误回滚并提示。

---

## 8. 性能与渲染优化

- **后端**：短语匹配用 AC 自动机；SQLite WAL 模式；静态表索引已建立；解析 10k 词文本目标 <1s。
- **前端**：`tokenRenderer.jsx` 将连续 strangeness=1 且无批注/无短语的 token 合并为纯文本，避免创建 React 组件；`WordToken` 使用 `React.memo`；批注 Drawer 懒加载内容。

---

## 9. 夜间模式实现

- `config` 表 `color_scheme: light | dark`。
- Tailwind 配置 `darkMode: 'class'`。
- `Layout` 组件读取配置并在 `<html>` 添加/移除 `dark` 类。
- 所有组件使用 `dark:` 变体定义样式，阅读页面背景、卡片、字体颜色均适配。
- 词汇颜色在暗色背景下需保持对比度，可微调颜色值或保持原色并确保对比度合格。

---

## 10. 错误处理与日志

- 统一错误中间件返回标准 JSON 错误。
- 常见错误码：`VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500)。
- 关键操作日志打印到 stdout（导入、删除、恢复、迁移）。

---

## 11. 测试策略

1. **单元测试**（Jest）：
   - 文本解析器：多种文本输入（连字符、缩约词、数字、标点），验证 token 划分、还原、短语识别、拼接还原。
   - 陌生度计算：边界值、strict/gradient、OOV 配置。
   - 测评算法状态跳转。
2. **API 集成测试**（Supertest）：
   - 所有端点 CRUD 成功/失败场景。
   - 级联删除、批量打标、批量复习数据一致性。
   - 事务验证：导入中断后数据未变更。
3. **前端测试**（可选）：核心交互（点击单词弹出详情、批量复习确认）可选择性覆盖。

---

## 12. 启动与部署

1. 环境要求：Node.js 18+。
2. 安装依赖：`cd server && npm install`，`cd ../client && npm install`。
3. 初始化数据库：`node server/database/init.js`（若首次，会自动创建 `userdata.db`、导入静态词典到 `dictionary.db`）。
4. 启动服务：`npm start`（使用 concurrently 同时启动前后端）。
5. 访问 `http://localhost:5173`。

`start.bat` / `start.sh` 封装上述命令，方便一键启动。

---

## 13. 附录：Aho-Corasick 实现要点

在 `server/services/textParser.js` 中，引入 `aho-corasick.js`（或自实现）：

```
const AhoCorasick = require('aho-corasick.js');
const ac = new AhoCorasick();
const continuousPhrases = phrases.filter(p => !p.separable);
continuousPhrases.forEach(p => ac.add(p.phrase_text));
ac.build();
```

在 token 流中拼接空格分隔的单词串，或针对 token 文本流构建字符串，调用 `ac.search()` 获取所有命中位置，再回填到对应 token。

---

**本文档为最终详细设计，覆盖所有核心功能及优化改进，可直接作为开发与测试基准。**
# 英语单词学习辅助系统 详细设计说明书（本地单机版 V1.1）

**版本**：1.1
**编制日期**：2026-05-20
**最后更新**：2026-05-21
**对应 SRS**：英语单词学习辅助系统 需求规格说明书（本地单机版） V1.0-Local

本文档整合了初始详细设计、评审反馈、优化决策及 V1.1 新增功能，可直接交付 AI 编码与测试。

---

## 1. 概述

系统为个人本地部署的 Web 应用，采用 B/S 架构，后端 Node.js + Express，前端 React + Vite + Tailwind CSS，数据持久化于本地 SQLite。所有核心功能（阅读标注、逐档复习、标签管理等）完全本地运行，无需互联网。静态词典与用户数据物理分离，音频按首字母分目录存放。系统支持数据导出/恢复、版本自动迁移、夜间模式、批量复习、词典管理、用户等级系统等增强特性。

---

## 2. 技术选型

| 层面 | 技术 | 说明 |
|------|------|------|
| 后端运行时 | Node.js 18+ | LTS |
| 后端框架 | Express | 轻量，生态成熟 |
| 数据库引擎 | better-sqlite3 | 同步 API，适合本地单机 |
| 数据库文件 | 双文件：`dictionary.db`（读写） + `userdata.db`（读写） | 静态与动态分离，便于备份；dictionary.db 通过 ATTACH 挂载 |
| 短语匹配 | 连续短语：Aho-Corasick；可分隔短语：特征触发扫描 | 高性能匹配 |
| 文本分词 | 自研（正则 + 映射表 + 规则还原） | 支持连字符、缩约词、规则/不规则词形变化 |
| 词形还原 | 自研（lemma_map + 规则后缀剥离） | 支持 20+ 种后缀规则 |
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
│   │   ├── dictionary.js
│   │   └── levelTest.js
│   ├── services/
│   │   ├── textParser.js       # 文本解析（含短语匹配、词形还原）
│   │   ├── strangeness.js      # 陌生度计算逻辑
│   │   ├── levelTest.js        # 自适应测评逻辑
│   │   ├── exportService.js    # 导出/恢复
│   │   └── lemmatizer.js       # 词形还原服务（规则 + 映射表）
│   ├── middleware/
│   │   └── errorHandler.js
│   └── data/
│       ├── dictionary.db       # 静态词典（可读写，支持用户添加）
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
│   │   │   ├── ExportImport.jsx
│   │   │   └── DictionaryManager.jsx
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

采用双文件策略，通过 `ATTACH DATABASE` 挂载词典库：

```js
const db = require('better-sqlite3')('data/userdata.db');
db.pragma('journal_mode = WAL');
db.exec(`ATTACH DATABASE 'data/dictionary.db' AS dict`);
```

### 4.1 静态词典 (`dictionary.db`，可读写)

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
    collocations TEXT,
    example_sentences TEXT
);
CREATE INDEX idx_dict_lemma ON dictionary(lemma);
CREATE INDEX idx_dict_level ON dictionary(standard_level);
```

**表 `dict.lemma_map`**：
```sql
CREATE TABLE dict.lemma_map (
    inflected_form TEXT PRIMARY KEY,
    lemma TEXT NOT NULL
);
```
预置映射包括缩约词（`don't` → `do`，`it's` → `it` 等）、不规则变化（`went` → `go`，`cities` → `city` 等），共 340 条。

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
    separable INTEGER DEFAULT 0,
    max_distance INTEGER DEFAULT 0,
    members TEXT,
    pos TEXT,
    translation TEXT,
    standard_level INTEGER
);
CREATE INDEX idx_phrases_text ON phrases(phrase_text);
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
| user_level | 4 |
| init_mode | gradient |
| color_blind_mode | false |
| density_threshold | 40 |
| onboarding_completed | false |
| oov_default_strangeness | 9 |
| color_scheme | light |
| schema_version | 1 |

> **V1.1 变更**：`user_level` 默认值从 3 改为 4；`init_mode` 从 `strict` 改为 `gradient`，支持五档陌生度分级。

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
    tags TEXT,
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

`server/database/migrate.js` 在启动时读取 `config.schema_version`，与代码常量 `LATEST_SCHEMA = 1` 比对，若低则按顺序执行迁移脚本。所有迁移在事务内完成。

---

## 5. API 接口设计

Base URL: `http://localhost:3000/api`
响应格式：`{ success: boolean, data: any, error: { code: string, message: string } | null }`

### 5.1 配置

- `GET /api/config` → 返回所有配置键值对（不包括 schema_version）。
- `PUT /api/config` → 请求体 `{ "key": "value", ... }`，更新配置。

### 5.2 自适应测评

- `POST /api/level-test/start` → 返回 `{ sessionId, level, text }`。从 Level 4 开始。
- `POST /api/level-test/feedback` → 请求体 `{ sessionId, level, feedback }`。
  - `feedback` 取值：`easy`（升高难度）、`hard`（降低难度）、`confirm`（确认当前等级）、`skip`（跳过，默认 Level 4）、`cancel`（取消测评）。
  - 返回 `{ completed, cancelled, finalLevel, nextLevel, text, asked }`。
- `GET /api/level-test/status/:sessionId` → 返回当前会话状态。

> **V1.1 变更**：测评从 Level 4 开始（原 Level 5）；新增 `confirm` 和 `cancel` 反馈选项。

### 5.3 文章管理

**`POST /api/articles`**
导入文章，请求体 `{ title, content }`。后端解析并存储，返回 `{ articleId, tokenized: [...], newWordCount }`。

**`GET /api/articles`**
列表，支持 `?status=completed|incomplete&tag=...&sort=last_study_time&order=desc`。

**`GET /api/articles/:id`** → 文章详情 + tokenized 数组 + annotations。

**`PUT /api/articles/:id`** → 更新元数据。

**`DELETE /api/articles/:id`** → 级联删除。

**`POST /api/articles/batch-tag`** → `{ article_ids, add_tags, remove_tags }`

**`POST /api/articles/:id/batch-review`** → 批量复习操作，请求体 `{ target_strangeness, direction: "down" }`。

### 5.4 词汇管理

- `GET /api/vocab` → 多条件筛选，支持分页。
- `GET /api/vocab/stats` → 用户词汇统计（各陌生度词数、升级进度等）。
- `POST /api/vocab/upgrade-level` → 升级用户等级（需掌握当前等级 80% 以上词汇）。
- `GET /api/vocab/:word_id` → 详情 + 修改历史。
- `PUT /api/vocab/:word_id/strangeness` → `{ direction: "up" | "down" }`，逐档调整。
- `PUT /api/vocab/:word_id/set-strangeness` → `{ strangeness: 1|3|5|7|9 }`，直接设置陌生度值。
- `DELETE /api/vocab/:word_id` → 从用户词库移除。
- `POST /api/vocab/batch-delete` → `{ word_ids }`。
- `POST /api/vocab/custom` → 添加自定义 OOV 词。
- `GET /api/vocab/review` → 待复习列表。
- `GET /api/vocab/:word_id/history` → 完整修改日志。

> **V1.1 新增**：`set-strangeness` 接口支持直接设置陌生度值（非逐档调整）；`stats` 接口提供升级进度；`upgrade-level` 接口支持等级提升。

### 5.5 标签管理

标准 CRUD：`GET /api/tags`，`POST /api/tags`，`PUT /api/tags/:id`，`DELETE /api/tags/:id`。

### 5.6 批注管理

- `GET /api/articles/:id/annotations`
- `POST /api/articles/:id/annotations`
- `PUT /api/annotations/:id`
- `DELETE /api/annotations/:id`

### 5.7 数据导出与恢复

- `GET /api/export/json` → 导出所有用户数据 JSON。
- `POST /api/import/json` → 上传 JSON，事务内清空并导入。
- `GET /api/export/csv` → 导出词汇 CSV。
- `GET /api/backup/db` → 下载 `userdata.db`。

### 5.8 词典管理

- `POST /api/dictionary/auto-add` → 自动添加单词到词典（支持词形还原）。请求体 `{ word, strangeness }`。返回 `{ word_id, lemma, standard_level, method, already_existed }`。
- `GET /api/dictionary/search?q=...&page&limit&level=` → 搜索词典（分页、按等级筛选）。
- `GET /api/dictionary/:word_id` → 词条详情。
- `POST /api/dictionary` → 添加新词条。
- `PUT /api/dictionary/:word_id` → 更新词条。
- `DELETE /api/dictionary/:word_id` → 删除词条。

> **V1.1 新增**：`auto-add` 接口支持自动词形还原和等级估算；`search` 接口支持分页和等级筛选。

---

## 6. 前端路由与组件

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 仪表板：等级卡片、测评状态、升级进度、快速入口 |
| `/level-test` | LevelTest | 自适应测评交互（从 Level 4 开始） |
| `/reading/:articleId` | Reading | 核心阅读页面，标注渲染、划选标注陌生度 |
| `/articles` | ArticleList | 列表、筛选、批量打标 |
| `/articles/new` | ImportArticle | 导入文章 |
| `/vocab` | VocabManager | 词汇管理，多条件过滤 |
| `/vocab/:wordId` | VocabDetail | 词条详情及历史 |
| `/review` | ReviewList | 待复习列表 |
| `/tags` | TagsManager | 标签管理 |
| `/settings` | Settings | 个人设置 |
| `/export` | ExportImport | 数据导出/恢复/备份 |
| `/dictionary` | DictionaryManager | 词典管理（增删改查、搜索、分页） |

> **V1.1 新增**：`/dictionary` 词典管理页面。

**关键全局组件**：
- `Layout`：导航栏根据 `color_scheme` 自动切换深色/浅色，侧边栏菜单。
- `WordToken`：渲染单个 token，根据 strangeness 应用颜色和下划线。
- `tokenRenderer.jsx`：将连续的低级 token 合并为纯文本字符串，减少 DOM 节点。
- `VocabDetailPopup`：点击生词弹出的弹窗，显示释义、发音、搭配、例句，提供陌生度调整按钮。
- `ColorLegend`：颜色图例。

**阅读页面划选标注**：
- 鼠标拖拽选中文字后，在选区上方弹出陌生度选择菜单（1/3/5/7/9）。
- 选区边界自动扩展到完整单词（向前/向后扩展到字母边界）。
- 如果选中词不在词典中，自动添加到词典（通过词形还原找到原型，估算等级）。
- 页面右侧显示各陌生度词汇数量统计。

---

## 7. 核心算法与流程

### 7.1 文本解析引擎 (`textParser.js`)

**步骤**：

1. **Tokenization**：使用正则 `/\b[a-zA-Z]+(?:[-'][a-zA-Z]+)*\b/g` 匹配单词。
2. **缩写检测**：匹配常识缩写表 + 括号定义检测。
3. **词形还原**：调用 `lemmatizer.js` 服务（详见 7.2）。
4. **短语匹配**：连续短语用 Aho-Corasick；可分隔短语用动词哈希 + 前向搜索。
5. **陌生度计算**：调用 `strangeness.js`。

### 7.2 词形还原服务 (`lemmatizer.js`)

**查找策略**（按优先级）：
1. **lemma_map 查询**：处理 340+ 条不规则变化（went→go, cities→city 等）
2. **直接词典查询**：词本身可能就是原型
3. **规则后缀剥离**：
   - `-ied → -y`（carried→carry）
   - `-ing → -e/∅`（making→make, running→run）
   - `-ed → ∅/-e`（walked→walk, hoped→hope）
   - `-er/-est`（bigger→big）
   - `-ly/-ness/-ment/-tion/-sion/-ity` 等学术后缀
   - `-es/-s`（boxes→box, cats→cat）
4. **返回候选**：即使原型不在词典中，也返回还原后的原型（用于 auto-add）

**新词等级估算**（`estimateStandardLevel`）：
- 词长 ≤ 3：Level 2
- 词长 = 4：Level 3
- 含学术后缀（-tion/-sion/-ment/-ness 等）：Level 6
- 含中等后缀（-ful/-less/-ly 等）：Level 5
- 词长 ≥ 10：Level 7
- 词长 ≥ 8：Level 6
- 默认：Level 5

### 7.3 陌生度计算逻辑 (`strangeness.js`)

输入：`word_id`, `standard_level`, `user_level`, `init_mode`, `is_phrase`, 用户词库记录。
输出：`{ strangeness, source }`

```
function calc(word_id, standard_level, user_level, init_mode, record):
    if record exists (source='manual'): return { record.custom_strangeness, 'manual' }
    if word_id is null (OOV): return { config.oov_default_strangeness || 9, 'null' }
    if init_mode == 'strict':
        if standard_level <= user_level: return { 1, 'null' }
        else: return { 9, 'null' }
    else: // gradient (default)
        diff = standard_level - user_level
        if diff <= 0: return { 1, 'null' }       // 已掌握
        if diff == 1: return { 5, 'null' }       // 有些陌生
        if diff == 2: return { 7, 'null' }       // 比较陌生
        return { 9, 'null' }                      // 完全不认识
```

> **V1.1 变更**：默认 `init_mode` 为 `gradient`，支持五档分级。

### 7.4 自适应测评

**流程**：
- 从 Level 4 开始（默认用户等级）
- 用户反馈：`easy`（升一级）、`hard`（降一级）、`confirm`（确认当前等级）、`skip`（默认 Level 4）、`cancel`（取消）
- 收敛条件：范围缩至 1 级 / 达到 6 题上限 / 用户确认
- 完成后自动设置 `user_level` 和 `onboarding_completed`

### 7.5 用户等级系统

- 仪表板显示当前等级、测评状态、升级进度
- 升级条件：掌握当前等级词典中 80% 以上词汇（strangeness=1）
- 升级后 `user_level` +1，影响后续文章标注

### 7.6 划选标注陌生度

**流程**：
1. 用户鼠标拖拽选中文字
2. 计算选区字符偏移（TreeWalker 遍历文本节点）
3. 扩展选区边界到完整单词（前后扩展到非字母字符）
4. 弹出陌生度选择菜单（1/3/5/7/9）
5. 对每个选中的词：
   - 已有词典记录 → 直接设置陌生度
   - OOV 词 → 调用 `auto-add` 接口（词形还原 → 添加到词典 → 设置陌生度）
6. 刷新文章页面

---

## 8. 性能与渲染优化

- **后端**：短语匹配用 AC 自动机；SQLite WAL 模式；静态表索引已建立。
- **前端**：`tokenRenderer.jsx` 将连续 strangeness=1 的 token 合并为纯文本；`WordToken` 使用 `React.memo`。

---

## 9. 夜间模式实现

- `config` 表 `color_scheme: light | dark`。
- Tailwind 配置 `darkMode: 'class'`。
- `Layout` 组件读取配置并在 `<html>` 添加/移除 `dark` 类。

---

## 10. 错误处理与日志

- 统一错误中间件返回标准 JSON 错误。
- 常见错误码：`VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500)。

---

## 11. 启动与部署

1. 环境要求：Node.js 18+。
2. 安装依赖：`cd server && npm install`，`cd ../client && npm install`。
3. 初始化数据库：`node server/database/init.js`。
4. 启动后端：`cd server && node index.js`（端口 3000）。
5. 构建前端：`cd client && npm run build`。
6. 访问 `http://localhost:3000`（后端 serve 前端构建产物）。

`start.sh` / `start.bat` 封装上述命令，方便一键启动。

---

## 12. V1.1 变更摘要

| 变更项 | 说明 |
|--------|------|
| 默认用户等级 | 从 Level 3 改为 Level 4 |
| 默认陌生度模式 | 从 `strict` 改为 `gradient`（五档） |
| 测评起始等级 | 从 Level 5 改为 Level 4 |
| 测评按钮 | 新增"确认当前等级"和"取消测评" |
| 用户等级系统 | 仪表板显示等级、升级进度条、升级按钮 |
| 词典管理页面 | 新增 `/dictionary` 页面，支持 CRUD + 搜索 + 分页 |
| 划选标注陌生度 | 鼠标划选文字后弹出菜单，可设置 1/3/5/7/9 |
| 自动添加新词 | OOV 词自动添加到词典（词形还原 + 等级估算） |
| 词形还原服务 | 新增 `lemmatizer.js`，支持 20+ 种后缀规则 |
| 直接设置陌生度 | 新增 `set-strangeness` 接口 |
| 词汇统计 | 新增 `vocab/stats` 接口 |
| 等级升级 | 新增 `upgrade-level` 接口 |
| Seed 数据扩充 | 从 308 词条增至 372 词条，Level 3-10 各有 8 个词 |
| 批量调整功能 | 已移除 |

---

**本文档为 V1.1 详细设计，覆盖所有核心功能及优化改进，可直接作为开发与测试基准。**

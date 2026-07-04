# LexHue - 英语生词标引

本地单机版英语单词学习 Web 应用，支持阅读标注、逐档复习、标签管理、词典管理、用户等级系统等功能。

## 功能特性

- **自适应测评**：通过交互式测评确定用户英语水平等级
- **用户等级系统**：根据掌握的词汇量自动升级
- **文章阅读**：导入英文文章，自动标注词汇难度，支持点击查询
- **划选标注陌生度**：鼠标拖拽选中文字，直接标注为指定陌生度（1/3/5/7/9）
- **自动添加新词**：划选未收录的单词时，自动通过词形还原找到原型并添加到词典
- **陌生度分级**：5 级陌生度（1/3/5/7/9），支持逐档升降或直接设置
- **词典管理**：支持词典词条的增删改查、搜索、分页
- **标签管理**：为文章添加标签，支持批量打标
- **批注系统**：选中文本添加批注
- **数据导出**：支持 JSON/CSV 导出和数据库备份
- **深色模式**：自动切换深色/浅色主题

## 技术栈

- **后端**：Node.js + Express + better-sqlite3
- **前端**：React 18 + Vite + Tailwind CSS
- **数据库**：SQLite（双文件：dictionary.db + userdata.db）
- **词形还原**：自研（lemma_map 10万+ 条词形映射 + 20+ 种规则后缀剥离）

## 快速开始

### 环境要求

- Node.js 18+

### 一键启动

**Linux / Mac / WSL:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```bat
start.bat
```

### 手动启动

```bash
# 安装后端依赖
cd server && npm install

# 安装前端依赖
cd client && npm install

# 初始化数据库
cd server && node database/init.js

# 导入词典数据（需要先将数据文件放到项目目录）
cd server && node scripts/import-coca.js
cd server && node scripts/import-ecdict-supplement.js
cd server && node scripts/import-lemma.js

# 启动后端（端口 3000）
cd server && node index.js

# 构建前端
cd client && npm run build

# 访问
# 后端同时 serve 前端构建产物，访问 http://localhost:3000
```

## 项目结构

```
LexHue/
├── server/                 # 后端
│   ├── index.js           # 入口
│   ├── config.js          # 配置
│   ├── database/          # 数据库
│   │   ├── connection.js  # 连接管理
│   │   ├── init.js        # 初始化
│   │   ├── migrate.js     # 版本迁移
│   │   └── seed/          # 初始数据
│   ├── routes/            # API 路由
│   │   ├── articles.js
│   │   ├── vocab.js
│   │   ├── tags.js
│   │   ├── annotations.js
│   │   ├── config.js
│   │   ├── export.js
│   │   ├── dictionary.js
│   │   └── levelTest.js
│   ├── services/          # 业务逻辑
│   │   ├── textParser.js  # 文本解析
│   │   ├── strangeness.js # 陌生度计算
│   │   ├── levelTest.js   # 自适应测评
│   │   ├── exportService.js # 导出/恢复
│   │   └── lemmatizer.js  # 词形还原服务
│   └── data/
│       ├── dictionary.db   # 词典数据库（6万+ 词条）
│       ├── audio/          # 发音文件目录
│       └── userdata.db     # 用户数据
├── client/                # 前端
│   ├── src/
│   │   ├── pages/         # 页面组件（11 个页面）
│   │   ├── components/    # 通用组件
│   │   ├── api/           # API 客户端
│   │   └── utils/         # 工具函数
│   └── ...
├── design.md              # 详细设计文档
├── start.sh               # 启动脚本 (Linux/Mac)
├── start.bat              # 启动脚本 (Windows)
└── README.md
```

## 数据说明

- `server/data/dictionary.db` - 词典数据库（77万+ 词条，COCA + ECDICT + Oxford + 其他多源）
- `server/data/userdata.db` - 用户数据（配置、词汇、文章、批注、修改日志）
- `server/data/audio/` - 音频文件目录（按首字母分目录）

## 词形还原规则

系统支持以下词形还原规则（按优先级）：

1. **lemma_map 映射表**：10万+ 条词形映射（was→be, children→child, running→run 等）
2. **直接词典查询**：词本身可能就是原型
3. **规则后缀剥离**：
   - `-ied → -y`（carried→carry）
   - `-ing → -e/∅`（making→make, running→run）
   - `-ed → ∅/-e`（walked→walk, hoped→hope）
   - `-er/-est`（bigger→big, biggest→big）
   - `-ly/-ness/-ment/-tion/-sion/-ity` 等学术后缀
   - `-es/-s`（boxes→box, cats→cat）

## 单词难度分级

基于 COCA 词频排名，将单词难度分为 10 级（0-9）：

| Level | COCA Rank | 说明 |
|-------|-----------|------|
| 0 | 1 - 500 | 最核心词 |
| 1 | 501 - 1000 | 极高频词 |
| 2 | 1001 - 2000 | 高频词 |
| 3 | 2001 - 3000 | 中高频词 |
| 4 | 3001 - 5000 | 中等词 |
| 5 | 5001 - 8000 | 中低频词 |
| 6 | 8001 - 12000 | 低频词 |
| 7 | 12001 - 20000 | 较生僻词 |
| 8 | 20001 - 60000 | 生僻词 |
| 9 | 无 COCA 数据 | 极生僻词 |

## 陌生度说明

陌生度（strangeness）是用户个人对单词的熟悉程度，与单词难度（standard_level）是两个不同的概念：

- **单词难度**：基于 COCA 词频，所有用户共享同一个值
- **陌生度**：用户个人的感受，初始值由系统根据单词难度和用户等级计算，用户可手动调整

陌生度值：1（已掌握）→ 3 → 5 → 7 → 9（完全不认识）

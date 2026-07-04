# LexHue 用户说明

LexHue 是一个面向英语阅读学习的多用户 Web 应用。它可以导入英文文章，自动识别词汇难度，用颜色标注用户可能不熟悉的词，并支持词典管理、水平测评、文章批注、复习和数据导出。

当前版本使用 PostgreSQL 作为运行数据库，支持普通用户和管理员权限隔离。

## 主要功能

- **多用户登录**：每个用户拥有独立的文章、词汇记录、配置和学习进度。
- **水平测评**：从 Level 4 开始，根据用户反馈调整文章难度，最终确定用户英语水平。
- **文章导入**：支持粘贴英文文章，也支持输入网页链接自动提取正文。
- **文章阅读标注**：按用户等级自动标注词汇陌生度，并统计页面词汇情况。
- **词汇详情**：点击单词可查看释义、词性、音标、难度等级等信息。
- **陌生度调整**：用户可手动调整词汇陌生度，确认后的个人记录优先生效。
- **划选标注**：阅读文章时可拖拽选中文字，快速设置陌生度或添加新词。
- **复习列表**：按陌生度和复习时间整理需要复习的词。
- **标签与批注**：文章支持标签管理，阅读时可添加批注。
- **管理员功能**：管理员可管理词典、系统配置和测评文章库。
- **测评文章管理**：管理员可按 Level 0-9 管理测评文章，支持自动评级、链接导入和详情预览。
- **导入导出**：支持词汇和数据导出，用于备份或迁移。

## 词汇等级与颜色规则

LexHue 将词汇标准难度分为 Level 0-9：

| Level | 含义 |
| --- | --- |
| 0 | 最常用核心词 |
| 1-3 | 高频到中高频词 |
| 4-6 | 中等到低频词 |
| 7-8 | 较生僻词 |
| 9 | 生僻或无词频数据词 |

默认标注规则：

| 词汇标准等级与当前等级的关系 | 陌生度 | 显示 |
| --- | --- | --- |
| 低于当前等级 | 1 精通 | 不标色 |
| 等于当前等级 | 3 熟识 | 青色 |
| 高 1 级 | 5 浅知 | 琥珀色 |
| 高 2 级及以上 | 7 陌生 | 玫瑰色 |

用户手动确认过的词汇会优先使用用户自己的陌生度记录。

## 账号说明

初始化后默认包含两个账号：

| 用户名 | 密码 | 权限 |
| --- | --- | --- |
| admin | admin | 管理员 |
| local | lexhue | 普通用户 |

管理员可以看到并使用词典管理、系统设置和测评文章管理页面。普通用户不会看到这些管理入口。

## 安装要求

推荐环境：

- Node.js 20 LTS
- npm
- PostgreSQL 14+，推荐 PostgreSQL 16
- Linux / WSL / macOS。Windows 可使用 WSL 运行。

确认 Node 版本：

```bash
node -v
npm -v
```

如果使用 nvm：

```bash
source ~/.nvm/nvm.sh
nvm use 20
```

## 数据库准备

LexHue 默认使用以下 PostgreSQL 连接配置：

```text
PGHOST=/tmp/lexhue-pg
PGPORT=5432
PGDATABASE=lexhue
PGUSER=lexhue
PGPASSWORD=lexhue
```

如果你使用系统 PostgreSQL，可以创建数据库和用户：

```bash
sudo -u postgres psql
```

进入 psql 后执行：

```sql
CREATE USER lexhue WITH PASSWORD 'lexhue';
CREATE DATABASE lexhue OWNER lexhue;
\q
```

如果 PostgreSQL 监听在默认 TCP 地址，可以用环境变量覆盖连接方式：

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=lexhue
export PGUSER=lexhue
export PGPASSWORD=lexhue
```

## 安装依赖

在项目根目录执行：

```bash
cd /home/jlx/project/LexHue

cd server
npm install

cd ../client
npm install
```

## 初始化数据库

```bash
cd /home/jlx/project/LexHue/server
npm run init-db
```

初始化会创建表结构、默认账号、默认配置，并导入项目内置的词典和测评文章种子数据。

如果你从旧 SQLite 单机版迁移数据，可在准备好旧数据后执行：

```bash
cd /home/jlx/project/LexHue/server
npm run migrate:sqlite
```

## 启动软件

### 开发模式

启动后端：

```bash
cd /home/jlx/project/LexHue/server
npm run dev
```

默认后端地址：

```text
http://localhost:3000
```

另开一个终端启动前端：

```bash
cd /home/jlx/project/LexHue/client
npm run dev
```

默认前端地址：

```text
http://localhost:5173
```

日常开发和验证建议访问前端地址。

### 生产构建

```bash
cd /home/jlx/project/LexHue/client
npm run build

cd ../server
npm start
```

后端会托管 `client/dist` 中的前端构建产物，访问：

```text
http://localhost:3000
```

## 基本使用流程

### 1. 登录

打开前端页面后输入用户名和密码登录。

首次验证可使用：

```text
admin / admin
```

或：

```text
local / lexhue
```

### 2. 完成水平测评

进入“水平测评”页面，系统会展示一篇测评文章。

阅读后选择：

- 降低难度
- 确认当前等级
- 升高难度
- 跳过测评
- 取消测评

确认后，系统会保存当前用户等级，并用于后续文章标注。

### 3. 导入文章

进入“文章”页面，点击导入文章。

可选择：

- 粘贴文本
- 输入网页链接并提取正文

导入后进入阅读页面，系统会自动识别词汇并进行颜色标注。

### 4. 阅读与标注

阅读页面支持：

- 点击单词查看详情
- 调整单词陌生度
- 划选文本快速标注
- 查看页面词汇统计
- 查看超纲词列表
- 添加批注

标注颜色可帮助判断文章是否适合当前水平，但最终仍以用户自己的阅读感受为准。

### 5. 复习词汇

进入“复习”或“词汇”页面，可查看已记录的词汇。

可按陌生度筛选，并逐步降低或提高陌生度。

### 6. 管理文章标签

文章支持标签管理。可以为不同主题、课程、来源的文章打标签，便于后续筛选。

## 管理员使用

管理员登录后会看到额外管理入口。

### 词典管理

管理员可搜索、查看、编辑词典条目。

普通用户不能进入词典管理页面。

### 系统设置

管理员可调整系统级参数，例如默认用户等级、初始化模式、OOV 默认陌生度等。

### 测评文章管理

测评文章按 Level 0-9 组织，界面类似资源管理器目录。

管理员可以：

- 展开或折叠某个 Level 目录
- 查看该等级下的测评文章标题
- 点击文章标题，在右侧查看文章详情
- 查看文章的词色标注和词汇统计
- 删除测评文章
- 添加新测评文章
- 粘贴正文或使用网页链接导入
- 让系统自动评级并按评级结果保存

## 数据导出与备份

进入“导入导出”页面，可导出用户数据或词汇数据。

建议在大量导入文章、调整词典或升级版本前先导出备份。

## 常见问题

### 1. 后端启动时报 PostgreSQL 连接失败

检查 PostgreSQL 是否运行，并确认连接参数：

```bash
echo $PGHOST
echo $PGDATABASE
echo $PGUSER
```

如果使用默认系统 PostgreSQL，可尝试：

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=lexhue
export PGUSER=lexhue
export PGPASSWORD=lexhue
```

### 2. 页面没有显示最新修改

如果访问的是 `http://localhost:5173`，通常 Vite 会自动热更新。

如果访问的是 `http://localhost:3000`，需要重新构建前端：

```bash
cd client
npm run build
```

### 3. 普通用户看不到词典管理或系统设置

这是正常权限控制。只有管理员可以管理词典、系统配置和测评文章。

### 4. 同级词没有显示熟识颜色

请确认后端已重启。测评文章和阅读文章默认规则为：低于当前等级不标色，等于当前等级显示熟识颜色。

### 5. 网页链接导入失败

可能原因包括：

- 网站禁止抓取
- 链接不是公开 HTTP/HTTPS 地址
- 网页正文结构无法解析
- 网页过大或响应超时

可改用手动粘贴正文。

## 项目结构

```text
LexHue/
├── client/                 # React 前端
│   ├── src/
│   │   ├── pages/          # 页面
│   │   ├── components/     # 通用组件
│   │   ├── api/            # API 客户端
│   │   └── utils/          # 前端工具
│   └── package.json
├── server/                 # Node.js 后端
│   ├── database/           # PostgreSQL 初始化与连接
│   ├── routes/             # API 路由
│   ├── services/           # 业务服务
│   ├── scripts/            # 数据导入和迁移脚本
│   └── package.json
├── DEVELOPMENT_PLAN.md     # 开发计划
├── README.md               # 用户说明
└── start.sh                # 启动脚本
```

## 版本说明

当前项目目标是复刻原单机版 LexHue 的界面和核心学习逻辑，并在此基础上加入多用户、权限控制和 PostgreSQL 数据库支持。

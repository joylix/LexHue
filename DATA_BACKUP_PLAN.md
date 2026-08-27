# 词典备份与恢复方案

> 编制日期：2026-08-28
> 目标：为 PostgreSQL 数据库中的 `dictionary` 表提供独立的备份/恢复能力，避免每次部署都需要从 SQLite 重新迁移。

## 一、备份内容

仅针对词典表本身（不包含用户数据、文章、配置等）：

- **表名**：`dictionary`
- **数据量**：约 776,000 条词条（实际约 776,408 条）
- **备份格式**：PostgreSQL SQL dump（`pg_dump --data-only`）
- **备份文件**：`server/data/dictionary-backup/dictionary-<YYYYMMDD-HHMMSS>.sql`
- **文件大小**：约 96 MB

## 二、脚本位置

| 功能 | 路径 | 用法 |
|------|------|------|
| 备份 | `server/scripts/backup-dictionary.sh` | `bash backup-dictionary.sh` |
| 恢复 | `server/scripts/restore-dictionary.sh` | `bash restore-dictionary.sh [备份文件.sql]` |

## 三、备份原理

使用 `pg_dump` 生成纯数据 SQL 文件（不含 `CREATE TABLE`），因为表结构由 `server/database/init.js` 在初始化时负责创建：

```bash
pg_dump \
  --host=/tmp/lexhue-pg --port=5432 --dbname=lexhue --username=lexhue \
  --data-only --table=dictionary \
  --file=server/data/dictionary-backup/dictionary-<时间戳>.sql
```

这样做的好处是：
- 备份文件仅包含数据，不依赖特定的数据库版本
- 恢复时只需 `TRUNCATE` + 执行 SQL 文件即可
- 不需要从 SQLite 重新执行 `migrate-sqlite-to-postgres.js`

## 四、恢复流程（部署时使用）

```bash
# 1. 确保数据库已初始化（创建表结构）
cd server
node database/init.js

# 2. 恢复词典数据
bash scripts/restore-dictionary.sh server/data/dictionary-backup/dictionary-最新.sql
```

恢复脚本会自动：
1. 查找最新备份（或接受手动指定的文件路径）
2. 执行 `TRUNCATE TABLE dictionary;`
3. 执行 SQL 文件（包含 COPY 或 INSERT 数据）
4. 输出恢复后的行数验证

## 五、与 SQLite 迁移的区别

| 方式 | 数据源 | 依赖 | 适用场景 |
|------|--------|------|---------|
| SQLite 迁移 | `server/data/dictionary.db` | `better-sqlite3` 模块（原生编译依赖） | 首次从旧版 SQLite 完整迁移 |
| SQL 备份恢复 | `dictionary-backup/*.sql` | 仅依赖 `psql` / `pg_restore` | 部署时快速恢复，不需要 SQLite 原文件 |

## 六、已执行的备份

当前已生成备份：

```
/home/jlx/project/LexHue/server/data/dictionary-backup/
└── dictionary-20260828-071832.sql  (96 MB, 约 776,408 条)
```

## 七、后续建议

- 可将 `dictionary-backup/` 目录加入 `.gitignore` 避免大文件进入版本控制
- 如需定期自动备份，可在服务器 `crontab` 或部署脚本中调用 `backup-dictionary.sh`
- 如需备份更多表（如 `lemma_map`、`phrases`、`word_relation`），可扩展脚本增加 `--table=` 参数

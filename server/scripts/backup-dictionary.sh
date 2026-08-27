#!/bin/bash
# 词典数据库备份脚本（仅 dictionary 表）
# 使用方法: ./backup-dictionary.sh

set -euo pipefail

PGHOST="${PGHOST:-/tmp/lexhue-pg}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-lexhue}"
PGUSER="${PGUSER:-lexhue}"
PGPASSWORD="${PGPASSWORD:-lexhue}"

BACKUP_DIR="$(dirname "$0")/../data/dictionary-backup"
BACKUP_FILE="$BACKUP_DIR/dictionary-$(date +%Y%m%d-%H%M%S).sql"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

echo "=== LexHue 词典备份开始 ==="
echo "数据库: $PGDATABASE (host: $PGHOST, port: $PGPORT)"
echo "备份文件: $BACKUP_FILE"

mkdir -p "$BACKUP_DIR"

# 使用 pg_dump 导出仅 dictionary 的数据（不含 schema，因为 schema 由 init.js 管理）
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --dbname="$PGDATABASE" \
  --username="$PGUSER" \
  --no-password \
  --data-only \
  --table=dictionary \
  --file="$BACKUP_FILE" \
  --verbose 2>/dev/null || {
    echo "错误: pg_dump 失败，尝试使用 psql COPY 方式..."
    # 备用方案：使用 COPY 导出 CSV
    psql \
      -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      -c "\COPY dictionary TO '$BACKUP_FILE.csv' WITH CSV HEADER;" 2>/dev/null || true
  }

# 如果 SQL 导出成功，保留最新 5 个备份
if [ -f "$BACKUP_FILE" ]; then
  echo "备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | tail -n +6 | xargs -r rm -f
else
  echo "备份失败"
  exit 1
fi

echo "=== 备份完成 ==="

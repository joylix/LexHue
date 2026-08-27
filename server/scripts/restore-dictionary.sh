#!/bin/bash
# 词典数据库恢复脚本（仅 dictionary 表）
# 使用方法: ./restore-dictionary.sh [备份文件路径]
# 如不提供路径，则自动选择最新备份

set -euo pipefail

PGHOST="${PGHOST:-/tmp/lexhue-pg}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-lexhue}"
PGUSER="${PGUSER:-lexhue}"
PGPASSWORD="${PGPASSWORD:-lexhue}"

BACKUP_DIR="$(dirname "$0")/../data/dictionary-backup"

# 确定备份文件
if [ -n "${1:-}" ]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -n1 || true)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "错误: 未找到备份文件"
  echo "可用备份:"
  ls -la "$BACKUP_DIR"/*.sql 2>/dev/null || echo "  无备份"
  echo ""
  echo "用法: $0 [备份文件.sql]"
  exit 1
fi

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

echo "=== LexHue 词典恢复开始 ==="
echo "备份文件: $BACKUP_FILE"
echo "目标数据库: $PGDATABASE@$PGHOST:$PGPORT"

echo "[1/2] 清空 dictionary 表（保留结构）..."
psql \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -c "TRUNCATE TABLE dictionary;" 2>/dev/null || {
    echo "  警告: 无法清空 dictionary，可能表不存在，尝试继续..."
  }

echo "[2/2] 从 SQL 备份恢复数据..."
# 使用 psql 执行 SQL 文件（包含 COPY 或 INSERT 语句）
PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --set ON_ERROR_STOP=on \
  -f "$BACKUP_FILE" 2>&1

echo ""
echo "=== 恢复完成 ==="
echo "验证数据量:"
PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -t -c "SELECT 'dictionary count: ' || COUNT(*) FROM dictionary;" 2>/dev/null

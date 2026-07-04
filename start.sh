#!/bin/bash
# LexHue - Startup Script (Linux/Mac/WSL)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  LexHue - 英语生词标引"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "错误: Node.js 版本过低 (当前: $(node -v))，需要 18+"
    exit 1
fi

echo "[1/4] 检查 Node.js 版本: $(node -v) ✓"

# Install server dependencies
echo "[2/4] 安装后端依赖..."
cd server
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  node_modules 已存在，跳过安装"
fi
cd ..

# Install client dependencies
echo "[3/4] 安装前端依赖..."
cd client
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  node_modules 已存在，跳过安装"
fi
cd ..

# Initialize database
echo "[4/4] 初始化数据库..."
cd server
node database/init.js
cd ..

echo ""
echo "========================================="
echo "  启动 LexHue..."
echo "  后端: http://localhost:3000"
echo "  前端: http://localhost:5173"
echo "========================================="
echo ""

# Start server in background
cd server
node index.js &
SERVER_PID=$!
cd ..

# Start client in background
cd client
npm run dev &
CLIENT_PID=$!
cd ..

# Graceful shutdown on Ctrl+C
cleanup() {
  echo ""
  echo "Shutting down LexHue..."
  kill $SERVER_PID $CLIENT_PID 2>/dev/null
  wait $SERVER_PID $CLIENT_PID 2>/dev/null
  echo "Stopped."
  exit 0
}
trap cleanup INT TERM

# Wait for both processes
wait $SERVER_PID $CLIENT_PID

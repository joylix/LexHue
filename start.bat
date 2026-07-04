@echo off
chcp 65001 >nul 2>&1
@REM LexHue - Startup Script (Windows)

echo =========================================
echo   LexHue - 英语单词学习辅助系统
echo =========================================
echo.

REM Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
    echo 错误: Node.js 版本过低，需要 18+
    pause
    exit /b 1
)

echo [1/4] 检查 Node.js 版本: ✓

REM Install server dependencies
echo [2/4] 安装后端依赖...
cd server
if not exist "node_modules" (
    call npm install
) else (
    echo   node_modules 已存在，跳过安装
)
cd ..

REM Install client dependencies
echo [3/4] 安装前端依赖...
cd client
if not exist "node_modules" (
    call npm install
) else (
    echo   node_modules 已存在，跳过安装
)
cd ..

REM Initialize database
echo [4/4] 初始化数据库...
cd server
node database/init.js
cd ..

echo.
echo =========================================
echo   启动 LexHue...
echo   后端: http://localhost:3000
echo   前端: http://localhost:5173
echo =========================================
echo.

REM Start server
start "LexHue Server" cmd /c "cd server && node index.js"

REM Start client
start "LexHue Client" cmd /c "cd client && npm run dev"

echo 服务已启动，请在浏览器中访问 http://localhost:5173

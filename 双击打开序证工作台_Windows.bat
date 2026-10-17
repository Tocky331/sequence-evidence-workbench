@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 22 或更新版本：https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\csv-parse" (
  echo 首次运行：正在安装序证工作台依赖...
  call npm install
)
echo 正在启动序证工作台 (http://localhost:8817/#overview)...
start "" "http://localhost:8817/#overview"
set PORT=8817
node server.mjs
pause

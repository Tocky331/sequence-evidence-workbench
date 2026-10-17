#!/bin/zsh
set -u

cd -- "${0:A:h}" || exit 1
/usr/bin/xattr -cr . 2>/dev/null || true

export PATH="$PWD/.tools/env/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/miniforge3/bin:$HOME/miniconda3/bin:/opt/anaconda3/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [[ -d "$HOME/.nvm/versions/node" ]]; then
  latest_nvm_node=$(ls -1d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
  [[ -n "$latest_nvm_node" ]] && export PATH="$latest_nvm_node/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  print '未检测到 Node.js（需 Node.js 22 或更新版本）。请先查看目录内的《中文用户手册.docx》或《User-Manual.docx》安装 Node.js。'
  read -k 1 '?按任意键退出...'
  exit 1
fi

if [[ ! -d node_modules/csv-parse ]]; then
  print '首次运行：正在自动安装网站运行依赖 (npm install)...'
  npm install --no-fund --no-audit || exit 1
fi

for port in 8817 8818 8819; do
  if /usr/bin/curl -fsS --max-time 2 "http://localhost:$port/api/state" 2>/dev/null | /usr/bin/grep -q '"apiVersion"'; then
    /usr/bin/open "http://localhost:$port/#overview"
    print "已在浏览器打开 http://localhost:$port/#overview"
    exit 0
  elif /usr/bin/curl -fsS --max-time 1 "http://localhost:$port/" 2>/dev/null | /usr/bin/grep -q '<title>序证工作台'; then
    old_pid=$(/usr/sbin/lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null)
    [[ -n "$old_pid" ]] && kill -9 $old_pid 2>/dev/null && sleep 0.4
  fi
done

selected=''
for port in 8817 8818 8819; do
  if ! /usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -q LISTEN; then
    selected=$port
    break
  fi
done
if [[ -z "$selected" ]]; then
  print '预留端口 (8817-8819) 均被占用，请关闭旧的网站窗口后重试。'
  read -k 1 '?按任意键退出...'
  exit 1
fi

print "正在启动序证工作台：http://localhost:$selected/"
PORT="$selected" node server.mjs &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT INT TERM
ready=0
for attempt in {1..30}; do
  if /usr/bin/curl -fsS --max-time 1 "http://localhost:$selected/api/state" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if (( ! ready )); then
  print '网站未能启动，请查看上面的错误信息。'
  exit 1
fi
if [[ "${SEQ_WORKBENCH_SKIP_OPEN:-0}" != 1 ]]; then
  /usr/bin/open "http://localhost:$selected/#overview"
  print '浏览器已打开。请保持此终端窗口运行；按 Ctrl+C 可停止网站。'
else
  print '启动检查通过。按 Ctrl+C 可停止测试服务。'
fi
wait "$server_pid"

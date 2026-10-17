#!/bin/zsh
set -u

cd -- "${0:A:h}" || exit 1
export PATH="$PWD/.tools/env/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  print '未找到 Node.js。请先按《序证工作台-完整使用说明与GitHub上传教程.docx》安装 Node.js 22 或更新版本。'
  read -k 1 '?按任意键退出...'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  print '首次运行：正在安装网站依赖...'
  npm install || exit 1
fi

for port in 8817 8818 8819; do
  if /usr/bin/curl -fsS --max-time 2 "http://localhost:$port/api/state" 2>/dev/null | /usr/bin/grep -q '"apiVersion":"2026.10.15-github-v2"'; then
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
  print '预留端口均被占用，请关闭旧的网站窗口后重试。'
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
  print '浏览器已打开。保持此终端窗口运行；按 Ctrl+C 可停止网站。'
else
  print '启动检查通过。按 Ctrl+C 可停止测试服务。'
fi
wait "$server_pid"

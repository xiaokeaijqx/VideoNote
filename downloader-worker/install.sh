#!/bin/sh
# 家用下载 worker 一键安装（macOS）：独立 venv + 依赖 + launchd 开机自启 + 写配置。
# 用法：在仓库的 downloader-worker/ 目录下执行  sh install.sh
set -e

WORKER_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/.videonote-worker"
VENV="$APP_DIR/venv"
PY="$VENV/bin/python"
RUN="$APP_DIR/run-daemon.sh"
PLIST="$HOME/Library/LaunchAgents/com.videonote.worker.plist"
LOG="$HOME/Library/Logs/videonote-worker.log"

echo "[install] worker 源目录: $WORKER_DIR"

command -v python3 >/dev/null 2>&1 || { echo "✗ 缺 python3，请先安装 Python 3.10+"; exit 1; }
command -v ffmpeg  >/dev/null 2>&1 || echo "⚠️  未检测到 ffmpeg，请先  brew install ffmpeg （音频处理必需）"

echo "[install] 建独立 venv 并装依赖（yt-dlp / requests）…"
mkdir -p "$APP_DIR"
[ -x "$PY" ] || python3 -m venv "$VENV"
"$PY" -m pip install -q -U pip yt-dlp requests
cp "$WORKER_DIR/push_note.py" "$APP_DIR/push_note.py"

DEFAULT_BASE="https://jackmouse-videonote.hf.space/api"
printf "后端 API 地址 [%s]: " "$DEFAULT_BASE"; read BASE || true
[ -z "$BASE" ] && BASE="$DEFAULT_BASE"
printf "访问密码 (WEB_ACCESS_PASSWORD，输入不显示): "; stty -echo 2>/dev/null || true; read PW || true; stty echo 2>/dev/null || true; echo

printf 'HF_API_BASE="%s"\n' "$BASE" > "$HOME/.videonote-worker.env"
printf '%s' "$PW" > "$HOME/.videonote-worker-password"
chmod 600 "$HOME/.videonote-worker.env" "$HOME/.videonote-worker-password"

cat > "$RUN" <<EOF
#!/bin/sh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH"
[ -f "\$HOME/.videonote-worker.env" ] && { set -a; . "\$HOME/.videonote-worker.env"; set +a; }
[ -f "\$HOME/.videonote-worker-password" ] && { WEB_PASSWORD="\$(cat "\$HOME/.videonote-worker-password")"; export WEB_PASSWORD; }
exec "$PY" "$APP_DIR/push_note.py" --daemon
EOF
chmod +x "$RUN"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.videonote.worker</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$RUN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo ""
echo "✅ 安装完成：worker 已启动，并设为开机自启。"
echo "   看日志:  tail -f $LOG"
echo "   改配置后重启:  launchctl kickstart -k \"gui/\$(id -u)/com.videonote.worker\""

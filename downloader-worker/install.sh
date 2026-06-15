#!/bin/sh
# 家用下载 worker 一键安装（macOS）：检测环境 → 输入密码 → 装好并启动 → 验证上线。
# 用法：在仓库 downloader-worker/ 目录执行  sh install.sh  （或双击 install.command）
set -e

# 既能在仓库里跑（sh install.sh），也能裸下载/管道跑（curl ... | sh）：
# 后者没有同目录的 push_note.py，会从 GitHub raw 拉取。
WORKER_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo /tmp)"
RAW_BASE="${WORKER_RAW_BASE:-https://raw.githubusercontent.com/xiaokeaijqx/VideoNote/main/downloader-worker}"
APP_DIR="$HOME/.videonote-worker"
VENV="$APP_DIR/venv"
PY="$VENV/bin/python"
RUN="$APP_DIR/run-daemon.sh"
PLIST="$HOME/Library/LaunchAgents/com.videonote.worker.plist"
LOG="$HOME/Library/Logs/videonote-worker.log"

echo "════════════════════════════════════════════"
echo "  VideoNote 本地下载器 安装 / 启动"
echo "════════════════════════════════════════════"

# ── 1. 检测环境 ───────────────────────────────────────────────
echo "[1/5] 检测本地环境…"
HAS_BREW=0; command -v brew >/dev/null 2>&1 && HAS_BREW=1

if command -v python3 >/dev/null 2>&1; then
  echo "  ✓ python3  $(python3 -V 2>&1 | awk '{print $2}')"
else
  echo "  ✗ python3 未安装。请先装 Python 3.10+（https://www.python.org 或 brew install python）后重跑。"
  exit 1
fi

if command -v ffmpeg >/dev/null 2>&1; then
  echo "  ✓ ffmpeg"
else
  if [ "$HAS_BREW" = 1 ]; then
    echo "  … ffmpeg 缺失，正在用 brew 安装（可能要几分钟）…"
    brew install ffmpeg && echo "  ✓ ffmpeg 已装" || { echo "  ✗ ffmpeg 安装失败，请手动 brew install ffmpeg"; exit 1; }
  else
    echo "  ✗ ffmpeg 未安装、且没有 brew。请先装 ffmpeg（音频处理必需）后重跑。"
    exit 1
  fi
fi

if command -v node >/dev/null 2>&1; then
  echo "  ✓ node    $(node -v 2>&1)（YouTube 全格式更稳）"
else
  echo "  ⚠ node 未安装：音频下载不受影响；想要 YouTube 视频全格式可 brew install node。"
fi

# ── 2. 输入连接信息 ───────────────────────────────────────────
echo "[2/5] 连接信息"
DEFAULT_BASE="https://jackmouse-videonote.hf.space/api"
# 从 /dev/tty 读，保证 `curl ... | sh`（stdin 是脚本管道）时也能交互输入
printf "  后端 API 地址 [%s]: " "$DEFAULT_BASE"; read BASE </dev/tty 2>/dev/null || true
[ -z "$BASE" ] && BASE="$DEFAULT_BASE"
printf "  访问密码（输入不显示）: "; stty -echo </dev/tty 2>/dev/null || true; read PW </dev/tty 2>/dev/null || true; stty echo </dev/tty 2>/dev/null || true; echo
if [ -z "$PW" ]; then echo "  ✗ 没输入密码，已取消。"; exit 1; fi

# ── 3. 装独立环境 ─────────────────────────────────────────────
echo "[3/5] 安装运行环境（独立 venv + yt-dlp）…"
mkdir -p "$APP_DIR"
[ -x "$PY" ] || python3 -m venv "$VENV"
"$PY" -m pip install -q -U pip yt-dlp requests
if [ -f "$WORKER_DIR/push_note.py" ]; then
  cp "$WORKER_DIR/push_note.py" "$APP_DIR/push_note.py"
else
  echo "  … 下载 push_note.py …"
  curl -fsSL "$RAW_BASE/push_note.py" -o "$APP_DIR/push_note.py" || { echo "  ✗ 下载 push_note.py 失败（检查网络）"; exit 1; }
fi

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

# ── 4. 配开机自启并启动 ───────────────────────────────────────
echo "[4/5] 配置开机自启并启动…"
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

# ── 5. 验证上线 ───────────────────────────────────────────────
echo "[5/5] 验证 worker 是否上线…"
sleep 5
ONLINE=$(curl -s -H "request-web-access-password: $PW" "$BASE/worker/config" 2>/dev/null || true)
echo ""
if printf '%s' "$ONLINE" | grep -q '"worker_online":true'; then
  echo "✅ 完成！worker 已上线、并设为开机自启。现在网页贴 YouTube 链接就会自动走本地下载。"
elif printf '%s' "$ONLINE" | grep -q 'worker_online'; then
  echo "✅ 已安装启动。worker 刚拉起，稍等几秒在网页「设置 → 本地下载器」看状态变「在线」。"
else
  echo "⚠️ 已安装启动，但没验到在线。可能密码不对或后端在重启。"
  echo "   看日志排查:  tail -f $LOG"
fi
echo "   重启 worker:  launchctl kickstart -k \"gui/\$(id -u)/com.videonote.worker\""

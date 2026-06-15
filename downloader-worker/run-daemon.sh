#!/bin/sh
# launchd 用的启动包装：加载本地环境（含 WEB_PASSWORD），补齐 PATH（ffmpeg/node），
# 再启动家用下载 worker 守护进程。
export PATH="/opt/homebrew/bin:/opt/homebrew/Cellar/node@24/24.15.0/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ENV_FILE="$HOME/.videonote-worker.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# 访问密码单独放一个「纯文本」文件（不经 shell 解析），避免密码里有特殊字符出问题。
PW_FILE="$HOME/.videonote-worker-password"
if [ -f "$PW_FILE" ]; then
  WEB_PASSWORD="$(cat "$PW_FILE")"
  export WEB_PASSWORD
fi

exec /Users/zhoujiaangyao/zhoujiangyao/AI/VideoNote/backend/.venv/bin/python \
     /Users/zhoujiaangyao/zhoujiangyao/AI/VideoNote/downloader-worker/push_note.py --daemon

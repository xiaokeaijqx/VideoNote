#!/usr/bin/env bash
set -e
# uncomment this for debugging
# set -x

# 切到项目根（假设脚本放在 script/ 目录）
cd "$(dirname "$0")/.."

echo "当前工作目录：$(pwd)"

# 清理旧的构建
echo "清理旧的构建..."
rm -rf backend/dist backend/build ./VideoMemo_frontend/src-tauri/bin/*
echo "清理完成。"

TARGET_TRIPLE=$(rustc -Vv | grep host | cut -f2 -d' ')
echo "Detected target triple: $TARGET_TRIPLE"

# --- 核心修改部分开始 ---

# 步骤 1: 为了避免 PyInstaller 的解析歧义，我们先手动复制文件
echo "为打包准备 .env 文件..."
cp backend/.env.example backend/.env

# 步骤 2: PyInstaller 打包，直接添加已存在的 .env 文件
echo "开始 PyInstaller 打包..."
python -m PyInstaller \
  -y \
  --name VideoMemoBackend \
  --paths backend \
  --distpath ./VideoMemo_frontend/src-tauri/bin \
  --workpath backend/build \
  --specpath backend \
  --hidden-import uvicorn \
  --hidden-import fastapi \
  --hidden-import starlette \
  --hidden-import chromadb.api.rust \
  --collect-all chromadb \
  --collect-all chromadb_rust_bindings \
  --exclude-module torch \
  --exclude-module torchvision \
  --exclude-module torchaudio \
  --exclude-module mlx_whisper.torch_whisper \
  --add-data "app/db/builtin_providers.json:." \
  --add-data ".env:." \
  "$(pwd)/backend/main.py"

# 步骤 3: 清理在项目根目录创建的临时 .env 文件
echo "清理临时的 .env 文件..."
rm backend/.env

# --- 核心修改部分结束 ---


# 重命名主执行文件以包含目标平台信息
mv \
 ./VideoMemo_frontend/src-tauri/bin/VideoMemoBackend/VideoMemoBackend\
 ./VideoMemo_frontend/src-tauri/bin/VideoMemoBackend/VideoMemoBackend-$TARGET_TRIPLE

echo "PyInstaller 打包完成。"
echo "打包后的目录内容："
ls -l ./VideoMemo_frontend/src-tauri/bin/VideoMemoBackend

echo "请检查 src-tauri/bin/VideoMemoBackend 目录，确认其中包含了名为 .env 的【文件】。"


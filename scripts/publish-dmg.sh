#!/usr/bin/env bash
# 把已构建的 macOS DMG 发布到 GitHub Release（按 tauri.conf.json 的版本号建/更新 tag）。
# 用法：先 `pnpm tauri build` 生成 dmg，再运行本脚本。
#   需要 gh 已登录：gh auth login   （或设置环境变量 GH_TOKEN）
set -euo pipefail

# 切到仓库根目录（脚本位于 scripts/ 下）
cd "$(dirname "$0")/.."

REPO="xiaokeaijqx/VideoNote"
CONF="VideoMemo_frontend/src-tauri/tauri.conf.json"

VERSION=$(grep -m1 '"version"' "$CONF" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -z "${VERSION:-}" ]; then
  echo "✗ 无法从 $CONF 解析版本号" >&2
  exit 1
fi
TAG="v${VERSION}"

DMG_DIR="VideoMemo_frontend/src-tauri/target/release/bundle/dmg"
# 匹配该版本的所有架构 dmg（aarch64 / x64）
mapfile -t DMGS < <(ls "$DMG_DIR"/VideoMemo_"${VERSION}"_*.dmg 2>/dev/null || true)
if [ "${#DMGS[@]}" -eq 0 ]; then
  echo "✗ 在 $DMG_DIR 找不到 VideoMemo_${VERSION}_*.dmg，请先 pnpm tauri build" >&2
  exit 1
fi

echo "→ 仓库:   $REPO"
echo "→ 版本:   $VERSION  (tag $TAG)"
echo "→ 产物:   ${DMGS[*]}"

if ! gh auth status >/dev/null 2>&1 && [ -z "${GH_TOKEN:-}" ]; then
  echo "✗ gh 未登录。请先运行：gh auth login（或设置 GH_TOKEN 环境变量）" >&2
  exit 1
fi

if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "→ Release $TAG 已存在，上传/覆盖资产…"
  gh release upload "$TAG" "${DMGS[@]}" -R "$REPO" --clobber
else
  echo "→ 创建 Release $TAG …"
  gh release create "$TAG" "${DMGS[@]}" -R "$REPO" \
    --title "VideoMemo $VERSION" \
    --notes "VideoMemo $VERSION（macOS）"
fi

URL=$(gh release view "$TAG" -R "$REPO" --json url -q .url 2>/dev/null || true)
echo "✓ 完成：${URL:-已发布}"

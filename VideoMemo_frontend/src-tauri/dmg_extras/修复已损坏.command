#!/bin/bash
# 双击运行：去掉 VideoMemo 的隔离属性，解决「已损坏」无法打开的问题。
APP="/Applications/VideoMemo.app"

echo "==============================================="
echo "  VideoMemo 「已损坏」修复工具"
echo "==============================================="
echo ""

if [ ! -d "$APP" ]; then
  echo "✗ 没找到 $APP"
  echo "  请先把 VideoMemo 拖到「应用程序 / Applications」文件夹，再运行本脚本。"
  echo ""
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi

echo "正在去除隔离属性（可能需要输入开机密码，输入时不显示是正常的）..."
sudo xattr -dr com.apple.quarantine "$APP"

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ 修复完成！现在可以正常双击打开 VideoMemo 了。"
else
  echo ""
  echo "✗ 修复失败，请重试，或手动执行："
  echo "  sudo xattr -dr com.apple.quarantine $APP"
fi
echo ""
read -n 1 -s -r -p "按任意键关闭本窗口..."

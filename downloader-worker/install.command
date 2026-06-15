#!/bin/sh
# 双击我即可：自动检测本地环境 → 输入访问密码 → 安装并启动本地下载器（开机自启）。
# （macOS 上 .command 文件双击会在「终端」里运行）
cd "$(dirname "$0")" || exit 1
sh ./install.sh
echo ""
printf "按回车键关闭此窗口…"
read _

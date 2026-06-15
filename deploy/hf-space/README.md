---
title: VideoMemo Backend
emoji: 🎬
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 8483
pinned: false
---

# VideoMemo 后端（API）

AI 视频笔记生成的后端服务。桌面端 / 网页端 / 浏览器插件连接本 Space 的地址使用。

- **结构化数据**（LLM 供应商配置与 API key、模型、关键词订阅、通知渠道、任务索引）
  持久化到外接 Postgres（Supabase），通过 `DATABASE_URL` Secret 配置。
- **本 Space 公开可访问**：务必设置 `WEB_ACCESS_PASSWORD` Secret，否则任何人都能调用你的后端。
- 笔记正文 / 截图 / 向量库当前仍是容器内临时文件，**重启会清空**（计划后续迁入 Postgres / 对象存储）。

> 部署步骤见仓库 `deploy/hf-space/DEPLOY.md`。

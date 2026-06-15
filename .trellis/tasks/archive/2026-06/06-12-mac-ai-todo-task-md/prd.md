# Mac 桌面端 AI Todo 浮窗（task.md 驱动）

## Goal

做一个 macOS 桌面小工具：打开/关联一个 `task.md` 文件，提供一个简约圆角的"悬浮小窗"，
用户可以一条条写待办（写法直接落 `.md`），小窗可以置顶在屏幕最上层、可以拖拽、可以收起。
每次点"执行"，让 AI 一次完成所有未划线（未完成）的待办；AI 完成一条就在 `.md` 里用
`~~item~~` 划线，小窗 UI 同步渲染为划线态。所有待办都完成后，播放通知铃声。

## What I already know

* 仓库根 `/Users/kiwa/kiwa/VideoMemo` 是一个 AI 视频笔记工具（VideoMemo）。
* 已有 Tauri 2.x 桌面端（`VideoMemo_frontend/src-tauri/`），bundle id `com.videomemo.desktop`，
  配 React 19 + Vite + Tailwind + shadcn/ui，package.json 名为 `VideoMemo_frontend`。
* 已有 FastAPI 后端（`backend/`），带 LLM provider / model 体系（`app/gpt/`,
  `app/services/note.py` 等）；`main.py` 的 CORS 已放过 `tauri.localhost`。
* Tauri 2 插件当前只引入了 `log` + `shell`（shell 用于 sidecar 启动 VideoMemoBackend）。
  还需要：always-on-top、window drag、tray、notification、sound、fs（读写 task.md）。
* 浏览器扩展（`VideoMemo_extension/`）是独立项目，遵循同一套 backend 协议。
* `.trellis/spec/frontend/` 规范目前大部分是占位（`(To be filled by the team)`），
  本任务可以顺手沉淀一些 floating-window / editor / task-list 规范。

## Assumptions (temporary)

* 用户主要在 macOS 上使用，暂不需要 Windows / Linux。
* "AI 完成"的最朴素含义是：让 LLM 看完整份 task.md，输出"完成报告"，我们用规则
  把报告里"已完成"的标题项在 `.md` 中改写为 `~~item~~` 并同步 UI。
* task.md 是普通 UTF-8 Markdown，每行一个 `- [ ] item` / `- [x] item` 形式的 checkbox。
* AI backend 复用 VideoMemo 现成的 FastAPI（provider/model 用户在 SettingPage 已配好），
  本地起 8483 端口；扩展也走这套，避免重复接入 Anthropic / OpenAI 鉴权。
* 小窗 = 单独的 Tauri Webview 窗口（独立于 VideoMemo 主窗 1600×1000），frameless +
  透明背景 + 圆角；通过 tray 图标唤起/隐藏。

## Open Questions (待问)

1. **项目形态**：作为 VideoMemo Tauri 的"附加窗口 / 模块"上线，
   还是新开一个独立 Tauri 子项目（如 `VideoMemo_todo/`）？
2. **AI 完成语义**：让 LLM 只"口头报告完成"（最简单），还是要 AI 真的能调工具
   （shell、浏览器、文件编辑）去执行任务？后者要 MCP / Function Calling，工作量是
   另一个量级。
3. **执行模型**：点一次执行 = 处理全部未完成项；还是只处理第一项；或用户能选？
4. **task.md 位置**：用户在 UI 里点"选择文件"指定，还是固定 `~/Documents/task.md`，
   还是跟随项目根？
5. **声音**：系统 `NSSound` / `afplay` 还是自带音频文件？要可关。
6. **拖拽 + 收起**：收起是收缩到一行（只剩标题+输入框），还是缩到屏幕角落的小圆点？
7. **多 task.md**：单文件 vs 支持多个（侧边栏切换）？
8. **离线/网络异常**：后端 8483 没起、AI 调用失败时怎么降级？

## Requirements (evolving)

* 打开/关联一个 `.md` 文件，UI 与文件双向同步。
* 简约圆角小窗（建议 ≤ 420×520，frameless + vibrancy / 透明 + `borderRadius`）。
* 始终置顶（`window.setAlwaysOnTop(true)`），且能切换。
* 拖拽移动（标题栏 / 任意空白区域 drag），能折叠 / 展开。
* 列表项可勾选、添加、删除、改写；勾掉一项 → `.md` 改写为 `- [x] item`，
  反之取消勾选回到 `- [ ] item`。
* "执行"按钮触发 AI 流程：扫描未划线项 → 调 LLM → 把对应行改写为划线。
* 所有未划线项都已划线后：弹 macOS 通知 + 播放铃声。
* 启动方式：菜单栏 tray icon 单击切换显隐；也可以从 VideoMemo 主程序一键唤起。

## Acceptance Criteria (evolving)

* [ ] 启动小窗后能在 UI 上加 / 删 / 改 / 勾选条目，磁盘上 `task.md` 同步更新。
* [ ] 小窗能稳定置顶，且能用鼠标在任意空白处拖动。
* [ ] 小窗能折叠成一行 / 展开；折叠态仍可输入。
* [ ] 点击"执行"，未划线项被 AI 一次处理；`.md` 中相应行被改为 `~~item~~`，
      UI 列表同步呈现划线。
* [ ] 所有未划线项都已划线后，触发通知 + 铃声（用户可在设置里关声音）。
* [ ] 关闭小窗不丢数据；再次打开仍读 `task.md` 当前状态。
* [ ] 后端不可达时给出明确 UI 提示，不静默失败。

## Definition of Done (team quality bar)

* Tauri 配置允许 alwaysOnTop / transparent / decorations=false，附 `task.md` 读写权限。
* 后端新增（或复用）`POST /todo/execute` 端点：入参 task.md 全文，调用 LLM，
  返回"已完成的标题 + 完成说明"。小窗把报告映射回原行做划线。
* 至少 e2e 一条：加 3 条 todo → 调本地 mock LLM 完成全部 → `.md` 全部划线 → 铃声触发。
* Lint / TypeScript check / `pnpm build` 通过。
* **README 更新**：把新功能（Mac AI Todo 浮窗）写进项目根 `README.md`，
  包括：功能简介、用户视角的操作步骤、技术栈、怎么开发/打包、与 VideoMemo 主程序的关系。
* **Git 推送**：本任务所有改动（含 README）按 `git add` → `commit` → `push` 推到远程。
  push 前先确认没有意外文件被纳入（如 `.trellis/`、`.agent/`、`video_memo.db` 等应被忽略）。
* 简短 README 段落讲清如何启动 / 打包。

## Out of Scope (explicit, for v1)

* iOS / iPadOS 版本。
* 多用户协作 / 同步（仅本地单文件）。
* 复杂任务依赖关系（每条 todo 是平铺的，AI 自行处理先后）。
* 自定义"执行什么"——v1 只走单一 LLM 调用，不接 MCP / shell 工具。
* 历史回滚 / 多版本 task.md（v1 直接覆盖保存）。

## Technical Notes

* Tauri 2 实现要点：
  * `window.setAlwaysOnTop(true)`，需要在 `tauri.conf.json` 允许 `core:window:allow-set-always-on-top`。
  * `decorations: false` + `transparent: true` + CSS `border-radius` + `vibrancyEffect` 做 macOS 圆角。
  * 拖拽：`data-tauri-drag-region` 标记根容器；或在 Rust 端用
    `app.on_window_event` 监听 `mouse_down` 调 `start_dragging()`。
  * 折叠：在前端用 CSS 收起 + 调 `appWindow.setSize(逻辑尺寸)`。
  * 通知：`tauri-plugin-notification`；声音：`tauri-plugin-audio` 或 Rust 调
    `macos` crate 直接 `NSSound`，或 `tauri::api::process::Command::new("afplay")`。
  * 读 `task.md`：直接通过 `@tauri-apps/plugin-fs` 读本地文件，path 由用户授权。
* 后端：FastAPI 已运行 8483；新增一个轻 endpoint `POST /api/todo/execute`，
  body 是 `{ content: str }`，返回 `{ results: [{ originalLine, completed: bool, note: str }] }`。
  LLM 选 OpenAI 兼容协议（provider 系统已经统一）。prompt 让模型逐条判断"是否算完成"并给理由。
* 复用 provider/model：`backend/app/services/chat_service.py` 的入参风格可以借鉴。
* tray 图标：Tauri 2 用 `tauri-plugin-tray`（需要在 Cargo 加 deps + capabilities 允许）。
* 项目根 `tasks.md` 已存在（这是仓库自带，不是用户待办），所以新加的"task.md"文件
  默认放在用户 `$HOME/VideoMemo_todo/task.md` 或通过 UI 选择。

## Research References

* TBD：Tauri 2 浮窗 + always-on-top + 透明 + 拖拽 + tray 的官方示例 / 最佳实践。
* TBD：macOS 上 Tauri 播放系统/自定义声音的最简方案。
* TBD：是否值得在 brainstorm 中做 `trellis-research` 分发。

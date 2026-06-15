# 把 VideoMemo 后端部署到 Hugging Face Spaces + Supabase

> 目标：后端跑在 HF Spaces（免费 2核/16GB），结构化数据持久化到 Supabase Postgres。
> 桌面端/网页端连 Space 的公开地址使用。

---

## 一、你需要先准备的东西（提供给我或自己填）

| # | 东西 | 从哪拿 | 用途 |
|---|------|--------|------|
| 1 | **Hugging Face 账号** | huggingface.co 注册 | 创建 Space |
| 2 | **Supabase 项目 + Session Pooler 连接串** | Supabase 后台 → Project Settings → Database → Connection string → **Session pooler** | 设成 `DATABASE_URL` |
| 3 | **Supabase 数据库密码** | 建项目时设的，或在上面页面 Reset | 拼进连接串 |
| 4 | **一个访问密码（自定义字符串）** | 自己想一个 | 设成 `WEB_ACCESS_PASSWORD`，保护公开后端 |
| 5 | **至少一个 LLM 供应商的 API Key** | OpenAI / DeepSeek / 通义 等 | 部署后在网页 UI 里填（存进 Supabase） |
| 6 | （可选）**Groq API Key** | console.groq.com | 想用在线转写省内存时设 `TRANSCRIBER_TYPE=groq` + `GROQ_API_KEY` |
| 7 | （可选）**B站/抖音 Cookie** | 浏览器导出 | 国外 IP 抓国内平台被风控时，部署后在 UI「下载配置」填 |

> ⚠️ Supabase **一定用 Session Pooler 那条**（`...pooler.supabase.com:5432`，IPv4）。
> 直连 `db.xxx.supabase.co` 现在只有 IPv6，HF 连不上。

---

## 二、组装 Space 仓库

HF Space 是一个独立 git 仓库。把它的根目录布置成：

```
README.md      ← 复制 deploy/hf-space/README.md
Dockerfile     ← 复制 deploy/hf-space/Dockerfile
backend/       ← 复制本项目整个 backend 目录
```

最简单的做法：
```bash
# 1) 在 HF 网站建一个 Space：SDK 选 Docker，建好后 clone 它
git clone https://huggingface.co/spaces/<你的用户名>/<space名> hf-space
cd hf-space

# 2) 从本项目拷文件进来
cp /path/to/VideoNote/deploy/hf-space/README.md   ./README.md
cp /path/to/VideoNote/deploy/hf-space/Dockerfile  ./Dockerfile
cp -r /path/to/VideoNote/backend                  ./backend

# 3) 别把密钥/本地库带上去
echo -e "backend/config/\nbackend/app/db/*.db\nbackend/note_results/\nbackend/static/\n__pycache__/" > .gitignore
```

---

## 三、设置 Space 的 Secrets（不要写进仓库）

HF Space 页面 → **Settings → Variables and secrets**，加 **Secret**：

| Key | Value | 必填 |
|-----|-------|------|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<密码>@aws-0-<区域>.pooler.supabase.com:5432/postgres?sslmode=require` | ✅ |
| `WEB_ACCESS_PASSWORD` | 你自定义的访问密码 | ✅ 强烈建议 |
| `DB_POOL_SIZE` | `5`（免费档省连接数，可选） | ⬜ |
| `TRANSCRIBER_TYPE` | `groq`（想用在线转写时，配合下一行） | ⬜ |
| `GROQ_API_KEY` | 你的 Groq key | ⬜ |

> 16GB 内存够跑本地 Whisper，不配 Groq 也行（默认 fast-whisper tiny，首次转写会下模型）。

---

## 四、推送 → 构建 → 验证

```bash
git add -A && git commit -m "deploy videomemo backend" && git push
```
HF 会自动构建并启动（首次构建较久，依赖重）。完成后：

- 打开 `https://<用户名>-<space名>.hf.space/sys_check` → 返回 `{"code":0,...}` 即后端活着。
- Space 首次启动 `init_db` 会在 Supabase 自动建表。去 Supabase Table Editor 应能看到 `providers`、`models`、`notification_channels` 等表。

---

## 五、客户端接入

- **桌面端 / 浏览器插件**：在它们的设置里把后端地址改成 `https://<用户名>-<space名>.hf.space`，并填上 `WEB_ACCESS_PASSWORD`（CORS 已默认放行 tauri / 扩展来源）。
- **独立网页前端**（部署在别处）：当前后端 CORS 只放行 localhost / tauri / 扩展。要让别的域名的网页访问，得把该域名加进 `backend/main.py` 的 `CORS_ORIGIN_REGEX`。需要的话告诉我你的前端域名，我加上。

---

## 已知边界（符合"先做基础设施、后迁持久化"的计划）

- ✅ 现在持久：LLM 配置/Key、模型、订阅、通知渠道、任务索引（在 Supabase）。
- ⛔ 仍会随重启丢：笔记正文、转写、截图、向量库、`config/*.json`（飞书/代理/Cookie）。
  - 临时缓解：笔记在前端 IndexedDB 有副本可看；飞书/代理/Cookie 可改用环境变量注入。
  - 后续计划：把笔记与配置迁入 Postgres 或对象存储（R2/MinIO）。

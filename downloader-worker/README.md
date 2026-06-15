# 家用下载 worker（downloader-worker）

在**你自己的机器**（住宅 IP）上下载，再把文件推给远程 VideoNote 后端生成笔记。
解决机房 IP（HF）被 YouTube 等平台风控（`SSL EOF` / `Failed to extract player response`）的问题。

```
本机 docker:  yt-dlp 下载(你家 IP) ──→ POST /api/upload ──→ POST /api/generate_note(platform=local)
                                                                      │
远程后端(HF):                              转写 → LLM 总结 → 笔记 → 存 Supabase
```
家里只**主动外连**服务器，无需内网穿透、无需任务队列。

## 媒体类型
- **默认**：只下/传**音频**（mp3，小、快），笔记无截图。
- **`--screenshot`**：下/传**视频**（mp4），服务器能生成带截图的笔记（体积大些）。

## 构建
```bash
cd downloader-worker
docker build -t videonote-dl .
```

## 用法
```bash
docker run --rm \
  -e HF_API_BASE="https://jackmouse-videonote.hf.space/api" \
  -e WEB_PASSWORD="你的访问密码" \
  videonote-dl "https://www.youtube.com/watch?v=XXXX"
```
要截图就加 `--screenshot`：
```bash
docker run --rm -e HF_API_BASE=... -e WEB_PASSWORD=... \
  videonote-dl "https://youtu.be/XXXX" --screenshot
```

### 需要 cookie 的视频（YouTube 登录 / 会员等）
导出 `cookies.txt`（Netscape 格式，浏览器扩展如 “Get cookies.txt LOCALLY”），挂进容器：
```bash
docker run --rm \
  -e HF_API_BASE=... -e WEB_PASSWORD=... \
  -e YT_COOKIES=/cookies.txt \
  -v /本机路径/cookies.txt:/cookies.txt:ro \
  videonote-dl "https://youtu.be/XXXX"
```

## 环境变量
| 变量 | 说明 |
|------|------|
| `HF_API_BASE` | 远程后端 API 基址，默认 `https://jackmouse-videonote.hf.space/api` |
| `WEB_PASSWORD` | 访问密码（与后端 `WEB_ACCESS_PASSWORD` 一致）；后端设了就必填 |
| `PROVIDER_ID` / `MODEL_NAME` | 指定 LLM 供应商/模型；不填则自动取服务器上第一个有启用模型的 |
| `YT_COOKIES` | 可选，容器内 cookies.txt 路径 |

## 命令行参数
`url`（必填）、`--screenshot`、`--link`、`--style <风格>`、`--quality fast|medium|slow`、`--provider <id>`、`--model <名>`

## 不想用 Docker？
直接本机跑也行（需 Python3 + ffmpeg + 已装 yt-dlp）：
```bash
pip install -U yt-dlp requests
HF_API_BASE=... WEB_PASSWORD=... python push_note.py "<链接>"
```

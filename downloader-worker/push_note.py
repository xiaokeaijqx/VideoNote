#!/usr/bin/env python3
"""家用下载 worker —— 在住宅 IP 上用 yt-dlp 下载，再把文件推给远程 VideoNote 后端生成笔记。

为什么要它：HF 等机房 IP 会被 YouTube 等平台风控（SSL EOF / 提取失败）。把"下载"这步
放到你家网络做，其余（转写 / 总结 / 存库）仍在服务器。家里只**主动外连**服务器，
不需要内网穿透、不需要任务队列。

流程：
  yt-dlp 下载(你家 IP) → POST /api/upload 上传文件 → POST /api/generate_note(platform=local)
  → 轮询 /api/task_status 直到完成 → 打印笔记 task_id

媒体类型跟随截图开关：
  不要截图(默认) → 只下/传音频 mp3（小、快）
  --screenshot   → 下/传视频 mp4（HF 能生成截图）

用法：
  python push_note.py "<视频链接>" [--screenshot] [--link] [--style 风格] \
      [--provider <id>] [--model <名>] [--quality fast|medium|slow]

环境变量：
  HF_API_BASE   远程后端 API 基址，默认 https://jackmouse-videonote.hf.space/api
  WEB_PASSWORD  访问密码（与后端 WEB_ACCESS_PASSWORD 一致）。后端设了就必填。
  PROVIDER_ID   指定 LLM 供应商 id（不填则自动取服务器上第一个有启用模型的）
  MODEL_NAME    指定模型名（同上自动）
  YT_COOKIES    可选，cookies.txt 路径（Netscape 格式），给需要登录的平台用
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import requests


def _env(name, default=None):
    return os.getenv(name, default)


def _safe_filename(name: str, fallback: str = "video") -> str:
    """保留中文/字母数字，去掉会破坏路径的字符；过长截断。"""
    name = (name or "").strip()
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)
    name = name.strip(". ")
    return (name[:150] or fallback)


def ytdlp_download(url: str, tmpdir: str, want_video: bool, cookies: str | None):
    """下载到 tmpdir，固定文件名 media.*，并写 info.json 拿真实标题。返回 (文件路径, 标题)。"""
    out_tmpl = os.path.join(tmpdir, "media.%(ext)s")
    # 用 `python -m yt_dlp` 而非裸 `yt-dlp`，保证用的是当前环境里的 yt-dlp（venv / 镜像皆可）。
    cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--write-info-json", "-o", out_tmpl]
    if cookies:
        cmd += ["--cookies", cookies]
    if want_video:
        cmd += ["-f", "bv*+ba/b", "--merge-output-format", "mp4"]
    else:
        cmd += ["-x", "--audio-format", "mp3"]
    cmd.append(url)

    print(f"[worker] yt-dlp 下载中（{'视频' if want_video else '音频'}）…", flush=True)
    if subprocess.run(cmd).returncode != 0:
        raise RuntimeError("yt-dlp 下载失败。若是 YouTube 风控，试试用 YT_COOKIES 提供 cookie。")

    # 真实标题取自 info.json（保留中文）；拿不到就退回文件名
    title = None
    info_files = glob.glob(os.path.join(tmpdir, "*.info.json"))
    if info_files:
        try:
            title = json.loads(open(info_files[0], encoding="utf-8").read()).get("title")
        except Exception:
            pass

    media = [f for f in glob.glob(os.path.join(tmpdir, "media.*")) if not f.endswith(".info.json")]
    if not media:
        raise RuntimeError("下载完成但没找到媒体文件")
    filepath = max(media, key=os.path.getsize)  # 取成品（合并后最大的）
    return filepath, (title or "video")


def pick_model(base: str, headers: dict):
    """没指定时，自动取服务器上第一个有启用模型的供应商 + 它的第一个启用模型。"""
    providers = (requests.get(f"{base}/get_all_providers", headers=headers, timeout=30)
                 .json().get("data") or [])
    for p in providers:
        pid = p.get("id") if isinstance(p, dict) else None
        if not pid:
            continue
        models = (requests.get(f"{base}/model_enable/{pid}", headers=headers, timeout=30)
                  .json().get("data") or [])
        if models:
            m = models[0]
            mname = m.get("model_name") if isinstance(m, dict) else str(m)
            if mname:
                return pid, mname
    sys.exit("[worker] 服务器上没有可用模型，请先在网页端配好 LLM，或用 --provider/--model 指定。")


def run_daemon(base: str, headers: dict, cookies: str | None):
    """守护模式：常驻轮询服务器的下载任务（网页一键触发的那种），认领→下载→回传。"""
    print(f"[worker] 守护模式启动，轮询 {base}/worker/next …（Ctrl-C 退出）", flush=True)
    while True:
        try:
            resp = requests.get(f"{base}/worker/next", headers=headers, timeout=30)
            if resp.status_code == 401:
                print("[worker] ⚠️ 访问密码错误或未设置(WEB_PASSWORD)，修正后重启 worker。", flush=True)
                time.sleep(10)
                continue
            r = resp.json()
        except Exception as e:
            print(f"[worker] 轮询出错（5s 后重试）: {e}", flush=True)
            time.sleep(5)
            continue
        job = (r.get("data") or {}) if isinstance(r, dict) else {}
        jid = job.get("job_id")
        if not jid:
            time.sleep(3)
            continue
        url, want_video = job.get("url"), bool(job.get("want_video"))
        print(f"\n[worker] 认领任务 {jid}: {url}（{'视频' if want_video else '音频'}）", flush=True)
        try:
            with tempfile.TemporaryDirectory(prefix="vn-dl-") as tmp:
                filepath, title = ytdlp_download(url, tmp, want_video, cookies)
                ext = os.path.splitext(filepath)[1] or (".mp4" if want_video else ".mp3")
                upload_name = _safe_filename(title) + ext
                print(f"[worker] 已下载「{title}」，回传中…", flush=True)
                with open(filepath, "rb") as f:
                    resp = requests.post(f"{base}/worker/complete", headers=headers,
                                         data={"job_id": jid},
                                         files={"file": (upload_name, f)}, timeout=900).json()
            if resp.get("code") != 0:
                print(f"[worker] 回传失败: {resp.get('msg')}", flush=True)
            else:
                print(f"[worker] ✅ 任务 {jid} 已回传，服务器开始转写+总结。", flush=True)
        except Exception as e:
            print(f"[worker] 任务 {jid} 失败: {e}", flush=True)
            try:
                requests.post(f"{base}/worker/fail", headers=headers,
                              json={"job_id": jid, "error": str(e)}, timeout=30)
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser(description="家用下载 worker：下载后推送到远程后端生成笔记")
    ap.add_argument("url", nargs="?", help="视频链接（一次性模式必填；--daemon 模式不用）")
    ap.add_argument("--daemon", action="store_true",
                    help="守护模式：常驻轮询服务器的下载任务（网页一键触发用）")
    ap.add_argument("--screenshot", action="store_true", help="要截图（会下载并上传视频，体积更大）")
    ap.add_argument("--link", action="store_true", help="笔记里插入原片链接")
    ap.add_argument("--style", default=None, help="笔记风格")
    ap.add_argument("--quality", default="fast", choices=["fast", "medium", "slow"])
    ap.add_argument("--provider", default=_env("PROVIDER_ID"), help="LLM 供应商 id")
    ap.add_argument("--model", default=_env("MODEL_NAME"), help="模型名")
    args = ap.parse_args()

    base = _env("HF_API_BASE", "https://jackmouse-videonote.hf.space/api").rstrip("/")
    password = _env("WEB_PASSWORD", "")
    cookies = _env("YT_COOKIES")
    headers = {"request-web-access-password": password} if password else {}
    want_video = args.screenshot

    if args.daemon:
        run_daemon(base, headers, cookies)
        return

    if not args.url:
        sys.exit("[worker] 一次性模式需要给出视频链接；常驻轮询请用 --daemon。")

    provider_id, model_name = args.provider, args.model
    if not (provider_id and model_name):
        provider_id, model_name = pick_model(base, headers)
    print(f"[worker] 使用模型: provider={provider_id} model={model_name}", flush=True)

    with tempfile.TemporaryDirectory(prefix="vn-dl-") as tmp:
        try:
            filepath, title = ytdlp_download(args.url, tmp, want_video, cookies)
        except RuntimeError as e:
            sys.exit(f"[worker] {e}")
        ext = os.path.splitext(filepath)[1] or (".mp4" if want_video else ".mp3")
        upload_name = _safe_filename(title) + ext
        print(f"[worker] 已下载: {title} ({os.path.getsize(filepath)//1024} KB)，上传中…", flush=True)

        # 1) 上传文件 → /uploads/<name>
        with open(filepath, "rb") as f:
            resp = requests.post(f"{base}/upload", headers=headers,
                                 files={"file": (upload_name, f)}, timeout=900).json()
        if resp.get("code") != 0:
            sys.exit(f"[worker] 上传失败: {resp.get('msg')}")
        uploaded_url = resp["data"]["url"]
        print(f"[worker] 上传完成: {uploaded_url}", flush=True)

        # 2) 触发生成（platform=local，服务器从这个文件转写+总结）
        payload = {
            "video_url": uploaded_url,
            "platform": "local",
            "quality": args.quality,
            "screenshot": want_video,
            "link": args.link,
            "model_name": model_name,
            "provider_id": provider_id,
            "style": args.style,
            "format": [],
        }
        resp = requests.post(f"{base}/generate_note", headers=headers, json=payload, timeout=120).json()
        if resp.get("code") != 0:
            sys.exit(f"[worker] 触发生成失败: {resp.get('msg')}")
        task_id = resp["data"]["task_id"]
        print(f"[worker] 已提交，task_id={task_id}，等待服务器转写+总结…", flush=True)

    # 3) 轮询直到完成（文件已上传，本地临时目录可以释放了）
    while True:
        time.sleep(3)
        try:
            r = requests.get(f"{base}/task_status/{task_id}", headers=headers, timeout=30).json()
        except Exception as e:
            print(f"[worker] 查询状态出错（重试）: {e}", flush=True)
            continue
        data = r.get("data") or {}
        status = data.get("status")
        if r.get("code") != 0 or status == "FAILED":
            sys.exit(f"[worker] 任务失败: {r.get('msg') or data.get('message')}")
        print(f"[worker] {status} {data.get('message', '')}", flush=True)
        if status == "SUCCESS":
            print(f"\n[worker] ✅ 完成！task_id={task_id}\n打开网页端即可看到这条笔记。", flush=True)
            return


if __name__ == "__main__":
    main()

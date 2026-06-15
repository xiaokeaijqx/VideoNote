# VideoMemo 后端 —— Hugging Face Spaces（Docker SDK）部署用 Dockerfile。
#
# 用法：HF Space 是一个独立 git 仓库，把它的根目录布置成：
#   /Dockerfile     ← 本文件（复制到 Space 根目录，重命名为 Dockerfile）
#   /README.md      ← deploy/hf-space/README.md（含 HF 必需的 frontmatter）
#   /backend/...    ← 从本项目复制整个 backend 目录过去
# 然后 git push 到 Space，HF 会构建本文件（COPY 路径相对 Space 根目录）。
#
# 镜像故意精简：只装 ffmpeg + 后端依赖，默认走 REST 飞书推送，不装 lark-cli。
# 数据库用外接 Postgres（Supabase），通过 DATABASE_URL Secret 注入。
ARG BASE_REGISTRY=docker.io
FROM ${BASE_REGISTRY}/library/python:3.11-slim

# HF 在 huggingface.co 自家基础设施上构建/运行：用官方 PyPI 与默认 HF 端点，
# 不要用国内镜像（那会更慢甚至失败）。
ARG PIP_INDEX=https://pypi.org/simple

# fonts-liberation 提供与 Arial 度量兼容的 LiberationSans，替代仓库里的 arial.ttf
# （HF git 不收二进制，故字体不进仓库，改由镜像在构建时提供）
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    BACKEND_HOST=0.0.0.0 \
    BACKEND_PORT=8483 \
    STATIC=/static \
    OUT_DIR=/app/static/screenshots \
    IMAGE_BASE_URL=/static/screenshots \
    NOTE_OUTPUT_DIR=/app/data/note_results \
    DATA_DIR=/app/data

WORKDIR /app

# 先装依赖利用层缓存
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -i ${PIP_INDEX} -r requirements.txt

# 再复制后端代码
COPY backend /app

# 预建可写目录（HF 容器以 root 运行，这些目录是临时盘——重启会清空，
# 所以结构化数据务必走外接 DATABASE_URL；笔记/截图属临时数据，后续可再迁对象存储）
RUN mkdir -p /app/data/note_results /app/static/screenshots /app/config /app/fonts && \
    cp /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf /app/fonts/arial.ttf

EXPOSE 8483
CMD ["python", "main.py"]

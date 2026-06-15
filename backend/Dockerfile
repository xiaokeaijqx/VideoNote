# BASE_REGISTRY 默认走 docker.io；国内拉不到 docker.io 时可换 daocloud / 阿里云 / 自建镜像源：
#   docker-compose build --build-arg BASE_REGISTRY=docker.m.daocloud.io
# 或写到 docker-compose.yml 的 build.args / 环境变量里
ARG BASE_REGISTRY=docker.io
FROM ${BASE_REGISTRY}/library/python:3.11-slim

ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG PIP_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple

RUN rm -f /etc/apt/sources.list && \
    rm -rf /etc/apt/sources.list.d/* && \
    echo "deb https://${APT_MIRROR}/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb https://${APT_MIRROR}/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb https://${APT_MIRROR}/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/bin:${PATH}"
ENV HF_ENDPOINT=https://hf-mirror.com

# 飞书「推送方式 = lark-cli / auto」时需要官方 lark CLI（npm 包 @larksuite/cli，二进制名 lark-cli）。
# 走 REST 直连推送则用不到，可按需删除本段以瘦身镜像。
# 凭证通过 LARK_APP_ID / LARK_APP_SECRET 环境变量在运行时注入（由后端调用时传入），此处不写死。
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    npm config set registry ${NPM_REGISTRY} && \
    npm install -g @larksuite/cli && \
    rm -rf /var/lib/apt/lists/* /root/.npm && \
    (lark-cli --version || true)

WORKDIR /app

# 先复制 requirements.txt 利用层缓存
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -i ${PIP_INDEX} -r requirements.txt

# 再复制应用代码（频繁变动不影响 pip 缓存层）
COPY ./backend /app

CMD ["python", "main.py"]

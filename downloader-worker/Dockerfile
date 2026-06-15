# 家用下载 worker —— 在你自己机器（住宅 IP）上跑，绕开机房 IP 被平台风控的问题。
# 只装 ffmpeg + yt-dlp + requests，镜像很小。
FROM python:3.11-slim

# ffmpeg：yt-dlp 抽音频/合并视频用。curl：装 deno 用。
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# deno：YouTube 的 n-signature 挑战需要 JS 运行时，装上能提高取流成功率（yt-dlp 自动探测 PATH 上的 deno）。
RUN curl -fsSL https://deno.land/install.sh | sh && \
    ln -s /root/.deno/bin/deno /usr/local/bin/deno
ENV DENO_INSTALL=/root/.deno

# 始终用最新 yt-dlp（平台接口变动频繁），requests 调远程后端。
RUN pip install --no-cache-dir -U yt-dlp requests

WORKDIR /app
COPY push_note.py /app/push_note.py

ENTRYPOINT ["python", "/app/push_note.py"]

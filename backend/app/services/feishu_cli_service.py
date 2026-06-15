from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional

from app.services.feishu_config_manager import FeishuConfigManager
from app.services.feishu_service import FeishuError, FeishuService

logger = logging.getLogger(__name__)

CLI_TIMEOUT = 120  # seconds，导入/创建文档可能稍慢


class FeishuCliService:
    """通过官方 lark CLI（npm 包 @larksuite/cli，二进制名 lark-cli）推送笔记到飞书文档。

    鉴权用「机器人 key」即自建应用凭证：把 LARK_APP_ID / LARK_APP_SECRET 注入子进程环境，
    CLI 会自动走 tenant_access_token 流程（与 REST 同一把 key、同一身份），无需交互式登录。
    适用于后端独立部署（Docker，镜像内 npm 安装好 lark-cli）的场景。

    注意：lark-cli 的 `docs +create --markdown` 在部分版本存在「只写首行」的已知问题
    （larksuite/cli issue #82）。本类已用 --format json 解析返回，若你的版本仍截断，
    建议升级 lark-cli，或在「设置 → 飞书推送」把推送方式切回 REST 直连。
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.cfg = config or FeishuConfigManager().get_config()
        self.cli_path = (self.cfg.get("cli_path") or "lark-cli").strip() or "lark-cli"
        self.app_id = (self.cfg.get("app_id") or "").strip()
        self.app_secret = (self.cfg.get("app_secret") or "").strip()
        self.base_url = (self.cfg.get("base_url") or "https://open.feishu.cn").rstrip("/")
        self.folder_token = (self.cfg.get("folder_token") or "").strip()

    # ─── 可用性 / 环境 ───────────────────────────────────────────────────────
    def resolve_cli(self) -> Optional[str]:
        """返回 lark-cli 可执行文件的绝对路径；找不到返回 None。"""
        return shutil.which(self.cli_path)

    def is_available(self) -> bool:
        return self.resolve_cli() is not None

    def _env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env["LARK_APP_ID"] = self.app_id
        env["LARK_APP_SECRET"] = self.app_secret
        # 海外 Lark 用 larksuite，国内飞书用 feishu；按配置的开放平台域名推断
        env["LARK_DOMAIN"] = "larksuite" if "larksuite" in self.base_url else "feishu"
        # 避免 CLI 启交互式 TUI / 等待浏览器
        env["CI"] = "true"
        env["NO_COLOR"] = "1"
        return env

    def _run(self, args: List[str]) -> subprocess.CompletedProcess:
        cli = self.resolve_cli()
        if not cli:
            raise FeishuError(
                f"未找到 lark CLI（{self.cli_path}）。请在后端环境安装："
                "npm install -g @larksuite/cli，或在「设置 → 飞书推送」把推送方式切回 REST 直连"
            )
        if not (self.app_id and self.app_secret):
            raise FeishuError("飞书未配置 App ID / App Secret，无法用 lark-cli 推送")
        try:
            return subprocess.run(
                [cli, *args],
                env=self._env(),
                capture_output=True,
                text=True,
                timeout=CLI_TIMEOUT,
            )
        except FileNotFoundError as exc:
            raise FeishuError(f"无法执行 lark-cli：{exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise FeishuError("lark-cli 执行超时（文档可能仍在生成中），可稍后重试") from exc

    # ─── 公有方法 ────────────────────────────────────────────────────────────
    def test_connection(self) -> Dict[str, Any]:
        """验证：lark-cli 存在且凭证可用。凭证有效性用 REST 换 token 验证（同一把 key）。"""
        if not self.is_available():
            raise FeishuError(
                f"未找到 lark CLI（{self.cli_path}）。请安装 @larksuite/cli，或改用 REST 直连"
            )
        # 与 CLI 同一把 app key：用 REST 换一次 token 即可确认凭证有效，不依赖 CLI 的登录态命令
        FeishuService(self.cfg)._get_tenant_access_token()
        return {"success": True, "message": "lark-cli 已就绪，凭证有效"}

    def push_markdown(
        self,
        title: str,
        markdown: str,
        image_base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not (markdown or "").strip():
            raise FeishuError("笔记内容为空，无法推送")

        safe_title = FeishuService._safe_title(title)
        prepared = FeishuService._prepare_markdown(markdown, image_base_url)

        args = [
            "docs", "+create",
            "--title", safe_title,
            "--markdown", prepared,
            "--format", "json",
        ]
        # 指定目标文件夹（CLI 不同版本 flag 名可能不同，带上 folder token 尽量挂到指定目录）
        if self.folder_token:
            args += ["--folder-token", self.folder_token]

        proc = self._run(args)
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise FeishuError(f"lark-cli 推送失败：{err[:400] or '未知错误'}")

        result = self._parse_output(proc.stdout, safe_title)
        logger.info(f"lark-cli 推送成功：{safe_title} -> {result.get('url')}")
        return result

    # ─── 输出解析 ────────────────────────────────────────────────────────────
    def _parse_output(self, stdout: str, title: str) -> Dict[str, Any]:
        """从 lark-cli 的 JSON 输出里抽取文档 url / token，尽量兼容不同版本的字段结构。"""
        url, token = "", ""
        data: Any = None
        text = (stdout or "").strip()
        if text:
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                # 退而求其次：从纯文本里正则抓飞书文档链接
                m = re.search(r"https?://[^\s\"']*/(?:docx|docs|wiki)/[A-Za-z0-9]+", text)
                if m:
                    url = m.group(0)

        if data is not None:
            url = url or self._deep_find(data, _URL_KEYS, _looks_like_doc_url) or ""
            token = self._deep_find(data, _TOKEN_KEYS) or ""
            if not url:
                # 没有现成 url 字段时，再从整段 JSON 文本兜底找一个文档链接
                m = re.search(r"https?://[^\s\"']*/(?:docx|docs|wiki)/[A-Za-z0-9]+", text)
                if m:
                    url = m.group(0)

        if not url and not token:
            raise FeishuError(
                "lark-cli 已执行但未能解析出文档链接。"
                f"请确认 lark-cli 版本与输出格式（原始输出：{text[:200]}）"
            )
        return {"url": url, "token": token, "type": "docx", "title": title}

    @staticmethod
    def _deep_find(obj: Any, keys: tuple, predicate=None) -> Optional[str]:
        """在嵌套 dict/list 里按候选 key 找第一个匹配（可选 predicate 进一步校验）的字符串值。"""
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str) and k.lower() in keys and (predicate is None or predicate(v)):
                    return v
            for v in obj.values():
                found = FeishuCliService._deep_find(v, keys, predicate)
                if found:
                    return found
        elif isinstance(obj, list):
            for item in obj:
                found = FeishuCliService._deep_find(item, keys, predicate)
                if found:
                    return found
        return None


_URL_KEYS = ("url", "doc_url", "document_url", "link", "share_url")
_TOKEN_KEYS = ("token", "doc_token", "document_id", "obj_token", "document_token")


def _looks_like_doc_url(value: str) -> bool:
    return value.startswith("http") and ("feishu" in value or "larksuite" in value or "lark" in value)

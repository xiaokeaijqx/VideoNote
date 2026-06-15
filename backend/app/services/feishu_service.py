from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, Optional, Tuple

import requests

from app.services.feishu_config_manager import FeishuConfigManager

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30  # seconds
_POLL_INTERVAL = 1.5  # seconds between import-task polls
_POLL_MAX_ATTEMPTS = 40  # ~60s 上限，导入大文档也够用

# import_tasks 的 job_status：0=成功，1=初始化中，2=处理中，其余为错误码。
_JOB_STATUS_SUCCESS = 0
_JOB_STATUS_IN_PROGRESS = {1, 2}


class FeishuError(Exception):
    """飞书推送相关错误，message 直接面向用户（前端会原样展示）。"""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class FeishuService:
    """飞书（Lark）开放平台客户端：把 Markdown 笔记导入为飞书云文档（docx）。

    走「导入任务」接口（drive/v1/import_tasks），由飞书原生把 Markdown 转成 docx，
    标题 / 列表 / 代码块 / 表格等格式保真度最好，比手动拼 block 更可靠。

    流程（官方 import-user-guide）：
      1. medias/upload_all 上传 .md 源文件 → file_token
      2. import_tasks 创建导入任务（type=docx, file_extension=md）→ ticket
      3. 轮询 import_tasks/{ticket} 直到 job_status=0 → 拿到新文档 url / token

    鉴权用自建应用的 tenant_access_token（应用身份）。注意：以应用身份创建的文档
    归应用所有，普通用户要能看到，需要把目标文件夹的协作者加上该应用——这点在前端
    配置页有说明。
    """

    # tenant_access_token 进程内缓存：key=(base_url, app_id) -> (token, expire_ts)
    _token_cache: Dict[Tuple[str, str], Tuple[str, float]] = {}
    # 应用根目录 token 缓存：key=(base_url, app_id) -> folder_token
    _root_folder_cache: Dict[Tuple[str, str], str] = {}

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.cfg = config or FeishuConfigManager().get_config()
        self.base_url = (self.cfg.get("base_url") or "https://open.feishu.cn").rstrip("/")
        self.app_id = (self.cfg.get("app_id") or "").strip()
        self.app_secret = (self.cfg.get("app_secret") or "").strip()
        self.folder_token = (self.cfg.get("folder_token") or "").strip()

    @property
    def _cache_key(self) -> Tuple[str, str]:
        return (self.base_url, self.app_id)

    # ─── 鉴权 ────────────────────────────────────────────────────────────────
    def _get_tenant_access_token(self) -> str:
        if not self.app_id or not self.app_secret:
            raise FeishuError(
                "飞书未配置：请到「设置 → 飞书推送」填写 App ID 与 App Secret"
            )

        cached = FeishuService._token_cache.get(self._cache_key)
        if cached and cached[1] > time.time():
            return cached[0]

        url = f"{self.base_url}/open-apis/auth/v3/tenant_access_token/internal"
        try:
            resp = requests.post(
                url,
                json={"app_id": self.app_id, "app_secret": self.app_secret},
                timeout=DEFAULT_TIMEOUT,
            )
            data = resp.json()
        except Exception as exc:
            raise FeishuError(f"连接飞书失败：{exc}") from exc

        if data.get("code") != 0:
            raise FeishuError(
                f"飞书鉴权失败（code={data.get('code')}）：{data.get('msg')}。"
                "请检查 App ID / App Secret 是否正确、应用是否启用"
            )

        # tenant_access_token / expire 在响应顶层（这个老接口不包在 data 里）
        token = data.get("tenant_access_token")
        if not token:
            raise FeishuError(f"飞书鉴权异常：响应缺少 tenant_access_token（{data}）")
        expire_in = int(data.get("expire", 7200))
        # 提前 5 分钟过期，避开临界点
        FeishuService._token_cache[self._cache_key] = (token, time.time() + expire_in - 300)
        return token

    def _auth_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self._get_tenant_access_token()}"}

    @staticmethod
    def _fmt_api_error(prefix: str, payload: Dict[str, Any]) -> str:
        """统一格式化飞书业务错误，带上 code/msg 方便用户/开发定位。"""
        return f"{prefix}（code={payload.get('code')}）：{payload.get('msg')}"

    def _root_folder_token(self) -> str:
        """未配置目标文件夹时，取应用云空间根目录 token 兜底。"""
        cached = FeishuService._root_folder_cache.get(self._cache_key)
        if cached:
            return cached
        url = f"{self.base_url}/open-apis/drive/explorer/v2/root_folder/meta"
        try:
            resp = requests.get(url, headers=self._auth_headers(), timeout=DEFAULT_TIMEOUT)
            payload = resp.json()
        except Exception as exc:
            raise FeishuError(f"获取飞书根目录失败：{exc}") from exc
        if payload.get("code") != 0:
            raise FeishuError(
                self._fmt_api_error("获取飞书根目录失败", payload)
                + "。建议在「设置 → 飞书推送」直接填写目标文件夹 token"
            )
        token = (payload.get("data") or {}).get("token", "")
        if not token:
            raise FeishuError("飞书根目录 token 为空，请在配置里指定目标文件夹 token")
        FeishuService._root_folder_cache[self._cache_key] = token
        return token

    # ─── 公有方法 ────────────────────────────────────────────────────────────
    def test_connection(self) -> Dict[str, Any]:
        """验证凭证：能成功换取 tenant_access_token 即视为连接成功。"""
        self._get_tenant_access_token()
        return {"success": True, "message": "飞书连接成功，凭证有效"}

    def push_markdown(
        self,
        title: str,
        markdown: str,
        image_base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """把 Markdown 导入为飞书云文档。返回 {url, token, type, title}。

        :param title: 文档标题（取视频标题）
        :param markdown: 笔记 Markdown 正文
        :param image_base_url: 把正文里 /static、/uploads 等相对图片链接补成绝对地址的前缀，
                               飞书服务端导入时会按 http(s) 抓图（本机/内网地址抓不到则跳过）
        """
        if not (markdown or "").strip():
            raise FeishuError("笔记内容为空，无法推送")

        safe_title = self._safe_title(title)
        prepared = self._prepare_markdown(markdown, image_base_url)
        content = prepared.encode("utf-8")

        folder_token = self.folder_token or self._root_folder_token()
        file_token = self._upload_media(safe_title, content, folder_token)
        ticket = self._create_import_task(safe_title, file_token, folder_token)
        result = self._poll_import_task(ticket)

        token = result.get("token") or ""
        doc_type = result.get("type") or "docx"
        url = result.get("url") or self._fallback_doc_url(doc_type, token)
        logger.info(f"飞书导入成功：{safe_title} -> {url}")
        return {"url": url, "token": token, "type": doc_type, "title": safe_title}

    # ─── 导入流程内部步骤 ─────────────────────────────────────────────────────
    def _upload_media(self, title: str, content: bytes, folder_token: str) -> str:
        """步骤 1：上传 .md 源文件，拿 file_token。"""
        url = f"{self.base_url}/open-apis/drive/v1/medias/upload_all"
        file_name = f"{title}.md"
        data = {
            "file_name": file_name,
            "parent_type": "ccm_import_open",  # 导入专用素材类型
            "parent_node": folder_token,
            "size": str(len(content)),
            "extra": json.dumps({"obj_type": "docx", "file_extension": "md"}),
        }
        files = {"file": (file_name, content, "text/markdown")}
        try:
            resp = requests.post(
                url,
                headers=self._auth_headers(),
                data=data,
                files=files,
                timeout=DEFAULT_TIMEOUT,
            )
            payload = resp.json()
        except Exception as exc:
            raise FeishuError(f"上传 Markdown 到飞书失败：{exc}") from exc
        if payload.get("code") != 0:
            raise FeishuError(self._fmt_api_error("上传 Markdown 到飞书失败", payload))
        file_token = (payload.get("data") or {}).get("file_token")
        if not file_token:
            raise FeishuError(f"飞书上传异常：响应缺少 file_token（{payload}）")
        return file_token

    def _create_import_task(self, title: str, file_token: str, folder_token: str) -> str:
        """步骤 2：创建导入任务（md → docx），拿 ticket。"""
        url = f"{self.base_url}/open-apis/drive/v1/import_tasks"
        body = {
            "file_extension": "md",
            "file_token": file_token,
            "type": "docx",
            "file_name": title,
            "point": {
                "mount_type": 1,  # 1 = 挂载到云空间文件夹
                "mount_key": folder_token,
            },
        }
        try:
            resp = requests.post(
                url,
                headers={**self._auth_headers(), "Content-Type": "application/json"},
                json=body,
                timeout=DEFAULT_TIMEOUT,
            )
            payload = resp.json()
        except Exception as exc:
            raise FeishuError(f"创建飞书导入任务失败：{exc}") from exc
        if payload.get("code") != 0:
            raise FeishuError(self._fmt_api_error("创建飞书导入任务失败", payload))
        ticket = (payload.get("data") or {}).get("ticket")
        if not ticket:
            raise FeishuError(f"飞书导入异常：响应缺少 ticket（{payload}）")
        return ticket

    def _poll_import_task(self, ticket: str) -> Dict[str, Any]:
        """步骤 3：轮询导入结果，成功返回 result 字典（含 url/token）。"""
        url = f"{self.base_url}/open-apis/drive/v1/import_tasks/{ticket}"
        last_result: Dict[str, Any] = {}
        for _ in range(_POLL_MAX_ATTEMPTS):
            try:
                resp = requests.get(url, headers=self._auth_headers(), timeout=DEFAULT_TIMEOUT)
                payload = resp.json()
            except Exception as exc:
                raise FeishuError(f"查询飞书导入结果失败：{exc}") from exc
            if payload.get("code") != 0:
                raise FeishuError(self._fmt_api_error("查询飞书导入结果失败", payload))

            last_result = (payload.get("data") or {}).get("result") or {}
            job_status = last_result.get("job_status")

            if job_status == _JOB_STATUS_SUCCESS and last_result.get("token"):
                return last_result
            if job_status in _JOB_STATUS_IN_PROGRESS or job_status is None:
                time.sleep(_POLL_INTERVAL)
                continue
            # 其余 job_status 视为失败
            err = last_result.get("job_error_msg") or "未知错误"
            raise FeishuError(f"飞书导入失败（job_status={job_status}）：{err}")

        # 轮询超时：可能仍在处理，给出可理解的提示
        raise FeishuError(
            "飞书导入超时（文档可能仍在生成中）。请稍后到飞书云空间查看，"
            f"或重试推送（job_status={last_result.get('job_status')}）"
        )

    def _fallback_doc_url(self, doc_type: str, token: str) -> str:
        """飞书偶尔不回 url，按文档类型 + token 拼一个可访问地址。"""
        if not token:
            return ""
        # open.feishu.cn → 主站 feishu.cn；open.larksuite.com → larksuite.com
        host = self.base_url.replace("https://open.", "https://").replace("http://open.", "http://")
        return f"{host}/{doc_type}/{token}"

    # ─── Markdown 预处理 ──────────────────────────────────────────────────────
    @staticmethod
    def _safe_title(title: str, fallback: str = "VideoMemo 笔记") -> str:
        """清掉标题里的换行/控制字符，截到 120 字（飞书文档标题有长度限制）。"""
        cleaned = re.sub(r"[\r\n\t]", " ", (title or "").strip())
        cleaned = cleaned.strip()
        return (cleaned[:120] or fallback)

    @staticmethod
    def _prepare_markdown(markdown: str, image_base_url: Optional[str]) -> str:
        """把 /static、/uploads 开头的相对图片链接补成绝对地址，便于飞书抓图。

        飞书导入时按 http(s) 抓取图片，相对路径它无法解析；补成后端绝对地址后，
        仅当后端对飞书服务端可达（公网部署）时图片才会真正落进文档，本机/内网下
        飞书抓不到会自动跳过该图，不影响正文导入。
        """
        if not image_base_url:
            return markdown
        base = image_base_url.rstrip("/")

        def _repl(m: "re.Match[str]") -> str:
            alt, path = m.group(1), m.group(2)
            return f"![{alt}]({base}{path})"

        # 仅替换 ](/static...) 与 ](/uploads...) 这类站内相对图片
        return re.sub(r"!\[([^\]]*)\]\((/(?:static|uploads)/[^)]+)\)", _repl, markdown)

from __future__ import annotations

import json
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Any

import requests

from app.db.trend_subscription_dao import get_channel

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10  # seconds


class NotificationService:
    """Dispatches push notifications through configured channels."""

    def send(
        self,
        channel_id: int,
        title: str,
        body: str,
        url: str = "",
    ) -> dict:
        """Send a notification through a specific channel. Returns result dict."""
        channel = get_channel(channel_id)
        if channel is None:
            return {"success": False, "error": f"Channel {channel_id} not found"}
        if not channel.enabled:
            return {"success": False, "error": "Channel is disabled"}

        config = json.loads(channel.config or "{}")

        try:
            if channel.type == "webhook":
                return self._send_webhook(config, title, body, url)
            elif channel.type == "bark":
                return self._send_bark(config, title, body, url)
            elif channel.type == "email":
                return self._send_email(config, title, body)
            else:
                return {"success": False, "error": f"Unknown channel type: {channel.type}"}
        except Exception as exc:
            logger.exception(f"Notification failed for channel {channel_id}")
            return {"success": False, "error": str(exc)}

    def send_batch(
        self,
        channel_ids: list[int],
        title: str,
        body: str,
        url: str = "",
    ) -> list[dict]:
        """Send to multiple channels. Returns list of per-channel results."""
        results: list[dict] = []
        for cid in channel_ids:
            results.append(self.send(cid, title, body, url))
        return results

    def send_test(self, channel_id: int) -> dict:
        """Send a test notification to verify channel config."""
        return self.send(
            channel_id=channel_id,
            title="🎯 VideoMemo 测试通知",
            body="如果你收到这条消息，说明通知通道配置成功！\n\nIf you see this, the notification channel is working!",
            url="",
        )

    # ─── Channel implementations ─────────────────────────────────────────────────

    def _send_webhook(self, config: dict, title: str, body: str, url: str) -> dict:
        webhook_url = str(config.get("url") or "").strip()
        if not webhook_url:
            return {"success": False, "error": "Webhook URL is empty"}

        payload: dict[str, Any] = {
            "title": title,
            "body": body,
        }
        if url:
            payload["url"] = url

        # Support custom payload template
        template = config.get("template", "")
        if template:
            try:
                payload = json.loads(
                    template.replace("{{title}}", json.dumps(title))
                    .replace("{{body}}", json.dumps(body))
                    .replace("{{url}}", json.dumps(url))
                )
            except json.JSONDecodeError:
                pass

        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=DEFAULT_TIMEOUT,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return {"success": True, "status_code": resp.status_code}

    def _send_bark(self, config: dict, title: str, body: str, url: str) -> dict:
        bark_url = str(config.get("url") or "https://api.day.app/push").strip()
        device_key = str(config.get("device_key") or "").strip()
        if not device_key:
            return {"success": False, "error": "Bark device key is empty"}

        full_url = f"{bark_url.rstrip('/')}/{device_key}"
        params: dict[str, str] = {
            "title": title,
            "body": body,
        }
        if url:
            params["url"] = url
        if config.get("sound"):
            params["sound"] = config["sound"]
        if config.get("group"):
            params["group"] = config["group"]

        resp = requests.post(full_url, json=params, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return {"success": True, "status_code": resp.status_code}

    def _send_email(self, config: dict, title: str, body: str) -> dict:
        smtp_host = str(config.get("smtp_host") or "").strip()
        smtp_port = int(config.get("smtp_port") or 587)
        smtp_user = str(config.get("smtp_user") or "").strip()
        smtp_password = str(config.get("smtp_password") or "").strip()
        to_addr = str(config.get("to") or "").strip()

        if not all([smtp_host, smtp_user, smtp_password, to_addr]):
            return {"success": False, "error": "Email config incomplete"}

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = title
        msg["From"] = smtp_user
        msg["To"] = to_addr

        with smtplib.SMTP(smtp_host, smtp_port, timeout=DEFAULT_TIMEOUT) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)

        return {"success": True}

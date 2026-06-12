from __future__ import annotations

import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)


class TrendScheduler:
    """Simple background scheduler for periodic trend matching and notification.

    Uses threading.Timer for simplicity. Configured via environment variables:
    - TREND_CHECK_INTERVAL_MINUTES: how often to run (default 30)
    - TREND_SCHEDULER_ENABLED: set to "false" to disable (default true)
    """

    def __init__(self):
        self._timer: threading.Timer | None = None
        self._running = False
        self._interval_minutes = int(os.getenv("TREND_CHECK_INTERVAL_MINUTES", "30"))
        self._enabled = os.getenv("TREND_SCHEDULER_ENABLED", "true").lower() != "false"

    @property
    def interval_seconds(self) -> int:
        return max(60, self._interval_minutes * 60)  # minimum 1 minute

    def start(self) -> None:
        if not self._enabled:
            logger.info("TrendScheduler 已禁用 (TREND_SCHEDULER_ENABLED=false)")
            return
        if self._running:
            return
        self._running = True
        logger.info(f"TrendScheduler 已启动，间隔 {self._interval_minutes} 分钟")
        self._schedule_next()

    def stop(self) -> None:
        self._running = False
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        logger.info("TrendScheduler 已停止")

    def run_now(self) -> dict[str, Any]:
        """Manually trigger a full matching cycle. Returns summary."""
        logger.info("TrendScheduler 手动触发匹配…")
        try:
            from app.services.trend_subscription import TrendSubscriptionService
            from app.services.notification import NotificationService

            svc = TrendSubscriptionService()
            summary = svc.match_all_subscriptions()

            # Send notifications for subscriptions with new matches
            if summary["total_new_matches"] > 0:
                notifier = NotificationService()
                for sub_result in summary["by_subscription"]:
                    sub = svc.get_subscription(sub_result["subscription_id"])
                    if not sub or not sub.get("push_enabled"):
                        continue
                    channel_ids = sub.get("push_channel_ids", [])
                    if not channel_ids:
                        continue

                    match_titles = [m["title"] for m in sub_result["matches"]]
                    title = f"🔥 VideoMemo: {sub['name']} — {len(match_titles)} 条新热点"
                    body = "\n\n".join(f"• {t}" for t in match_titles[:10])
                    if len(match_titles) > 10:
                        body += f"\n\n…共 {len(match_titles)} 条"

                    notifier.send_batch(channel_ids, title, body)

            logger.info(
                f"TrendScheduler 匹配完成: "
                f"{summary['total_subscriptions']} 订阅, "
                f"{summary['total_new_matches']} 新匹配"
            )
            return summary
        except Exception:
            logger.exception("TrendScheduler 匹配出错")
            return {"error": "匹配过程出错，详见日志"}

    def _schedule_next(self) -> None:
        if not self._running:
            return

        def _tick():
            self.run_now()
            self._schedule_next()

        self._timer = threading.Timer(self.interval_seconds, _tick)
        self._timer.daemon = True
        self._timer.start()


# Module-level singleton
_scheduler: TrendScheduler | None = None


def get_scheduler() -> TrendScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = TrendScheduler()
    return _scheduler

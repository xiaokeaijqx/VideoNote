"""任务暂停控制：进程内共享的暂停标记。

NoteGenerator 在步骤之间检查这里的标记；前端通过 /task_control 接口设置。
仅进程内有效（与现有 ThreadPoolExecutor 执行模型一致）。
"""
import threading

_lock = threading.Lock()
_paused: set[str] = set()


def pause(task_id: str) -> None:
    if not task_id:
        return
    with _lock:
        _paused.add(task_id)


def resume(task_id: str) -> None:
    with _lock:
        _paused.discard(task_id)


def is_paused(task_id: str) -> bool:
    with _lock:
        return task_id in _paused


def clear(task_id: str) -> None:
    """任务结束（成功/失败）时清理标记。"""
    with _lock:
        _paused.discard(task_id)

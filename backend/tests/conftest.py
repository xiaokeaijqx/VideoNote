import os
import tempfile

# 把数据库与笔记输出目录强制指向临时位置：
#  - 避免测试污染真实的 video_memo.db / note_results（配置/笔记已迁入数据库后，
#    管理器与 note_dao 的读写都走全局 engine，不隔离会写进开发库）。
#  - 顺带建好 app_config / notes 等新表，供依赖数据库的单测使用。
# 必须在任何 app 模块导入前设置：pytest 最先加载 conftest，此处 import app.db.* 时
# engine 才会按这里的 DATABASE_URL 初始化。load_dotenv(override=False) 不会覆盖已设的值。
_TEST_DIR = tempfile.mkdtemp(prefix="videomemo-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TEST_DIR, "test.db")
os.environ.setdefault("NOTE_OUTPUT_DIR", os.path.join(_TEST_DIR, "note_results"))

from app.db.init_db import init_db  # noqa: E402

init_db()

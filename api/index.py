from __future__ import annotations

import sys
from pathlib import Path

BACKEND_SRC = Path(__file__).resolve().parents[1] / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from delivery_system.database import init_db  # noqa: E402
from delivery_system.main import app  # noqa: E402

init_db()

__all__ = ["app"]

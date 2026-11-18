from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from delivery_system.config import Settings, get_settings, is_vercel_runtime


class Base(DeclarativeBase):
    """Base declarativa compartilhada entre SQLite e PostgreSQL (Supabase)."""


def _ensure_sqlite_directory(database_url: str) -> None:
    parsed = make_url(database_url)
    if parsed.drivername.startswith("sqlite") and parsed.database and parsed.database != ":memory:":
        db_path = Path(parsed.database)
        db_path.parent.mkdir(parents=True, exist_ok=True)


def create_app_engine(settings: Settings | None = None) -> Engine:
    active_settings = settings or get_settings()
    database_url = active_settings.resolved_database_url()
    is_sqlite = database_url.startswith("sqlite")

    if is_sqlite:
        _ensure_sqlite_directory(database_url)

    connect_args: dict[str, Any] = {"check_same_thread": False} if is_sqlite else {}
    engine_kwargs: dict[str, Any] = {
        "echo": False,
        "connect_args": connect_args,
    }
    if not is_sqlite:
        engine_kwargs["pool_pre_ping"] = True
        if is_vercel_runtime():
            engine_kwargs["poolclass"] = NullPool

    engine = create_engine(database_url, **engine_kwargs)

    if is_sqlite:
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = create_app_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so Base.metadata knows every table before create_all
    from delivery_system import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

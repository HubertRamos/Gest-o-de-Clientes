from __future__ import annotations

import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_vercel_local_mode_uses_tmp_sqlite(monkeypatch, settings_factory) -> None:
    monkeypatch.setenv("VERCEL", "1")
    settings = settings_factory(database_mode="local", database_url="sqlite:///./data/delivery_system.db")
    assert settings.resolved_database_url() == "sqlite:////tmp/delivery_system.db"


def test_supabase_postgres_url_normalization(settings_factory) -> None:
    s1 = settings_factory(
        database_mode="supabase",
        database_url="postgres://user:pass@db.example.com:6543/postgres",
    )
    assert s1.resolved_database_url() == "postgresql+psycopg://user:pass@db.example.com:6543/postgres"

    s2 = settings_factory(
        database_mode="supabase",
        database_url="postgresql://user:pass@db.example.com:6543/postgres?sslmode=require",
    )
    assert (
        s2.resolved_database_url()
        == "postgresql+psycopg://user:pass@db.example.com:6543/postgres?sslmode=require"
    )


def test_cors_origins_include_vercel_hosts(monkeypatch, settings_factory) -> None:
    monkeypatch.setenv("VERCEL_URL", "delivery-preview.vercel.app")
    monkeypatch.setenv("VERCEL_PROJECT_PRODUCTION_URL", "delivery.vercel.app")
    monkeypatch.setenv("VERCEL_BRANCH_URL", "https://delivery-git-main.vercel.app")

    settings = settings_factory()
    origins = settings.cors_origin_list()
    assert "https://delivery-preview.vercel.app" in origins
    assert "https://delivery.vercel.app" in origins
    assert "https://delivery-git-main.vercel.app" in origins


def test_api_index_entrypoint_serves_health_and_dashboard(monkeypatch, tmp_path: Path) -> None:
    tmp_db = tmp_path / "vercel_ephemeral.db"
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATABASE_MODE", "local")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:////tmp/{tmp_db.name}")

    from delivery_system.config import get_settings

    get_settings.cache_clear()
    try:
        spec = importlib.util.spec_from_file_location(
            "vercel_api_index_test", REPO_ROOT / "api" / "index.py"
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with TestClient(module.app) as client:
            health = client.get("/api/health")
            assert health.status_code == 200
            assert health.json()["status"] == "ok"

            dashboard = client.get("/api/dashboard")
            assert dashboard.status_code == 200
            body = dashboard.json()
            assert "delivery_summary" in body
            assert "inactive_contact_reminders" in body
    finally:
        get_settings.cache_clear()
        ephemeral = Path(f"/tmp/{tmp_db.name}")
        if ephemeral.exists():
            ephemeral.unlink()

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCAL_SQLITE_PATH = BACKEND_ROOT / "data" / "delivery_system.db"
VERCEL_SQLITE_PATH = Path("/tmp/delivery_system.db")


def is_vercel_runtime() -> bool:
    return os.environ.get("VERCEL") == "1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_mode: Literal["local", "supabase"] = "local"
    database_url: str = f"sqlite:///{DEFAULT_LOCAL_SQLITE_PATH}"

    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    whatsapp_provider_mode: Literal["simulation", "meta_cloud"] = "simulation"
    meta_whatsapp_access_token: str = ""
    meta_whatsapp_phone_number_id: str = ""
    meta_whatsapp_business_account_id: str = ""
    meta_whatsapp_webhook_verify_token: str = ""
    meta_whatsapp_api_version: str = "v21.0"

    @field_validator("database_mode", mode="before")
    @classmethod
    def normalize_database_mode(cls, value: str) -> str:
        return str(value).strip().lower()

    @field_validator("whatsapp_provider_mode", mode="before")
    @classmethod
    def normalize_provider_mode(cls, value: str) -> str:
        return str(value).strip().lower()

    def resolved_database_url(self) -> str:
        if self.database_mode == "local":
            if is_vercel_runtime():
                url = (self.database_url or "").strip()
                if url.startswith("sqlite:////tmp/"):
                    return url
                return f"sqlite:///{VERCEL_SQLITE_PATH}"

            url = (self.database_url or "").strip()
            if not url or not url.startswith("sqlite"):
                url = f"sqlite:///{DEFAULT_LOCAL_SQLITE_PATH}"
            # Convert relative sqlite:///./data/... paths relative to backend root
            if url.startswith("sqlite:///./"):
                rel = url.removeprefix("sqlite:///./")
                return f"sqlite:///{(BACKEND_ROOT / rel).resolve()}"
            return url

        # supabase mode
        url = (self.database_url or "").strip()
        if not url or url.startswith("sqlite"):
            raise ValueError(
                "DATABASE_MODE está definido como 'supabase', mas DATABASE_URL "
                "não aponta para um banco PostgreSQL válido."
            )
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and "+psycopg" not in url:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    def cors_origin_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        for env_key in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL"):
            host = os.environ.get(env_key, "").strip()
            if host:
                origin = host if host.startswith("http") else f"https://{host}"
                if origin not in origins:
                    origins.append(origin)
        return origins

    def has_meta_credentials(self) -> bool:
        return bool(
            self.meta_whatsapp_access_token.strip()
            and self.meta_whatsapp_phone_number_id.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

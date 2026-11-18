from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from delivery_system.api import api_router
from delivery_system.config import get_settings
from delivery_system.database import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Sistema de Gestão de Clientes e Campanhas WhatsApp",
        description=(
            "API REST para cadastro de clientes, modelos de mensagens, "
            "campanhas gerais/segmentadas e envio manual ou simulado pelo WhatsApp."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", tags=["Sistema"])
    def health_check() -> dict[str, str]:
        return {
            "status": "ok",
            "database_mode": settings.database_mode,
            "whatsapp_provider_mode": settings.whatsapp_provider_mode,
        }

    app.include_router(api_router)
    return app


app = create_app()

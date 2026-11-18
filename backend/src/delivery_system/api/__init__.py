from fastapi import APIRouter

from delivery_system.api import campaigns, clients, dashboard, demo, templates, webhooks

api_router = APIRouter(prefix="/api")
api_router.include_router(dashboard.router)
api_router.include_router(clients.router)
api_router.include_router(templates.router)
api_router.include_router(campaigns.router)
api_router.include_router(demo.router)
api_router.include_router(webhooks.router)

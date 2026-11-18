from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from delivery_system.config import Settings, get_settings
from delivery_system.database import get_db
from delivery_system.schemas.dashboard import DashboardResponse
from delivery_system.services import campaign_service

router = APIRouter(prefix="/dashboard", tags=["Painel Inicial"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DashboardResponse:
    return campaign_service.get_dashboard_summary(db, settings)

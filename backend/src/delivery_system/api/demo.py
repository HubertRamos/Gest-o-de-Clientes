from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from delivery_system.database import get_db
from delivery_system.services import demo_service

router = APIRouter(prefix="/demo", tags=["Dados de Demonstração"])


@router.post("/seed")
def seed_demo(db: Session = Depends(get_db)) -> dict[str, int | str]:
    return demo_service.seed_demo_data(db)


@router.delete("/clear")
def clear_demo(db: Session = Depends(get_db)) -> dict[str, str]:
    return demo_service.clear_demo_data(db)

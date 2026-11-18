from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from delivery_system.config import Settings, get_settings
from delivery_system.database import get_db
from delivery_system.schemas.campaign import (
    AutomaticDispatchResponse,
    CampaignCreate,
    CampaignDetailResponse,
    CampaignSummaryResponse,
    RecipientMarkFailedRequest,
)
from delivery_system.services import campaign_service

router = APIRouter(prefix="/campaigns", tags=["Campanhas"])


@router.get("", response_model=list[CampaignSummaryResponse])
def list_campaigns(db: Session = Depends(get_db)) -> list[CampaignSummaryResponse]:
    campaigns = campaign_service.list_campaigns(db)
    return [campaign_service.to_campaign_summary(c) for c in campaigns]


@router.post("", response_model=CampaignDetailResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CampaignDetailResponse:
    campaign = campaign_service.create_campaign(db, payload, settings)
    return campaign_service.to_campaign_detail(campaign)


@router.get("/{campaign_id}", response_model=CampaignDetailResponse)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)) -> CampaignDetailResponse:
    return campaign_service.get_campaign_detail(db, campaign_id)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)) -> Response:
    campaign_service.delete_campaign(db, campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{campaign_id}/recipients/{recipient_id}/open-whatsapp",
    response_model=CampaignDetailResponse,
)
def open_recipient_whatsapp(
    campaign_id: int, recipient_id: int, db: Session = Depends(get_db)
) -> CampaignDetailResponse:
    return campaign_service.mark_recipient_whatsapp_opened(db, campaign_id, recipient_id)


@router.post(
    "/{campaign_id}/recipients/{recipient_id}/confirm-manual",
    response_model=CampaignDetailResponse,
)
def confirm_recipient_manual(
    campaign_id: int, recipient_id: int, db: Session = Depends(get_db)
) -> CampaignDetailResponse:
    return campaign_service.confirm_recipient_manual_send(db, campaign_id, recipient_id)


@router.post(
    "/{campaign_id}/recipients/{recipient_id}/mark-failed",
    response_model=CampaignDetailResponse,
)
def mark_recipient_failed(
    campaign_id: int,
    recipient_id: int,
    payload: RecipientMarkFailedRequest,
    db: Session = Depends(get_db),
) -> CampaignDetailResponse:
    return campaign_service.mark_recipient_failed(
        db, campaign_id, recipient_id, payload.error_message
    )


@router.post(
    "/{campaign_id}/dispatch-automatic",
    response_model=AutomaticDispatchResponse,
)
def dispatch_automatic(
    campaign_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AutomaticDispatchResponse:
    return campaign_service.dispatch_automatic_campaign(db, campaign_id, settings)

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from delivery_system.config import Settings, get_settings
from delivery_system.database import get_db
from delivery_system.models.campaign import CampaignRecipient

router = APIRouter(prefix="/webhooks", tags=["Webhooks WhatsApp"])


@router.get("/whatsapp")
def verify_meta_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    settings: Settings = Depends(get_settings),
) -> Response:
    expected_token = settings.meta_whatsapp_webhook_verify_token.strip()
    if (
        hub_mode == "subscribe"
        and expected_token
        and hub_verify_token == expected_token
        and hub_challenge is not None
    ):
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Token de verificação do webhook inválido ou não configurado.",
    )


@router.post("/whatsapp")
async def receive_meta_webhook(
    request: Request, db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """
    Endpoint preparado para receber atualizações de status da WhatsApp Business Cloud API.
    Atualiza apenas registros que possuam external_message_id correspondente.
    """
    payload: dict[str, Any] = await request.json()
    updated = 0

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for status_item in value.get("statuses", []):
                msg_id = status_item.get("id")
                wa_status = status_item.get("status")
                if not msg_id:
                    continue
                recipient = db.scalar(
                    select(CampaignRecipient).where(
                        CampaignRecipient.external_message_id == msg_id
                    )
                )
                if not recipient:
                    continue
                if wa_status in ("sent", "delivered", "read"):
                    recipient.status = "sent_api"
                    if recipient.sent_at is None:
                        recipient.sent_at = datetime.now(timezone.utc)
                    updated += 1
                elif wa_status == "failed":
                    errors = status_item.get("errors") or []
                    err_title = errors[0].get("title") if errors else "Falha reportada pela Meta."
                    recipient.status = "failed"
                    recipient.error_message = str(err_title)[:300]
                    updated += 1

    if updated > 0:
        db.commit()

    return {"status": "ok", "updated_recipients": updated}

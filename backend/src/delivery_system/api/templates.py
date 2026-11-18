from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from delivery_system.database import get_db
from delivery_system.schemas.template import (
    MessageTemplateCreate,
    MessageTemplateResponse,
    MessageTemplateUpdate,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
)
from delivery_system.services import template_service

router = APIRouter(prefix="/templates", tags=["Modelos de Mensagens"])


@router.get("", response_model=list[MessageTemplateResponse])
def list_templates(db: Session = Depends(get_db)) -> list[MessageTemplateResponse]:
    templates = template_service.list_templates(db)
    return [MessageTemplateResponse.model_validate(t) for t in templates]


@router.post("", response_model=MessageTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: MessageTemplateCreate, db: Session = Depends(get_db)
) -> MessageTemplateResponse:
    template = template_service.create_template(db, payload)
    return MessageTemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=MessageTemplateResponse)
def update_template(
    template_id: int, payload: MessageTemplateUpdate, db: Session = Depends(get_db)
) -> MessageTemplateResponse:
    template = template_service.update_template(db, template_id, payload)
    return MessageTemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: Session = Depends(get_db)) -> Response:
    template_service.delete_template(db, template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/preview", response_model=TemplatePreviewResponse)
def preview_template(payload: TemplatePreviewRequest) -> TemplatePreviewResponse:
    rendered = template_service.render_message_template(payload.content, payload.client_name)
    return TemplatePreviewResponse(rendered_message=rendered)

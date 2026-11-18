from __future__ import annotations

import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from delivery_system.models.template import MessageTemplate
from delivery_system.schemas.template import MessageTemplateCreate, MessageTemplateUpdate

_NAME_VAR_PATTERN = re.compile(r"\{\{\s*nome\s*\}\}", re.IGNORECASE)


def render_message_template(content: str, client_name: str) -> str:
    """Substitui {{nome}} pelo nome do cliente."""
    return _NAME_VAR_PATTERN.sub(client_name.strip(), content)


def list_templates(db: Session) -> list[MessageTemplate]:
    stmt = select(MessageTemplate).order_by(MessageTemplate.updated_at.desc(), MessageTemplate.id.desc())
    return list(db.scalars(stmt).all())


def get_template_or_404(db: Session, template_id: int) -> MessageTemplate:
    template = db.get(MessageTemplate, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modelo de mensagem não encontrado.",
        )
    return template


def create_template(db: Session, payload: MessageTemplateCreate, *, is_demo: bool = False) -> MessageTemplate:
    template = MessageTemplate(
        title=payload.title,
        content=payload.content,
        is_demo=is_demo,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(db: Session, template_id: int, payload: MessageTemplateUpdate) -> MessageTemplate:
    template = get_template_or_404(db, template_id)
    if payload.title is not None:
        template.title = payload.title
    if payload.content is not None:
        template.content = payload.content
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template_id: int) -> None:
    template = get_template_or_404(db, template_id)
    db.delete(template)
    db.commit()

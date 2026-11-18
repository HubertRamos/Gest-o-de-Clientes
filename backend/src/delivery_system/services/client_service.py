from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from delivery_system.models.client import Client
from delivery_system.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from delivery_system.services.phone_service import format_phone, normalize_phone


def to_client_response(client: Client) -> ClientResponse:
    return ClientResponse(
        id=client.id,
        name=client.name,
        phone_normalized=client.phone_normalized,
        phone_formatted=format_phone(client.phone_normalized),
        address=client.address,
        notes=client.notes,
        is_active=client.is_active,
        whatsapp_opt_in=client.whatsapp_opt_in,
        opt_out_at=client.opt_out_at,
        is_demo=client.is_demo,
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


def list_clients(
    db: Session,
    *,
    search: str | None = None,
    status_filter: str = "all",
    opt_in_filter: str = "all",
    eligible_only: bool = False,
) -> list[Client]:
    stmt = select(Client)

    if eligible_only:
        stmt = stmt.where(Client.is_active.is_(True), Client.whatsapp_opt_in.is_(True))
    else:
        if status_filter == "active":
            stmt = stmt.where(Client.is_active.is_(True))
        elif status_filter == "inactive":
            stmt = stmt.where(Client.is_active.is_(False))

        if opt_in_filter == "authorized":
            stmt = stmt.where(Client.whatsapp_opt_in.is_(True))
        elif opt_in_filter == "revoked":
            stmt = stmt.where(Client.whatsapp_opt_in.is_(False))

    if search and search.strip():
        term = search.strip()
        digits = re.sub(r"\D", "", term)
        conditions = [Client.name.ilike(f"%{term}%")]
        if digits:
            conditions.append(Client.phone_normalized.ilike(f"%{digits}%"))
        else:
            conditions.append(Client.phone_normalized.ilike(f"%{term}%"))
        stmt = stmt.where(or_(*conditions))

    stmt = stmt.order_by(Client.name.asc(), Client.id.asc())
    return list(db.scalars(stmt).all())


def get_client_or_404(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado.",
        )
    return client


def _ensure_unique_phone(db: Session, phone_normalized: str, *, exclude_id: int | None = None) -> None:
    stmt = select(Client).where(Client.phone_normalized == phone_normalized)
    if exclude_id is not None:
        stmt = stmt.where(Client.id != exclude_id)
    existing = db.scalar(stmt)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um cliente cadastrado com o telefone {format_phone(phone_normalized)}.",
        )


def create_client(db: Session, payload: ClientCreate, *, is_demo: bool = False) -> Client:
    try:
        phone_normalized = normalize_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _ensure_unique_phone(db, phone_normalized)

    opt_out_at = None if payload.whatsapp_opt_in else datetime.now(timezone.utc)
    client = Client(
        name=payload.name,
        phone_normalized=phone_normalized,
        address=payload.address,
        notes=payload.notes,
        is_active=payload.is_active,
        whatsapp_opt_in=payload.whatsapp_opt_in,
        opt_out_at=opt_out_at,
        is_demo=is_demo,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def update_client(db: Session, client_id: int, payload: ClientUpdate) -> Client:
    client = get_client_or_404(db, client_id)

    if payload.phone is not None:
        try:
            phone_normalized = normalize_phone(payload.phone)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        _ensure_unique_phone(db, phone_normalized, exclude_id=client_id)
        client.phone_normalized = phone_normalized

    if payload.name is not None:
        client.name = payload.name
    if "address" in payload.model_fields_set:
        client.address = payload.address
    if "notes" in payload.model_fields_set:
        client.notes = payload.notes
    if payload.is_active is not None:
        client.is_active = payload.is_active
    if payload.whatsapp_opt_in is not None:
        client.whatsapp_opt_in = payload.whatsapp_opt_in
        client.opt_out_at = None if payload.whatsapp_opt_in else datetime.now(timezone.utc)

    db.commit()
    db.refresh(client)
    return client


def set_client_active(db: Session, client_id: int, is_active: bool) -> Client:
    client = get_client_or_404(db, client_id)
    client.is_active = is_active
    db.commit()
    db.refresh(client)
    return client


def set_client_opt_in(db: Session, client_id: int, whatsapp_opt_in: bool) -> Client:
    client = get_client_or_404(db, client_id)
    client.whatsapp_opt_in = whatsapp_opt_in
    client.opt_out_at = None if whatsapp_opt_in else datetime.now(timezone.utc)
    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, client_id: int) -> None:
    client = get_client_or_404(db, client_id)
    db.delete(client)
    db.commit()

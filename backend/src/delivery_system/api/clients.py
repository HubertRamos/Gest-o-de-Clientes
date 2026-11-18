from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from delivery_system.database import get_db
from delivery_system.schemas.client import (
    ClientCreate,
    ClientOptInUpdate,
    ClientResponse,
    ClientStatusUpdate,
    ClientUpdate,
)
from delivery_system.schemas.client_import import (
    ImportConfirmResponse,
    ImportPreviewResponse,
)
from delivery_system.services import client_import_service, client_service

router = APIRouter(prefix="/clients", tags=["Clientes"])


@router.get("", response_model=list[ClientResponse])
def list_clients(
    search: str | None = Query(default=None, description="Busca por nome ou telefone"),
    status_filter: str = Query(
        default="all",
        alias="status",
        pattern="^(all|active|inactive)$",
    ),
    opt_in_filter: str = Query(
        default="all",
        alias="opt_in",
        pattern="^(all|authorized|revoked)$",
    ),
    eligible_only: bool = Query(
        default=False,
        description="Retorna apenas clientes ativos com autorização para WhatsApp",
    ),
    db: Session = Depends(get_db),
) -> list[ClientResponse]:
    clients = client_service.list_clients(
        db,
        search=search,
        status_filter=status_filter,
        opt_in_filter=opt_in_filter,
        eligible_only=eligible_only,
    )
    return [client_service.to_client_response(c) for c in clients]


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)) -> ClientResponse:
    client = client_service.create_client(db, payload)
    return client_service.to_client_response(client)


@router.get("/import/template")
def download_import_template() -> Response:
    content = client_import_service.generate_import_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="modelo_importacao_clientes.xlsx"'
        },
    )


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_clients_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ImportPreviewResponse:
    content = await file.read(client_import_service.MAX_IMPORT_FILE_SIZE_BYTES + 1)
    return client_import_service.parse_and_validate_excel(db, file.filename, content)


@router.post("/import/confirm", response_model=ImportConfirmResponse)
async def confirm_clients_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ImportConfirmResponse:
    content = await file.read(client_import_service.MAX_IMPORT_FILE_SIZE_BYTES + 1)
    return client_import_service.confirm_client_import(db, file.filename, content)


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db)) -> ClientResponse:
    client = client_service.get_client_or_404(db, client_id)
    return client_service.to_client_response(client)


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)
) -> ClientResponse:
    client = client_service.update_client(db, client_id, payload)
    return client_service.to_client_response(client)


@router.patch("/{client_id}/status", response_model=ClientResponse)
def update_client_status(
    client_id: int, payload: ClientStatusUpdate, db: Session = Depends(get_db)
) -> ClientResponse:
    client = client_service.set_client_active(db, client_id, payload.is_active)
    return client_service.to_client_response(client)


@router.patch("/{client_id}/opt-in", response_model=ClientResponse)
def update_client_opt_in(
    client_id: int, payload: ClientOptInUpdate, db: Session = Depends(get_db)
) -> ClientResponse:
    client = client_service.set_client_opt_in(db, client_id, payload.whatsapp_opt_in)
    return client_service.to_client_response(client)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db)) -> Response:
    client_service.delete_client(db, client_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

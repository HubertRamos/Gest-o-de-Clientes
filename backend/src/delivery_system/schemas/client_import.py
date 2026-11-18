from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from delivery_system.schemas.client import ClientResponse

ImportRowStatus = Literal["valid", "duplicate", "error"]


class ImportRowPreview(BaseModel):
    row_number: int
    name: str
    phone_raw: str
    phone_normalized: str | None
    phone_formatted: str | None
    address: str | None
    notes: str | None
    whatsapp_opt_in: bool
    status: ImportRowStatus
    reason: str | None = None


class ImportPreviewSummary(BaseModel):
    total_rows: int
    valid_count: int
    duplicate_count: int
    error_count: int


class ImportPreviewResponse(BaseModel):
    filename: str
    summary: ImportPreviewSummary
    rows: list[ImportRowPreview]


class ImportConfirmResponse(BaseModel):
    imported_count: int
    duplicate_count: int
    error_count: int
    imported_clients: list[ClientResponse]
    skipped_rows: list[ImportRowPreview]
    message: str

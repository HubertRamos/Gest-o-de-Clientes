from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClientBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=8, max_length=32)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool = True
    whatsapp_opt_in: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = " ".join(v.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return cleaned

    @field_validator("address", "notes")
    @classmethod
    def clean_optional_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned if cleaned else None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, min_length=8, max_length=32)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    whatsapp_opt_in: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = " ".join(v.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return cleaned

    @field_validator("address", "notes")
    @classmethod
    def clean_optional_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned if cleaned else None


class ClientStatusUpdate(BaseModel):
    is_active: bool


class ClientOptInUpdate(BaseModel):
    whatsapp_opt_in: bool


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone_normalized: str
    phone_formatted: str
    address: str | None
    notes: str | None
    is_active: bool
    whatsapp_opt_in: bool
    opt_out_at: datetime | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MessageTemplateBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("title", "content")
    @classmethod
    def strip_required(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Este campo não pode ficar vazio.")
        return cleaned


class MessageTemplateCreate(MessageTemplateBase):
    pass


class MessageTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    content: str | None = Field(default=None, min_length=1, max_length=4000)

    @field_validator("title", "content")
    @classmethod
    def strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Este campo não pode ficar vazio.")
        return cleaned


class MessageTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime


class TemplatePreviewRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    client_name: str = Field(default="Maria Silva", min_length=1, max_length=160)


class TemplatePreviewResponse(BaseModel):
    rendered_message: str

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CampaignFormat = Literal["general", "segmented"]
CampaignSendMode = Literal["manual", "automatic"]
CampaignStatus = Literal["draft", "in_progress", "completed", "completed_with_errors"]
RecipientStatus = Literal[
    "prepared",
    "whatsapp_opened",
    "sent_manual",
    "sent_simulated",
    "sent_api",
    "failed",
]


class CampaignGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    template_id: int | None = None
    message_content: str = Field(..., min_length=1, max_length=4000)
    client_ids: list[int] = Field(..., min_length=1)

    @field_validator("name", "message_content")
    @classmethod
    def strip_text(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Este campo não pode ficar vazio.")
        return cleaned


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    format: CampaignFormat
    send_mode: CampaignSendMode
    template_id: int | None = None
    message_content: str | None = Field(default=None, max_length=4000)
    client_ids: list[int] = Field(default_factory=list)
    groups: list[CampaignGroupCreate] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = " ".join(v.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Informe um nome de campanha com pelo menos 2 caracteres.")
        return cleaned

    @model_validator(mode="after")
    def validate_structure(self) -> CampaignCreate:
        if self.format == "general":
            if not self.message_content or not self.message_content.strip():
                raise ValueError("Informe a mensagem da campanha geral.")
            self.message_content = self.message_content.strip()
            if not self.client_ids:
                raise ValueError("Selecione pelo menos um cliente para a campanha geral.")
        else:
            if not self.groups:
                raise ValueError("Crie pelo menos um grupo na campanha segmentada.")
        return self


class CampaignSummaryCounts(BaseModel):
    total_recipients: int
    prepared: int
    whatsapp_opened: int
    sent_manual: int
    sent_simulated: int
    sent_api: int
    failed: int
    pending: int
    sent_total: int


class CampaignGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    template_id: int | None
    message_content: str
    position: int
    recipient_count: int


class CampaignRecipientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: int
    group_id: int | None
    group_name: str | None
    client_id: int | None
    client_name: str
    client_phone_normalized: str
    client_phone_formatted: str
    rendered_message: str
    status: RecipientStatus
    whatsapp_url: str
    opened_at: datetime | None
    sent_at: datetime | None
    external_message_id: str | None
    error_message: str | None


class CampaignSummaryResponse(BaseModel):
    id: int
    name: str
    format: CampaignFormat
    send_mode: CampaignSendMode
    status: CampaignStatus
    provider_mode: str | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    counts: CampaignSummaryCounts


class CampaignDetailResponse(CampaignSummaryResponse):
    template_id: int | None
    message_content: str | None
    groups: list[CampaignGroupResponse]
    recipients: list[CampaignRecipientResponse]


class RecipientMarkFailedRequest(BaseModel):
    error_message: str | None = Field(default="Falha informada pelo operador.", max_length=300)


class AutomaticDispatchResponse(BaseModel):
    campaign: CampaignDetailResponse
    is_simulation: bool
    notice: str
    processed_count: int
    simulated_count: int
    sent_api_count: int
    failed_count: int

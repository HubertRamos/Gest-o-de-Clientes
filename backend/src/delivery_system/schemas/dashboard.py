from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from delivery_system.schemas.campaign import CampaignSummaryResponse


class DeliverySummary(BaseModel):
    total_recipients: int
    sent_manual: int
    sent_simulated: int
    sent_api: int
    pending: int
    failed: int


class InactiveContactReminder(BaseModel):
    client_id: int
    client_name: str
    phone_formatted: str
    last_sent_at: datetime | None
    days_without_message: int
    never_messaged: bool


class DashboardResponse(BaseModel):
    total_clients: int
    active_clients: int
    opted_in_clients: int
    total_campaigns: int
    total_templates: int
    delivery_summary: DeliverySummary
    recent_campaigns: list[CampaignSummaryResponse]
    inactive_contact_reminders: list[InactiveContactReminder]
    database_mode: str
    whatsapp_provider_mode: str

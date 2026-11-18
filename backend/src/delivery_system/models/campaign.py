from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from delivery_system.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)  # general | segmented
    send_mode: Mapped[str] = mapped_column(String(20), nullable=False)  # manual | automatic
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft"
    )  # draft | in_progress | completed | completed_with_errors
    provider_mode: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )  # manual_wa_link | simulation | meta_cloud
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("message_templates.id", ondelete="SET NULL"), nullable=True
    )
    message_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    groups: Mapped[list[CampaignGroup]] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="CampaignGroup.position, CampaignGroup.id",
    )
    recipients: Mapped[list[CampaignRecipient]] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="CampaignRecipient.id",
    )


class CampaignGroup(Base):
    __tablename__ = "campaign_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("message_templates.id", ondelete="SET NULL"), nullable=True
    )
    message_content: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    campaign: Mapped[Campaign] = relationship(back_populates="groups")
    recipients: Mapped[list[CampaignRecipient]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="CampaignRecipient.id",
    )


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "client_id",
            name="uq_campaign_recipient_campaign_client",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaign_groups.id", ondelete="CASCADE"), nullable=True, index=True
    )
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_name_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    client_phone_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    rendered_message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="prepared", index=True
    )  # prepared | whatsapp_opened | sent_manual | sent_simulated | sent_api | failed
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    campaign: Mapped[Campaign] = relationship(back_populates="recipients")
    group: Mapped[CampaignGroup | None] = relationship(back_populates="recipients")

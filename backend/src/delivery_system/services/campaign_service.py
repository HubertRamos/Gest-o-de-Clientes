from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from delivery_system.config import Settings, get_settings
from delivery_system.models.campaign import Campaign, CampaignGroup, CampaignRecipient
from delivery_system.models.client import Client
from delivery_system.models.template import MessageTemplate
from delivery_system.schemas.campaign import (
    AutomaticDispatchResponse,
    CampaignCreate,
    CampaignDetailResponse,
    CampaignGroupResponse,
    CampaignRecipientResponse,
    CampaignSummaryCounts,
    CampaignSummaryResponse,
)
from delivery_system.schemas.dashboard import (
    DashboardResponse,
    DeliverySummary,
    InactiveContactReminder,
)
from delivery_system.services.phone_service import build_whatsapp_link, format_phone
from delivery_system.services.template_service import render_message_template
from delivery_system.services.whatsapp_provider import get_whatsapp_provider


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _compute_counts(recipients: list[CampaignRecipient]) -> CampaignSummaryCounts:
    prepared = sum(1 for r in recipients if r.status == "prepared")
    whatsapp_opened = sum(1 for r in recipients if r.status == "whatsapp_opened")
    sent_manual = sum(1 for r in recipients if r.status == "sent_manual")
    sent_simulated = sum(1 for r in recipients if r.status == "sent_simulated")
    sent_api = sum(1 for r in recipients if r.status == "sent_api")
    failed = sum(1 for r in recipients if r.status == "failed")
    pending = prepared + whatsapp_opened
    sent_total = sent_manual + sent_simulated + sent_api
    return CampaignSummaryCounts(
        total_recipients=len(recipients),
        prepared=prepared,
        whatsapp_opened=whatsapp_opened,
        sent_manual=sent_manual,
        sent_simulated=sent_simulated,
        sent_api=sent_api,
        failed=failed,
        pending=pending,
        sent_total=sent_total,
    )


def _recalculate_campaign_status(campaign: Campaign) -> str:
    counts = _compute_counts(campaign.recipients)
    if counts.total_recipients == 0:
        campaign.status = "draft"
    elif counts.pending == counts.total_recipients and counts.whatsapp_opened == 0:
        campaign.status = "draft"
    elif counts.pending > 0:
        campaign.status = "in_progress"
    elif counts.failed > 0:
        campaign.status = "completed_with_errors"
    else:
        campaign.status = "completed"
    return campaign.status


def _to_recipient_response(
    recipient: CampaignRecipient, group_names: dict[int, str]
) -> CampaignRecipientResponse:
    return CampaignRecipientResponse(
        id=recipient.id,
        campaign_id=recipient.campaign_id,
        group_id=recipient.group_id,
        group_name=group_names.get(recipient.group_id) if recipient.group_id else None,
        client_id=recipient.client_id,
        client_name=recipient.client_name_snapshot,
        client_phone_normalized=recipient.client_phone_snapshot,
        client_phone_formatted=format_phone(recipient.client_phone_snapshot),
        rendered_message=recipient.rendered_message,
        status=recipient.status,  # type: ignore[arg-type]
        whatsapp_url=build_whatsapp_link(
            recipient.client_phone_snapshot, recipient.rendered_message
        ),
        opened_at=recipient.opened_at,
        sent_at=recipient.sent_at,
        external_message_id=recipient.external_message_id,
        error_message=recipient.error_message,
    )


def to_campaign_summary(campaign: Campaign) -> CampaignSummaryResponse:
    return CampaignSummaryResponse(
        id=campaign.id,
        name=campaign.name,
        format=campaign.format,  # type: ignore[arg-type]
        send_mode=campaign.send_mode,  # type: ignore[arg-type]
        status=campaign.status,  # type: ignore[arg-type]
        provider_mode=campaign.provider_mode,
        is_demo=campaign.is_demo,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        counts=_compute_counts(campaign.recipients),
    )


def to_campaign_detail(campaign: Campaign) -> CampaignDetailResponse:
    group_names = {group.id: group.name for group in campaign.groups}
    group_counts: dict[int, int] = {}
    for recipient in campaign.recipients:
        if recipient.group_id is not None:
            group_counts[recipient.group_id] = group_counts.get(recipient.group_id, 0) + 1

    groups_response = [
        CampaignGroupResponse(
            id=group.id,
            name=group.name,
            template_id=group.template_id,
            message_content=group.message_content,
            position=group.position,
            recipient_count=group_counts.get(group.id, 0),
        )
        for group in campaign.groups
    ]
    recipients_response = [
        _to_recipient_response(recipient, group_names)
        for recipient in campaign.recipients
    ]
    summary = to_campaign_summary(campaign)
    return CampaignDetailResponse(
        **summary.model_dump(),
        template_id=campaign.template_id,
        message_content=campaign.message_content,
        groups=groups_response,
        recipients=recipients_response,
    )


def _load_campaign_or_404(db: Session, campaign_id: int) -> Campaign:
    stmt = (
        select(Campaign)
        .options(selectinload(Campaign.groups), selectinload(Campaign.recipients))
        .where(Campaign.id == campaign_id)
    )
    campaign = db.scalar(stmt)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campanha não encontrada.",
        )
    return campaign


def _validate_and_fetch_clients(db: Session, client_ids: list[int]) -> dict[int, Client]:
    if not client_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selecione pelo menos um cliente para a campanha.",
        )

    # Verifica duplicidade na mesma campanha
    seen: set[int] = set()
    duplicates: list[int] = []
    for cid in client_ids:
        if cid in seen:
            duplicates.append(cid)
        seen.add(cid)

    clients = list(db.scalars(select(Client).where(Client.id.in_(seen))).all())
    clients_by_id = {c.id: c for c in clients}

    missing = [cid for cid in seen if cid not in clients_by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Um ou mais clientes selecionados não existem.",
        )

    if duplicates:
        dup_names = ", ".join(clients_by_id[cid].name for cid in dict.fromkeys(duplicates))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Um cliente não pode ser adicionado duas vezes à mesma campanha ({dup_names})."
            ),
        )

    blocked_opt_out = [c.name for c in clients if not c.whatsapp_opt_in]
    if blocked_opt_out:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Contatos que não autorizaram receber mensagens não podem ser incluídos na campanha: "
                + ", ".join(blocked_opt_out)
            ),
        )

    blocked_inactive = [c.name for c in clients if not c.is_active]
    if blocked_inactive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Clientes inativos não podem ser incluídos na campanha: "
                + ", ".join(blocked_inactive)
            ),
        )

    return clients_by_id


def create_campaign(
    db: Session,
    payload: CampaignCreate,
    settings: Settings | None = None,
    *,
    is_demo: bool = False,
) -> Campaign:
    active_settings = settings or get_settings()

    if payload.format == "general":
        all_client_ids = list(payload.client_ids)
    else:
        all_client_ids = []
        for group in payload.groups:
            all_client_ids.extend(group.client_ids)

    clients_by_id = _validate_and_fetch_clients(db, all_client_ids)

    provider_mode = (
        "manual_wa_link"
        if payload.send_mode == "manual"
        else active_settings.whatsapp_provider_mode
    )

    # Validate template_ids if provided
    template_ids_to_check: set[int] = set()
    if payload.template_id is not None:
        template_ids_to_check.add(payload.template_id)
    for g in payload.groups:
        if g.template_id is not None:
            template_ids_to_check.add(g.template_id)

    if template_ids_to_check:
        found_templates = set(
            db.scalars(
                select(MessageTemplate.id).where(MessageTemplate.id.in_(template_ids_to_check))
            ).all()
        )
        if found_templates != template_ids_to_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Modelo de mensagem selecionado não encontrado.",
            )

    campaign = Campaign(
        name=payload.name,
        format=payload.format,
        send_mode=payload.send_mode,
        status="draft",
        provider_mode=provider_mode,
        template_id=payload.template_id if payload.format == "general" else None,
        message_content=payload.message_content if payload.format == "general" else None,
        is_demo=is_demo,
    )
    db.add(campaign)
    db.flush()

    if payload.format == "general":
        assert payload.message_content is not None
        for cid in payload.client_ids:
            client = clients_by_id[cid]
            rendered = render_message_template(payload.message_content, client.name)
            recipient = CampaignRecipient(
                campaign_id=campaign.id,
                group_id=None,
                client_id=client.id,
                client_name_snapshot=client.name,
                client_phone_snapshot=client.phone_normalized,
                rendered_message=rendered,
                status="prepared",
            )
            db.add(recipient)
    else:
        for idx, group_payload in enumerate(payload.groups):
            group = CampaignGroup(
                campaign_id=campaign.id,
                name=group_payload.name,
                template_id=group_payload.template_id,
                message_content=group_payload.message_content,
                position=idx,
            )
            db.add(group)
            db.flush()

            for cid in group_payload.client_ids:
                client = clients_by_id[cid]
                rendered = render_message_template(group_payload.message_content, client.name)
                recipient = CampaignRecipient(
                    campaign_id=campaign.id,
                    group_id=group.id,
                    client_id=client.id,
                    client_name_snapshot=client.name,
                    client_phone_snapshot=client.phone_normalized,
                    rendered_message=rendered,
                    status="prepared",
                )
                db.add(recipient)

    db.commit()
    return _load_campaign_or_404(db, campaign.id)


def list_campaigns(db: Session) -> list[Campaign]:
    stmt = (
        select(Campaign)
        .options(selectinload(Campaign.recipients))
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
    )
    return list(db.scalars(stmt).all())


def get_campaign_detail(db: Session, campaign_id: int) -> CampaignDetailResponse:
    campaign = _load_campaign_or_404(db, campaign_id)
    return to_campaign_detail(campaign)


def delete_campaign(db: Session, campaign_id: int) -> None:
    campaign = _load_campaign_or_404(db, campaign_id)
    db.delete(campaign)
    db.commit()


def _get_recipient_or_404(
    db: Session, campaign_id: int, recipient_id: int
) -> tuple[Campaign, CampaignRecipient]:
    campaign = _load_campaign_or_404(db, campaign_id)
    recipient = next((r for r in campaign.recipients if r.id == recipient_id), None)
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destinatário não encontrado nesta campanha.",
        )
    return campaign, recipient


def mark_recipient_whatsapp_opened(
    db: Session, campaign_id: int, recipient_id: int
) -> CampaignDetailResponse:
    campaign, recipient = _get_recipient_or_404(db, campaign_id, recipient_id)
    if campaign.send_mode != "manual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Abertura manual do WhatsApp só se aplica a campanhas em modo manual.",
        )

    # Abrir o link não registra como enviada; apenas marca que o link foi aberto
    if recipient.status in ("prepared", "failed"):
        recipient.status = "whatsapp_opened"
        recipient.error_message = None
    if recipient.opened_at is None:
        recipient.opened_at = _utc_now()

    _recalculate_campaign_status(campaign)
    db.commit()
    return get_campaign_detail(db, campaign_id)


def confirm_recipient_manual_send(
    db: Session, campaign_id: int, recipient_id: int
) -> CampaignDetailResponse:
    campaign, recipient = _get_recipient_or_404(db, campaign_id, recipient_id)
    if campaign.send_mode != "manual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmação manual só se aplica a campanhas em modo manual.",
        )

    recipient.status = "sent_manual"
    recipient.sent_at = _utc_now()
    recipient.error_message = None

    _recalculate_campaign_status(campaign)
    db.commit()
    return get_campaign_detail(db, campaign_id)


def mark_recipient_failed(
    db: Session, campaign_id: int, recipient_id: int, error_message: str | None
) -> CampaignDetailResponse:
    campaign, recipient = _get_recipient_or_404(db, campaign_id, recipient_id)
    recipient.status = "failed"
    recipient.error_message = (error_message or "Falha no envio.").strip()

    _recalculate_campaign_status(campaign)
    db.commit()
    return get_campaign_detail(db, campaign_id)


def dispatch_automatic_campaign(
    db: Session, campaign_id: int, settings: Settings | None = None
) -> AutomaticDispatchResponse:
    active_settings = settings or get_settings()
    campaign = _load_campaign_or_404(db, campaign_id)

    if campaign.send_mode != "automatic":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta campanha está configurada para envio manual.",
        )

    provider = get_whatsapp_provider(active_settings)
    campaign.provider_mode = provider.mode_name

    pending_recipients = [
        r for r in campaign.recipients if r.status in ("prepared", "failed")
    ]
    if not pending_recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não há destinatários pendentes para processar nesta campanha.",
        )

    simulated_count = 0
    sent_api_count = 0
    failed_count = 0

    for recipient in pending_recipients:
        result = provider.send_text_message(
            recipient.client_phone_snapshot, recipient.rendered_message
        )
        recipient.status = result.status
        recipient.external_message_id = result.external_message_id
        recipient.error_message = result.error_message
        if result.success:
            recipient.sent_at = _utc_now()
            if result.status == "sent_simulated":
                simulated_count += 1
            elif result.status == "sent_api":
                sent_api_count += 1
        else:
            failed_count += 1

    _recalculate_campaign_status(campaign)
    db.commit()

    detail = get_campaign_detail(db, campaign_id)
    notice = (
        "Simulação concluída: nenhuma mensagem real foi enviada pelo WhatsApp. "
        "Os registros foram salvos como envio simulado."
        if provider.is_simulation
        else "Processamento via WhatsApp Business Cloud API oficial concluído."
    )

    return AutomaticDispatchResponse(
        campaign=detail,
        is_simulation=provider.is_simulation,
        notice=notice,
        processed_count=len(pending_recipients),
        simulated_count=simulated_count,
        sent_api_count=sent_api_count,
        failed_count=failed_count,
    )


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_dashboard_summary(db: Session, settings: Settings | None = None) -> DashboardResponse:
    active_settings = settings or get_settings()

    total_clients = db.scalar(select(func.count(Client.id))) or 0
    active_clients = (
        db.scalar(select(func.count(Client.id)).where(Client.is_active.is_(True))) or 0
    )
    opted_in_clients = (
        db.scalar(
            select(func.count(Client.id)).where(
                Client.is_active.is_(True), Client.whatsapp_opt_in.is_(True)
            )
        )
        or 0
    )
    total_campaigns = db.scalar(select(func.count(Campaign.id))) or 0
    total_templates = db.scalar(select(func.count(MessageTemplate.id))) or 0

    recipients = list(db.scalars(select(CampaignRecipient)).all())
    counts = _compute_counts(recipients)

    recent_stmt = (
        select(Campaign)
        .options(selectinload(Campaign.recipients))
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
        .limit(5)
    )
    recent_campaigns = [to_campaign_summary(c) for c in db.scalars(recent_stmt).all()]

    # Lembretes: clientes ativos e autorizados sem receber mensagens há mais de 30 dias
    now = _utc_now()
    cutoff = now - timedelta(days=30)

    sent_statuses = ("sent_manual", "sent_simulated", "sent_api")
    last_sent_rows = db.execute(
        select(
            CampaignRecipient.client_id,
            func.max(CampaignRecipient.sent_at).label("last_sent_at"),
        )
        .where(
            CampaignRecipient.client_id.is_not(None),
            CampaignRecipient.status.in_(sent_statuses),
            CampaignRecipient.sent_at.is_not(None),
        )
        .group_by(CampaignRecipient.client_id)
    ).all()
    last_sent_by_client: dict[int, datetime] = {
        row.client_id: _as_utc(row.last_sent_at)
        for row in last_sent_rows
        if row.client_id is not None and row.last_sent_at is not None
    }

    eligible_clients = list(
        db.scalars(
            select(Client).where(
                Client.is_active.is_(True), Client.whatsapp_opt_in.is_(True)
            )
        ).all()
    )

    reminders: list[InactiveContactReminder] = []
    for client in eligible_clients:
        last_sent = last_sent_by_client.get(client.id)
        if last_sent is not None:
            if last_sent < cutoff:
                reminders.append(
                    InactiveContactReminder(
                        client_id=client.id,
                        client_name=client.name,
                        phone_formatted=format_phone(client.phone_normalized),
                        last_sent_at=last_sent,
                        days_without_message=(now - last_sent).days,
                        never_messaged=False,
                    )
                )
        else:
            created_utc = _as_utc(client.created_at)
            if created_utc < cutoff:
                reminders.append(
                    InactiveContactReminder(
                        client_id=client.id,
                        client_name=client.name,
                        phone_formatted=format_phone(client.phone_normalized),
                        last_sent_at=None,
                        days_without_message=(now - created_utc).days,
                        never_messaged=True,
                    )
                )

    reminders.sort(key=lambda r: r.days_without_message, reverse=True)

    return DashboardResponse(
        total_clients=total_clients,
        active_clients=active_clients,
        opted_in_clients=opted_in_clients,
        total_campaigns=total_campaigns,
        total_templates=total_templates,
        delivery_summary=DeliverySummary(
            total_recipients=counts.total_recipients,
            sent_manual=counts.sent_manual,
            sent_simulated=counts.sent_simulated,
            sent_api=counts.sent_api,
            pending=counts.pending,
            failed=counts.failed,
        ),
        recent_campaigns=recent_campaigns,
        inactive_contact_reminders=reminders,
        database_mode=active_settings.database_mode,
        whatsapp_provider_mode=active_settings.whatsapp_provider_mode,
    )

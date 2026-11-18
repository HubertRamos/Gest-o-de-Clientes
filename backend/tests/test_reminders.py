from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from delivery_system.models.campaign import Campaign, CampaignRecipient
from delivery_system.models.client import Client


def test_dashboard_inactive_contact_reminders_over_30_days(
    client: TestClient, db_session: Session
) -> None:
    now = datetime.now(timezone.utc)

    c_overdue = Client(
        name="Cliente Sem Contato 40d",
        phone_normalized="5511980000001",
        is_active=True,
        whatsapp_opt_in=True,
        created_at=now - timedelta(days=60),
    )
    c_recent = Client(
        name="Cliente Contatado 5d",
        phone_normalized="5511980000002",
        is_active=True,
        whatsapp_opt_in=True,
        created_at=now - timedelta(days=60),
    )
    c_never_old = Client(
        name="Cliente Nunca Contatado 45d",
        phone_normalized="5511980000003",
        is_active=True,
        whatsapp_opt_in=True,
        created_at=now - timedelta(days=45),
    )
    c_opt_out = Client(
        name="Cliente Sem Autorizacao 50d",
        phone_normalized="5511980000004",
        is_active=True,
        whatsapp_opt_in=False,
        created_at=now - timedelta(days=50),
    )
    c_new_today = Client(
        name="Cliente Novo Hoje",
        phone_normalized="5511980000005",
        is_active=True,
        whatsapp_opt_in=True,
        created_at=now,
    )
    db_session.add_all([c_overdue, c_recent, c_never_old, c_opt_out, c_new_today])
    db_session.flush()

    camp = Campaign(
        name="Campanha Anterior",
        format="general",
        send_mode="manual",
        status="completed",
        provider_mode="manual_wa_link",
    )
    db_session.add(camp)
    db_session.flush()

    db_session.add_all(
        [
            CampaignRecipient(
                campaign_id=camp.id,
                client_id=c_overdue.id,
                client_name_snapshot=c_overdue.name,
                client_phone_snapshot=c_overdue.phone_normalized,
                rendered_message="Oi",
                status="sent_manual",
                sent_at=now - timedelta(days=40),
            ),
            CampaignRecipient(
                campaign_id=camp.id,
                client_id=c_recent.id,
                client_name_snapshot=c_recent.name,
                client_phone_snapshot=c_recent.phone_normalized,
                rendered_message="Oi",
                status="sent_manual",
                sent_at=now - timedelta(days=5),
            ),
        ]
    )
    db_session.commit()

    dash = client.get("/api/dashboard").json()
    reminders = dash["inactive_contact_reminders"]
    names = [r["client_name"] for r in reminders]

    assert "Cliente Nunca Contatado 45d" in names
    assert "Cliente Sem Contato 40d" in names
    assert "Cliente Contatado 5d" not in names
    assert "Cliente Sem Autorizacao 50d" not in names
    assert "Cliente Novo Hoje" not in names

    overdue_entry = next(r for r in reminders if r["client_name"] == "Cliente Sem Contato 40d")
    assert overdue_entry["days_without_message"] >= 40
    assert overdue_entry["never_messaged"] is False

    never_entry = next(r for r in reminders if r["client_name"] == "Cliente Nunca Contatado 45d")
    assert never_entry["never_messaged"] is True
    assert never_entry["days_without_message"] >= 45

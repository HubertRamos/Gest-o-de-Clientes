from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from delivery_system.models.campaign import Campaign, CampaignGroup, CampaignRecipient
from delivery_system.models.client import Client
from delivery_system.models.template import MessageTemplate
from delivery_system.services.template_service import render_message_template


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


DEMO_CLIENTS = [
    {
        "name": "Ana Paula Ferreira (Demo)",
        "phone_normalized": "5511900001001",
        "address": "Rua das Acácias, 120 - Centro",
        "notes": "Compra marmita executiva às terças e quintas.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Bruno Henrique Costa (Demo)",
        "phone_normalized": "5511900001002",
        "address": "Av. Brasil, 450 - Jardim Paulista",
        "notes": "Prefere entrega após as 11h30.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Carla Mendes Souza (Demo)",
        "phone_normalized": "5511900001003",
        "address": "Rua São João, 88 - Vila Nova",
        "notes": "Cliente frequente de fim de semana.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Diego Almeida Rocha (Demo)",
        "phone_normalized": "5511900001004",
        "address": "Rua do Comércio, 315 - Loja 2",
        "notes": "Pedido recorrente para o escritório.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Eduarda Lima Santos (Demo)",
        "phone_normalized": "5511900001005",
        "address": "Alameda Santos, 710 - Apto 42",
        "notes": "Conheceu o serviço nesta semana.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Felipe Martins Oliveira (Demo)",
        "phone_normalized": "5511900001006",
        "address": "Rua Sete de Setembro, 54",
        "notes": "Solicitou não receber mensagens promocionais no momento.",
        "is_active": True,
        "whatsapp_opt_in": False,
    },
    {
        "name": "Gabriela Ribeiro Duarte (Demo)",
        "phone_normalized": "5511900001007",
        "address": "Rua Bela Vista, 201",
        "notes": "Cadastro antigo pausado temporariamente.",
        "is_active": False,
        "whatsapp_opt_in": True,
    },
    {
        "name": "Henrique Carvalho Nunes (Demo)",
        "phone_normalized": "5511900001008",
        "address": "Rua Amazonas, 930 - Galpão B",
        "notes": "Novo contato da rota da tarde.",
        "is_active": True,
        "whatsapp_opt_in": True,
    },
]

DEMO_TEMPLATES = [
    {
        "title": "Abertura de pedidos do dia",
        "content": (
            "Olá, {{nome}}!\n\n"
            "Estou passando para saber se deseja fazer algum pedido hoje.\n\n"
            "Qualquer coisa, estou à disposição!"
        ),
    },
    {
        "title": "Rota passando na região",
        "content": (
            "Oi, {{nome}}! Tudo bem?\n\n"
            "Já estou organizando as entregas da sua região hoje. "
            "Se precisar de alguma coisa, me avise por aqui."
        ),
    },
    {
        "title": "Boas-vindas para novo cliente",
        "content": (
            "Olá, {{nome}}! Seja bem-vindo(a).\n\n"
            "Este é meu contato direto para entregas. Quando quiser fazer um pedido, "
            "é só me chamar por aqui!"
        ),
    },
]


def seed_demo_data(db: Session) -> dict[str, int | str]:
    existing_demo_clients = {
        c.phone_normalized: c
        for c in db.scalars(select(Client).where(Client.is_demo.is_(True))).all()
    }
    created_clients = 0
    for item in DEMO_CLIENTS:
        if item["phone_normalized"] in existing_demo_clients:
            continue
        existing_phone = db.scalar(
            select(Client).where(Client.phone_normalized == item["phone_normalized"])
        )
        if existing_phone:
            continue
        client = Client(
            name=item["name"],
            phone_normalized=item["phone_normalized"],
            address=item["address"],
            notes=item["notes"],
            is_active=item["is_active"],
            whatsapp_opt_in=item["whatsapp_opt_in"],
            opt_out_at=None if item["whatsapp_opt_in"] else _utc_now(),
            is_demo=True,
        )
        db.add(client)
        db.flush()
        existing_demo_clients[client.phone_normalized] = client
        created_clients += 1

    existing_demo_templates = {
        t.title: t
        for t in db.scalars(select(MessageTemplate).where(MessageTemplate.is_demo.is_(True))).all()
    }
    created_templates = 0
    for tpl in DEMO_TEMPLATES:
        if tpl["title"] in existing_demo_templates:
            continue
        template = MessageTemplate(
            title=tpl["title"],
            content=tpl["content"],
            is_demo=True,
        )
        db.add(template)
        db.flush()
        existing_demo_templates[template.title] = template
        created_templates += 1

    created_campaigns = 0
    existing_demo_campaigns = db.scalars(
        select(Campaign).where(Campaign.is_demo.is_(True))
    ).all()

    if not existing_demo_campaigns:
        eligible_clients = [
            c
            for c in existing_demo_clients.values()
            if c.is_active and c.whatsapp_opt_in
        ]
        eligible_clients.sort(key=lambda c: c.phone_normalized)

        tpl_day = existing_demo_templates.get("Abertura de pedidos do dia")
        tpl_route = existing_demo_templates.get("Rota passando na região")
        tpl_welcome = existing_demo_templates.get("Boas-vindas para novo cliente")

        if len(eligible_clients) >= 4 and tpl_day:
            # 1) Campanha geral manual em andamento (demonstração)
            manual_campaign = Campaign(
                name="Pedidos de hoje — Rota Centro (Demonstração)",
                format="general",
                send_mode="manual",
                status="in_progress",
                provider_mode="manual_wa_link",
                template_id=tpl_day.id,
                message_content=tpl_day.content,
                is_demo=True,
            )
            db.add(manual_campaign)
            db.flush()

            statuses = ["sent_manual", "whatsapp_opened", "prepared", "prepared"]
            for idx, client in enumerate(eligible_clients[:4]):
                st = statuses[idx]
                now = _utc_now()
                db.add(
                    CampaignRecipient(
                        campaign_id=manual_campaign.id,
                        group_id=None,
                        client_id=client.id,
                        client_name_snapshot=client.name,
                        client_phone_snapshot=client.phone_normalized,
                        rendered_message=render_message_template(tpl_day.content, client.name),
                        status=st,
                        opened_at=now if st in ("whatsapp_opened", "sent_manual") else None,
                        sent_at=now if st == "sent_manual" else None,
                    )
                )
            created_campaigns += 1

        if len(eligible_clients) >= 6 and tpl_route and tpl_welcome:
            # 2) Campanha segmentada automática simulada (demonstração)
            seg_campaign = Campaign(
                name="Aviso de entregas da semana (Demonstração)",
                format="segmented",
                send_mode="automatic",
                status="completed",
                provider_mode="simulation",
                is_demo=True,
            )
            db.add(seg_campaign)
            db.flush()

            g1 = CampaignGroup(
                campaign_id=seg_campaign.id,
                name="Clientes frequentes",
                template_id=tpl_route.id,
                message_content=tpl_route.content,
                position=0,
            )
            g2 = CampaignGroup(
                campaign_id=seg_campaign.id,
                name="Novos clientes",
                template_id=tpl_welcome.id,
                message_content=tpl_welcome.content,
                position=1,
            )
            db.add_all([g1, g2])
            db.flush()

            now = _utc_now()
            for idx, client in enumerate(eligible_clients[:3]):
                db.add(
                    CampaignRecipient(
                        campaign_id=seg_campaign.id,
                        group_id=g1.id,
                        client_id=client.id,
                        client_name_snapshot=client.name,
                        client_phone_snapshot=client.phone_normalized,
                        rendered_message=render_message_template(tpl_route.content, client.name),
                        status="sent_simulated",
                        sent_at=now,
                        external_message_id=f"sim_demo_g1_{idx + 1}",
                    )
                )
            for idx, client in enumerate(eligible_clients[3:6]):
                db.add(
                    CampaignRecipient(
                        campaign_id=seg_campaign.id,
                        group_id=g2.id,
                        client_id=client.id,
                        client_name_snapshot=client.name,
                        client_phone_snapshot=client.phone_normalized,
                        rendered_message=render_message_template(tpl_welcome.content, client.name),
                        status="sent_simulated",
                        sent_at=now,
                        external_message_id=f"sim_demo_g2_{idx + 1}",
                    )
                )
            created_campaigns += 1

    db.commit()
    return {
        "created_clients": created_clients,
        "created_templates": created_templates,
        "created_campaigns": created_campaigns,
        "message": "Dados de demonstração carregados com números fictícios.",
    }


def clear_demo_data(db: Session) -> dict[str, str]:
    db.execute(delete(Campaign).where(Campaign.is_demo.is_(True)))
    db.execute(delete(MessageTemplate).where(MessageTemplate.is_demo.is_(True)))
    db.execute(delete(Client).where(Client.is_demo.is_(True)))
    db.commit()
    return {"message": "Dados de demonstração removidos com sucesso."}

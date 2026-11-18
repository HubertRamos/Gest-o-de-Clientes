from __future__ import annotations

from fastapi.testclient import TestClient


def _create_client(
    client: TestClient, name: str, phone: str, *, is_active: bool = True, opt_in: bool = True
) -> dict:
    res = client.post(
        "/api/clients",
        json={
            "name": name,
            "phone": phone,
            "is_active": is_active,
            "whatsapp_opt_in": opt_in,
        },
    )
    assert res.status_code == 201
    return res.json()


def test_general_campaign_manual_flow_and_opt_in_guard(client: TestClient) -> None:
    c1 = _create_client(client, "Ana", "11990000001")
    c2 = _create_client(client, "Bruno", "11990000002")
    blocked = _create_client(client, "Carlos Sem OptIn", "11990000003", opt_in=False)

    # Tentativa com contato sem opt-in deve falhar
    fail_res = client.post(
        "/api/campaigns",
        json={
            "name": "Campanha Inválida",
            "format": "general",
            "send_mode": "manual",
            "message_content": "Olá, {{nome}}!",
            "client_ids": [c1["id"], blocked["id"]],
        },
    )
    assert fail_res.status_code == 400

    # Campanha válida
    res = client.post(
        "/api/campaigns",
        json={
            "name": "Pedidos de Hoje",
            "format": "general",
            "send_mode": "manual",
            "message_content": "Olá, {{nome}}! Vai querer pedido?",
            "client_ids": [c1["id"], c2["id"]],
        },
    )
    assert res.status_code == 201
    campaign = res.json()
    assert campaign["status"] == "draft"
    assert campaign["counts"]["prepared"] == 2
    r1 = campaign["recipients"][0]
    assert r1["rendered_message"] == "Olá, Ana! Vai querer pedido?"
    assert r1["whatsapp_url"].startswith("https://wa.me/5511990000001?text=")

    # Abrir WhatsApp não marca como enviada
    opened = client.post(
        f"/api/campaigns/{campaign['id']}/recipients/{r1['id']}/open-whatsapp"
    ).json()
    assert opened["status"] == "in_progress"
    assert opened["counts"]["whatsapp_opened"] == 1
    assert opened["counts"]["sent_manual"] == 0

    # Confirmar envio manual do primeiro e do segundo destinatário
    client.post(f"/api/campaigns/{campaign['id']}/recipients/{r1['id']}/confirm-manual")
    r2 = campaign["recipients"][1]
    done = client.post(
        f"/api/campaigns/{campaign['id']}/recipients/{r2['id']}/confirm-manual"
    ).json()
    assert done["status"] == "completed"
    assert done["counts"]["sent_manual"] == 2
    assert done["counts"]["pending"] == 0


def test_segmented_campaign_prevents_duplicate_client_and_simulates_auto(
    client: TestClient,
) -> None:
    c1 = _create_client(client, "Diana", "11990000011")
    c2 = _create_client(client, "Eduardo", "11990000012")

    # Mesmo cliente em dois grupos da mesma campanha deve ser rejeitado
    dup_res = client.post(
        "/api/campaigns",
        json={
            "name": "Campanha Duplicada",
            "format": "segmented",
            "send_mode": "automatic",
            "groups": [
                {
                    "name": "Grupo A",
                    "message_content": "Oi, {{nome}}! Grupo A",
                    "client_ids": [c1["id"]],
                },
                {
                    "name": "Grupo B",
                    "message_content": "Oi, {{nome}}! Grupo B",
                    "client_ids": [c1["id"], c2["id"]],
                },
            ],
        },
    )
    assert dup_res.status_code == 400

    # Campanha segmentada válida + disparo automático simulado
    res = client.post(
        "/api/campaigns",
        json={
            "name": "Segmentada Semana",
            "format": "segmented",
            "send_mode": "automatic",
            "groups": [
                {
                    "name": "Frequentes",
                    "message_content": "Oi, {{nome}}! Cardápio especial.",
                    "client_ids": [c1["id"]],
                },
                {
                    "name": "Novos",
                    "message_content": "Olá, {{nome}}! Seja bem-vindo.",
                    "client_ids": [c2["id"]],
                },
            ],
        },
    )
    assert res.status_code == 201
    campaign = res.json()
    assert len(campaign["groups"]) == 2

    dispatch = client.post(f"/api/campaigns/{campaign['id']}/dispatch-automatic")
    assert dispatch.status_code == 200
    payload = dispatch.json()
    assert payload["is_simulation"] is True
    assert payload["simulated_count"] == 2
    assert payload["campaign"]["status"] == "completed"
    assert payload["campaign"]["counts"]["sent_simulated"] == 2

    # Verificar painel inicial
    dash = client.get("/api/dashboard").json()
    assert dash["total_clients"] == 2
    assert dash["total_campaigns"] == 1
    assert dash["delivery_summary"]["sent_simulated"] == 2

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_search_filter_and_prevent_duplicate_phone(client: TestClient) -> None:
    res = client.post(
        "/api/clients",
        json={
            "name": "Maria Clara",
            "phone": "(11) 98888-7777",
            "address": "Rua das Flores, 100",
            "notes": "Cliente da manhã",
            "is_active": True,
            "whatsapp_opt_in": True,
        },
    )
    assert res.status_code == 201
    created = res.json()
    assert created["phone_normalized"] == "5511988887777"
    assert created["phone_formatted"] == "+55 (11) 98888-7777"
    assert created["whatsapp_opt_in"] is True

    # Mesmo número em outro formato deve ser bloqueado (409)
    dup = client.post(
        "/api/clients",
        json={
            "name": "Outra Pessoa",
            "phone": "5511988887777",
            "is_active": True,
            "whatsapp_opt_in": True,
        },
    )
    assert dup.status_code == 409

    # Pesquisa por nome e telefone
    by_name = client.get("/api/clients", params={"search": "Maria"}).json()
    assert len(by_name) == 1
    by_phone = client.get("/api/clients", params={"search": "98888"}).json()
    assert len(by_phone) == 1

    # Desativar cliente e filtrar por ativos/inativos
    cid = created["id"]
    deactivated = client.patch(f"/api/clients/{cid}/status", json={"is_active": False})
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    active_list = client.get("/api/clients", params={"status": "active"}).json()
    assert len(active_list) == 0
    inactive_list = client.get("/api/clients", params={"status": "inactive"}).json()
    assert len(inactive_list) == 1

    # Retirar autorização do WhatsApp
    revoked = client.patch(f"/api/clients/{cid}/opt-in", json={"whatsapp_opt_in": False})
    assert revoked.status_code == 200
    assert revoked.json()["whatsapp_opt_in"] is False
    assert revoked.json()["opt_out_at"] is not None

    # Excluir cliente
    deleted = client.delete(f"/api/clients/{cid}")
    assert deleted.status_code == 204
    assert client.get("/api/clients").json() == []


def test_database_mode_switcher_configuration(settings_factory) -> None:
    local_settings = settings_factory(database_mode="local")
    assert local_settings.resolved_database_url().startswith("sqlite:///")

    supa_settings = settings_factory(
        database_mode="supabase",
        database_url="postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
    )
    assert supa_settings.resolved_database_url().startswith("postgresql+psycopg://")

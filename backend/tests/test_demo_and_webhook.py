from __future__ import annotations

from fastapi.testclient import TestClient


def test_demo_seed_and_clear(client: TestClient) -> None:
    seed_res = client.post("/api/demo/seed")
    assert seed_res.status_code == 200
    data = seed_res.json()
    assert data["created_clients"] == 8
    assert data["created_templates"] == 3
    assert data["created_campaigns"] == 2

    # Idempotente se executado novamente
    seed_again = client.post("/api/demo/seed").json()
    assert seed_again["created_clients"] == 0

    clients = client.get("/api/clients").json()
    assert len(clients) == 8
    assert any(not c["whatsapp_opt_in"] for c in clients)
    assert any(not c["is_active"] for c in clients)

    clear_res = client.delete("/api/demo/clear")
    assert clear_res.status_code == 200
    assert client.get("/api/clients").json() == []
    assert client.get("/api/campaigns").json() == []
    assert client.get("/api/templates").json() == []

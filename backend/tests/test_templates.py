from __future__ import annotations

from fastapi.testclient import TestClient


def test_template_crud_and_variable_preview(client: TestClient) -> None:
    res = client.post(
        "/api/templates",
        json={
            "title": "Pedido do dia",
            "content": "Olá, {{nome}}! Deseja fazer pedido hoje?",
        },
    )
    assert res.status_code == 201
    tpl = res.json()
    assert tpl["title"] == "Pedido do dia"

    updated = client.put(
        f"/api/templates/{tpl['id']}",
        json={"content": "Oi, {{ nome }}! Já estou saindo para entrega."},
    )
    assert updated.status_code == 200
    assert "{{ nome }}" in updated.json()["content"]

    preview = client.post(
        "/api/templates/preview",
        json={"content": updated.json()["content"], "client_name": "João Pedro"},
    )
    assert preview.status_code == 200
    assert preview.json()["rendered_message"] == "Oi, João Pedro! Já estou saindo para entrega."

    deleted = client.delete(f"/api/templates/{tpl['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/templates").json() == []

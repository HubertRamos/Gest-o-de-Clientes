from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from delivery_system.models.client import Client


def _build_xlsx_bytes(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def test_download_template_and_ignore_demo_row(client: TestClient) -> None:
    res = client.get("/api/clients/import/template")
    assert res.status_code == 200
    assert (
        res.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    wb = load_workbook(BytesIO(res.content), read_only=True)
    assert "Clientes" in wb.sheetnames
    assert "Orientações" in wb.sheetnames
    wb.close()

    # Se enviar o modelo sem apagar a linha de exemplo, ela é ignorada e nunca importada
    preview = client.post(
        "/api/clients/import/preview",
        files={
            "file": (
                "modelo_importacao_clientes.xlsx",
                res.content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert preview.status_code == 200
    data = preview.json()
    assert data["summary"]["valid_count"] == 0
    assert data["summary"]["error_count"] == 1
    assert "demonstração" in data["rows"][0]["reason"].lower()


def test_import_valid_spreadsheet_and_opt_in_values(client: TestClient) -> None:
    content = _build_xlsx_bytes(
        [
            [
                "  NOME ",
                " telefone  ",
                "Endereço",
                " Observações ",
                "Autorizado para mensagens",
            ],
            ["João Silva", "43999990001", "Centro", "Cliente frequente", "Sim"],
            ["Maria Souza", 43999990002.0, "Jardim Alegre", None, "Não"],
            ["Carlos Santos", "(43) 99999-0003", "Rua A, 120", "Novo", "yes"],
            ["Lucia Alves", "43999990004", "", "", ""],
            ["Pedro Rocha", "43999990005", "", "", "1"],
            ["Paula Dias", "43999990006", "", "", "0"],
            ["Marcos Lima", "43999990007", "", "", "NO"],
        ]
    )

    preview = client.post(
        "/api/clients/import/preview",
        files={"file": ("clientes.xlsx", content, "application/octet-stream")},
    )
    assert preview.status_code == 200
    prev_data = preview.json()
    assert prev_data["summary"] == {
        "total_rows": 7,
        "valid_count": 7,
        "duplicate_count": 0,
        "error_count": 0,
    }

    confirm = client.post(
        "/api/clients/import/confirm",
        files={"file": ("clientes.xlsx", content, "application/octet-stream")},
    )
    assert confirm.status_code == 200
    conf_data = confirm.json()
    assert conf_data["imported_count"] == 7
    assert conf_data["duplicate_count"] == 0
    assert conf_data["error_count"] == 0

    stored = {c["name"]: c for c in client.get("/api/clients").json()}
    assert stored["João Silva"]["whatsapp_opt_in"] is True
    assert stored["João Silva"]["phone_normalized"] == "5543999990001"
    assert stored["Maria Souza"]["whatsapp_opt_in"] is False
    assert stored["Maria Souza"]["phone_normalized"] == "5543999990002"
    assert stored["Carlos Santos"]["whatsapp_opt_in"] is True
    assert stored["Lucia Alves"]["whatsapp_opt_in"] is False
    assert stored["Pedro Rocha"]["whatsapp_opt_in"] is True
    assert stored["Paula Dias"]["whatsapp_opt_in"] is False
    assert stored["Marcos Lima"]["whatsapp_opt_in"] is False


def test_import_missing_required_columns(client: TestClient) -> None:
    content = _build_xlsx_bytes(
        [
            ["Nome", "Endereço"],
            ["João Silva", "Centro"],
        ]
    )
    res = client.post(
        "/api/clients/import/preview",
        files={"file": ("sem_telefone.xlsx", content, "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "Telefone" in res.json()["detail"]


def test_import_validation_errors_empty_name_empty_phone_invalid_phone(
    client: TestClient,
) -> None:
    content = _build_xlsx_bytes(
        [
            ["Nome", "Telefone", "Autorizado para mensagens"],
            ["", "43999990010", "Sim"],
            ["Sem Telefone", "", "Sim"],
            ["Telefone Curto", "12345", "Sim"],
            ["Cliente Válido", "43999990011", "Sim"],
        ]
    )
    preview = client.post(
        "/api/clients/import/preview",
        files={"file": ("erros.xlsx", content, "application/octet-stream")},
    )
    assert preview.status_code == 200
    data = preview.json()
    assert data["summary"]["valid_count"] == 1
    assert data["summary"]["error_count"] == 3
    reasons = [row["reason"] for row in data["rows"]]
    assert "Nome não informado." in reasons
    assert "Telefone não informado." in reasons
    assert any("Telefone inválido" in (r or "") for r in reasons)

    confirm = client.post(
        "/api/clients/import/confirm",
        files={"file": ("erros.xlsx", content, "application/octet-stream")},
    )
    assert confirm.status_code == 200
    assert confirm.json()["imported_count"] == 1
    assert confirm.json()["error_count"] == 3
    assert len(confirm.json()["skipped_rows"]) == 3


def test_import_duplicates_in_db_and_in_sheet_without_modifying_existing(
    client: TestClient,
) -> None:
    # Cadastra cliente existente manualmente
    created = client.post(
        "/api/clients",
        json={
            "name": "Cliente Existente Original",
            "phone": "43999990020",
            "address": "Endereço Original",
            "is_active": True,
            "whatsapp_opt_in": False,
        },
    )
    assert created.status_code == 201

    content = _build_xlsx_bytes(
        [
            ["Nome", "Telefone", "Endereço", "Autorizado para mensagens"],
            ["Tentativa Sobrescrever", "(43) 99999-0020", "Outro Endereço", "Sim"],
            ["Novo Primeiro", "43999990021", "Rua 1", "Sim"],
            ["Duplicado Na Planilha", "43999990021", "Rua 2", "Sim"],
        ]
    )

    preview = client.post(
        "/api/clients/import/preview",
        files={"file": ("duplicados.xlsx", content, "application/octet-stream")},
    )
    assert preview.status_code == 200
    data = preview.json()
    assert data["summary"]["valid_count"] == 1
    assert data["summary"]["duplicate_count"] == 2
    assert data["rows"][0]["status"] == "duplicate"
    assert "já cadastrado" in data["rows"][0]["reason"].lower()
    assert data["rows"][1]["status"] == "valid"
    assert data["rows"][2]["status"] == "duplicate"
    assert "própria planilha" in data["rows"][2]["reason"].lower()

    confirm = client.post(
        "/api/clients/import/confirm",
        files={"file": ("duplicados.xlsx", content, "application/octet-stream")},
    )
    assert confirm.status_code == 200
    assert confirm.json()["imported_count"] == 1
    assert confirm.json()["duplicate_count"] == 2

    all_clients = client.get("/api/clients").json()
    assert len(all_clients) == 2
    existing = next(c for c in all_clients if c["phone_normalized"] == "5543999990020")
    assert existing["name"] == "Cliente Existente Original"
    assert existing["address"] == "Endereço Original"
    assert existing["whatsapp_opt_in"] is False


def test_import_unsupported_format_and_empty_sheet(client: TestClient) -> None:
    csv_res = client.post(
        "/api/clients/import/preview",
        files={"file": ("clientes.csv", b"Nome,Telefone\nJoao,43999990001", "text/csv")},
    )
    assert csv_res.status_code == 400
    assert ".xlsx" in csv_res.json()["detail"]

    fake_xlsx = client.post(
        "/api/clients/import/preview",
        files={"file": ("falso.xlsx", b"not-a-zip-file", "application/octet-stream")},
    )
    assert fake_xlsx.status_code == 400

    empty_content = _build_xlsx_bytes([["Nome", "Telefone", "Endereço"]])
    empty_res = client.post(
        "/api/clients/import/preview",
        files={"file": ("vazia.xlsx", empty_content, "application/octet-stream")},
    )
    assert empty_res.status_code == 400
    assert "não contém registros" in empty_res.json()["detail"].lower()


def test_import_database_failure_rolls_back_transaction(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    content = _build_xlsx_bytes(
        [
            ["Nome", "Telefone", "Autorizado para mensagens"],
            ["Cliente Rollback 1", "43999990031", "Sim"],
            ["Cliente Rollback 2", "43999990032", "Sim"],
        ]
    )

    def failing_commit() -> None:
        raise SQLAlchemyError("Simulated DB commit failure")

    monkeypatch.setattr(db_session, "commit", failing_commit)

    res = client.post(
        "/api/clients/import/confirm",
        files={"file": ("rollback.xlsx", content, "application/octet-stream")},
    )
    assert res.status_code == 500
    assert "revertida" in res.json()["detail"].lower()

    # Garante que nenhum cliente foi gravado no banco
    monkeypatch.undo()
    remaining = db_session.scalars(select(Client)).all()
    assert remaining == []

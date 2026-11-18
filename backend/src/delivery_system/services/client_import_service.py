from __future__ import annotations

from io import BytesIO
import unicodedata
from zipfile import BadZipFile

from fastapi import HTTPException, status
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from delivery_system.models.client import Client
from delivery_system.schemas.client_import import (
    ImportConfirmResponse,
    ImportPreviewResponse,
    ImportPreviewSummary,
    ImportRowPreview,
)
from delivery_system.services.client_service import to_client_response
from delivery_system.services.phone_service import format_phone, normalize_phone

MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
_ZIP_MAGIC_HEADER = b"PK\x03\x04"

_TRUE_OPT_IN_VALUES = {"sim", "s", "yes", "y", "1", "true"}
_FALSE_OPT_IN_VALUES = {"nao", "não", "n", "no", "0", "false"}

_EXAMPLE_NAME_MARKER = "exemplo demonstração"
_EXAMPLE_NOTES_MARKER = "linha de exemplo (demonstração)"


def _normalize_header(raw: object) -> str:
    text = " ".join(str(raw or "").strip().lower().split())
    # Remove acentos para tolerar variações como "Endereço" / "Endereco"
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _cell_to_clean_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Sim" if value else "Não"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value).strip()
    return str(value).strip()


def _parse_opt_in(value: object) -> tuple[bool, str | None]:
    if value is None:
        return False, None
    if isinstance(value, bool):
        return value, None
    if isinstance(value, (int, float)):
        if value == 1:
            return True, None
        if value == 0:
            return False, None
        return False, "Valor inválido em 'Autorizado para mensagens' (use Sim ou Não)."

    text = " ".join(str(value).strip().lower().split())
    if not text:
        return False, None
    if text in _TRUE_OPT_IN_VALUES:
        return True, None
    if text in _FALSE_OPT_IN_VALUES:
        return False, None
    return False, "Valor inválido em 'Autorizado para mensagens' (use Sim ou Não)."


def generate_import_template_xlsx() -> bytes:
    """Gera arquivo .xlsx modelo com colunas, linha de exemplo marcada como demonstração e orientações."""
    workbook = Workbook()

    ws_clients = workbook.active
    assert ws_clients is not None
    ws_clients.title = "Clientes"
    headers = [
        "Nome",
        "Telefone",
        "Endereço",
        "Observações",
        "Autorizado para mensagens",
    ]
    ws_clients.append(headers)
    ws_clients.append(
        [
            "João Silva (Exemplo Demonstração)",
            "43999990001",
            "Rua Central, 100 - Centro",
            "Linha de exemplo (demonstração) - não será importada automaticamente",
            "Sim",
        ]
    )

    widths = [36, 18, 32, 48, 28]
    for idx, width in enumerate(widths, start=1):
        col_letter = ws_clients.cell(row=1, column=idx).column_letter
        ws_clients.column_dimensions[col_letter].width = width

    ws_notes = workbook.create_sheet(title="Orientações")
    ws_notes.append(["Campo", "Obrigatório", "Como preencher"])
    ws_notes.append(["Nome", "Sim", "Nome completo do cliente (mínimo 2 caracteres)."])
    ws_notes.append(
        [
            "Telefone",
            "Sim",
            "Número do WhatsApp com DDD (ex: 43999990001 ou (43) 99999-0001).",
        ]
    )
    ws_notes.append(["Endereço", "Não", "Endereço ou ponto de referência para entrega."])
    ws_notes.append(["Observações", "Não", "Informações extras sobre o cliente ou pedidos."])
    ws_notes.append(
        [
            "Autorizado para mensagens",
            "Não",
            "Informe Sim ou Não (também aceita Yes/No/1/0). Se ficar vazio, será salvo como Não autorizado.",
        ]
    )
    ws_notes.append(
        [
            "Linha de exemplo",
            "-",
            "A linha 2 da aba Clientes é apenas demonstração e é ignorada automaticamente na importação.",
        ]
    )
    ws_notes.column_dimensions["A"].width = 28
    ws_notes.column_dimensions["B"].width = 14
    ws_notes.column_dimensions["C"].width = 76

    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def validate_excel_upload(filename: str | None, content: bytes) -> str:
    safe_name = (filename or "planilha.xlsx").split("/")[-1].split("\\")[-1].strip()
    if not safe_name.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato não suportado. Envie apenas planilhas Excel no formato .xlsx.",
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado está vazio.",
        )

    if len(content) > MAX_IMPORT_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="O arquivo excede o tamanho máximo permitido de 5 MB.",
        )

    if not content.startswith(_ZIP_MAGIC_HEADER):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado não é uma planilha .xlsx válida.",
        )

    return safe_name


def _resolve_columns(header_row: tuple[object, ...]) -> dict[str, int]:
    col_map: dict[str, int] = {}
    aliases = {
        "nome": "name",
        "telefone": "phone",
        "telefone/whatsapp": "phone",
        "whatsapp": "phone",
        "endereco": "address",
        "observacoes": "notes",
        "observacao": "notes",
        "autorizado para mensagens": "opt_in",
    }

    for idx, cell_value in enumerate(header_row):
        normalized = _normalize_header(cell_value)
        if not normalized:
            continue
        target = aliases.get(normalized)
        if target and target not in col_map:
            col_map[target] = idx

    missing: list[str] = []
    if "name" not in col_map:
        missing.append("Nome")
    if "phone" not in col_map:
        missing.append("Telefone")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Colunas obrigatórias ausentes na planilha: "
                + ", ".join(missing)
                + "."
            ),
        )

    return col_map


def parse_and_validate_excel(
    db: Session, filename: str | None, content: bytes
) -> ImportPreviewResponse:
    safe_name = validate_excel_upload(filename, content)

    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (InvalidFileException, BadZipFile, KeyError, ValueError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível ler a planilha. Verifique se o arquivo .xlsx não está corrompido.",
        ) from exc

    try:
        sheet = workbook.active
        if sheet is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A planilha não possui nenhuma aba válida.",
            )

        rows_iter = sheet.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A planilha está vazia e não possui colunas.",
            ) from exc

        col_map = _resolve_columns(header_row)

        existing_phones = set(db.scalars(select(Client.phone_normalized)).all())
        seen_phones_in_sheet: set[str] = set()
        parsed_rows: list[ImportRowPreview] = []

        for excel_row_num, raw_row in enumerate(rows_iter, start=2):
            row_values = list(raw_row)

            def get_val(key: str) -> object:
                idx = col_map.get(key)
                if idx is None or idx >= len(row_values):
                    return None
                return row_values[idx]

            raw_name = " ".join(_cell_to_clean_str(get_val("name")).split())
            raw_phone = _cell_to_clean_str(get_val("phone"))
            raw_address = _cell_to_clean_str(get_val("address")) or None
            raw_notes = _cell_to_clean_str(get_val("notes")) or None
            raw_opt_in = get_val("opt_in")

            # Ignora linhas totalmente em branco no final/meio da planilha
            if (
                not raw_name
                and not raw_phone
                and not raw_address
                and not raw_notes
                and (raw_opt_in is None or _cell_to_clean_str(raw_opt_in) == "")
            ):
                continue

            opt_in_bool, opt_in_error = _parse_opt_in(raw_opt_in)

            # Impede importação automática da linha de exemplo do modelo
            if (
                _EXAMPLE_NAME_MARKER in raw_name.lower()
                or (raw_notes and _EXAMPLE_NOTES_MARKER in raw_notes.lower())
            ):
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=None,
                        phone_formatted=None,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="error",
                        reason="Linha de exemplo do modelo (demonstração) ignorada automaticamente.",
                    )
                )
                continue

            if not raw_name:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name="",
                        phone_raw=raw_phone,
                        phone_normalized=None,
                        phone_formatted=None,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="error",
                        reason="Nome não informado.",
                    )
                )
                continue

            if len(raw_name) < 2:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=None,
                        phone_formatted=None,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="error",
                        reason="Nome deve ter pelo menos 2 caracteres.",
                    )
                )
                continue

            if not raw_phone:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw="",
                        phone_normalized=None,
                        phone_formatted=None,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="error",
                        reason="Telefone não informado.",
                    )
                )
                continue

            try:
                phone_normalized = normalize_phone(raw_phone)
                phone_formatted = format_phone(phone_normalized)
            except ValueError as exc:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=None,
                        phone_formatted=None,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="error",
                        reason=str(exc),
                    )
                )
                continue

            if opt_in_error:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=phone_normalized,
                        phone_formatted=phone_formatted,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=False,
                        status="error",
                        reason=opt_in_error,
                    )
                )
                continue

            if phone_normalized in existing_phones:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=phone_normalized,
                        phone_formatted=phone_formatted,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="duplicate",
                        reason="Telefone já cadastrado no sistema.",
                    )
                )
                continue

            if phone_normalized in seen_phones_in_sheet:
                parsed_rows.append(
                    ImportRowPreview(
                        row_number=excel_row_num,
                        name=raw_name,
                        phone_raw=raw_phone,
                        phone_normalized=phone_normalized,
                        phone_formatted=phone_formatted,
                        address=raw_address,
                        notes=raw_notes,
                        whatsapp_opt_in=opt_in_bool,
                        status="duplicate",
                        reason="Número duplicado dentro da própria planilha.",
                    )
                )
                continue

            seen_phones_in_sheet.add(phone_normalized)
            parsed_rows.append(
                ImportRowPreview(
                    row_number=excel_row_num,
                    name=raw_name,
                    phone_raw=raw_phone,
                    phone_normalized=phone_normalized,
                    phone_formatted=phone_formatted,
                    address=raw_address,
                    notes=raw_notes,
                    whatsapp_opt_in=opt_in_bool,
                    status="valid",
                    reason=None,
                )
            )
    finally:
        workbook.close()

    if not parsed_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A planilha não contém registros para importar.",
        )

    valid_count = sum(1 for r in parsed_rows if r.status == "valid")
    duplicate_count = sum(1 for r in parsed_rows if r.status == "duplicate")
    error_count = sum(1 for r in parsed_rows if r.status == "error")

    return ImportPreviewResponse(
        filename=safe_name,
        summary=ImportPreviewSummary(
            total_rows=len(parsed_rows),
            valid_count=valid_count,
            duplicate_count=duplicate_count,
            error_count=error_count,
        ),
        rows=parsed_rows,
    )


def confirm_client_import(
    db: Session, filename: str | None, content: bytes
) -> ImportConfirmResponse:
    preview = parse_and_validate_excel(db, filename, content)
    valid_rows = [r for r in preview.rows if r.status == "valid"]
    skipped_rows = [r for r in preview.rows if r.status != "valid"]

    new_clients: list[Client] = []
    try:
        for row in valid_rows:
            assert row.phone_normalized is not None
            client = Client(
                name=row.name,
                phone_normalized=row.phone_normalized,
                address=row.address,
                notes=row.notes,
                is_active=True,
                whatsapp_opt_in=row.whatsapp_opt_in,
                opt_out_at=None,
                is_demo=False,
            )
            db.add(client)
            new_clients.append(client)

        db.commit()
        for client in new_clients:
            db.refresh(client)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Ocorreu uma falha ao gravar os clientes no banco de dados. "
                "A operação foi revertida e nenhum registro foi alterado."
            ),
        ) from exc

    return ImportConfirmResponse(
        imported_count=len(new_clients),
        duplicate_count=preview.summary.duplicate_count,
        error_count=preview.summary.error_count,
        imported_clients=[to_client_response(c) for c in new_clients],
        skipped_rows=skipped_rows,
        message=(
            f"{len(new_clients)} cliente(s) importado(s) com sucesso."
            if new_clients
            else "Nenhum cliente válido foi importado."
        ),
    )

from __future__ import annotations

import re
from urllib.parse import quote


def normalize_phone(raw_phone: str) -> str:
    """Normaliza telefones brasileiros/internacionais para apenas dígitos com DDI."""
    digits = re.sub(r"\D", "", raw_phone or "")

    # Remove prefixo internacional 00 se informado
    if digits.startswith("00"):
        digits = digits[2:]

    # Remove 0 à esquerda comum em discagem nacional (ex: 011999990001)
    if len(digits) in (11, 12) and digits.startswith("0"):
        digits = digits[1:]

    # Telefone brasileiro sem DDI (DDD + 8 ou 9 dígitos)
    if len(digits) in (10, 11):
        digits = f"55{digits}"

    if len(digits) < 11 or len(digits) > 15:
        raise ValueError(
            "Telefone inválido. Informe DDD e número com 10 ou 11 dígitos (ex: (11) 99999-0001)."
        )

    if digits.startswith("55") and len(digits) not in (12, 13):
        raise ValueError(
            "Telefone brasileiro inválido. Informe DDI + DDD + número (ex: 5511999990001)."
        )

    return digits


def format_phone(phone_normalized: str) -> str:
    """Formata telefone normalizado para exibição amigável."""
    digits = re.sub(r"\D", "", phone_normalized or "")
    if digits.startswith("55") and len(digits) == 13:
        return f"+55 ({digits[2:4]}) {digits[4:9]}-{digits[9:]}"
    if digits.startswith("55") and len(digits) == 12:
        return f"+55 ({digits[2:4]}) {digits[4:8]}-{digits[8:]}"
    if digits:
        return f"+{digits}"
    return ""


def build_whatsapp_link(phone_normalized: str, message: str) -> str:
    """Gera link oficial wa.me com mensagem codificada."""
    encoded = quote(message or "", safe="")
    return f"https://wa.me/{phone_normalized}?text={encoded}"

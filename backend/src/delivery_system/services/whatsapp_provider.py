from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from uuid import uuid4

import httpx

from delivery_system.config import Settings


@dataclass(frozen=True)
class DispatchResult:
    success: bool
    status: str  # sent_simulated | sent_api | failed
    external_message_id: str | None = None
    error_message: str | None = None


class WhatsAppProvider(ABC):
    mode_name: str
    is_simulation: bool

    @abstractmethod
    def send_text_message(self, phone_normalized: str, message: str) -> DispatchResult:
        """Envia ou simula o envio de uma mensagem de texto pelo WhatsApp."""


class SimulatedWhatsAppProvider(WhatsAppProvider):
    """Provedor de simulação local: não realiza chamadas à Meta e registra como simulado."""

    mode_name = "simulation"
    is_simulation = True

    def send_text_message(self, phone_normalized: str, message: str) -> DispatchResult:
        if not phone_normalized or len(phone_normalized) < 11:
            return DispatchResult(
                success=False,
                status="failed",
                error_message="Número de telefone inválido para simulação.",
            )
        if not message.strip():
            return DispatchResult(
                success=False,
                status="failed",
                error_message="Mensagem vazia.",
            )
        simulated_id = f"sim_{uuid4().hex[:12]}"
        return DispatchResult(
            success=True,
            status="sent_simulated",
            external_message_id=simulated_id,
        )


class MetaCloudWhatsAppProvider(WhatsAppProvider):
    """
    Estrutura preparada para integração oficial com a WhatsApp Business Cloud API da Meta.

    Requer:
    - META_WHATSAPP_ACCESS_TOKEN
    - META_WHATSAPP_PHONE_NUMBER_ID
    - META_WHATSAPP_BUSINESS_ACCOUNT_ID (referência da conta empresarial)
    - META_WHATSAPP_WEBHOOK_VERIFY_TOKEN (para recebimento de status via webhook)
    """

    mode_name = "meta_cloud"
    is_simulation = False

    def __init__(self, settings: Settings) -> None:
        self.access_token = settings.meta_whatsapp_access_token.strip()
        self.phone_number_id = settings.meta_whatsapp_phone_number_id.strip()
        self.business_account_id = settings.meta_whatsapp_business_account_id.strip()
        self.api_version = settings.meta_whatsapp_api_version.strip() or "v21.0"

    def send_text_message(self, phone_normalized: str, message: str) -> DispatchResult:
        if not self.access_token or not self.phone_number_id:
            return DispatchResult(
                success=False,
                status="failed",
                error_message=(
                    "Credenciais da WhatsApp Business Cloud API (Meta) não configuradas."
                ),
            )

        endpoint = (
            f"https://graph.facebook.com/{self.api_version}/"
            f"{self.phone_number_id}/messages"
        )
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone_normalized,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(endpoint, json=payload, headers=headers)
            if response.status_code >= 400:
                return DispatchResult(
                    success=False,
                    status="failed",
                    error_message=f"Erro da API oficial Meta ({response.status_code}).",
                )
            data = response.json()
            messages = data.get("messages") or []
            message_id = messages[0].get("id") if messages else None
            return DispatchResult(
                success=True,
                status="sent_api",
                external_message_id=message_id,
            )
        except httpx.HTTPError as exc:
            return DispatchResult(
                success=False,
                status="failed",
                error_message=f"Falha de comunicação com a API da Meta: {exc}",
            )


def get_whatsapp_provider(settings: Settings) -> WhatsAppProvider:
    if settings.whatsapp_provider_mode == "meta_cloud" and settings.has_meta_credentials():
        return MetaCloudWhatsAppProvider(settings)
    return SimulatedWhatsAppProvider()

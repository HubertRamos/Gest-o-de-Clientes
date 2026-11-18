# Arquitetura do Sistema

## Visão Geral

- **Frontend (`frontend/`)**: Aplicação SPA em React, TypeScript, Vite e TanStack Query. Consome exclusivamente a API REST do backend.
- **Backend (`backend/src/delivery_system/`)**: API REST em Python com FastAPI, Pydantic para validação e SQLAlchemy 2 para persistência.
- **Camada de Banco de Dados (`database.py` + `alembic/`)**:
  - Controlada por `DATABASE_MODE` (`local` ou `supabase`) e `DATABASE_URL`.
  - Os mesmos modelos (`Client`, `MessageTemplate`, `Campaign`, `CampaignGroup`, `CampaignRecipient`) funcionam em SQLite e PostgreSQL.
- **Integração WhatsApp (`services/whatsapp_provider.py` + `api/webhooks.py`)**:
  - **Modo Manual**: gera links `https://wa.me/NUMERO?text=MENSAGEM` destinatário por destinatário. Abrir o link registra `whatsapp_opened` sem confirmar envio automaticamente; o operador confirma manualmente após enviar.
  - **Modo Automático**: abstraído pela interface `WhatsAppProvider`. Enquanto não há credenciais da Meta, usa `SimulatedWhatsAppProvider`, que registra `sent_simulated` sem chamadas externas. Quando configurado com `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID` e `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, utiliza `MetaCloudWhatsAppProvider` e o endpoint `/api/webhooks/whatsapp`.

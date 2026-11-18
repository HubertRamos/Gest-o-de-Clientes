# Guia de Deploy na Vercel — DeliverySystem

O projeto está preparado para deploy completo (Frontend Vite + Backend FastAPI Serverless) diretamente a partir da **raiz do repositório** na Vercel.

---

## 1. Arquitetura do deploy na Vercel

- **Frontend estático (`dist/`)**: construído via `npm run build` com o `vite.config.ts` da raiz (que aponta para `frontend/src`).
- **Backend Python Serverless (`/api/index.py`)**: exporta a aplicação FastAPI (`backend/src/delivery_system/main.py`) usando as dependências de `requirements.txt` na raiz.
- **Roteamento (`vercel.json`)**:
  - Requisições para `/api/*` são encaminhadas para `/api/index.py`.
  - Demais rotas são redirecionadas para `/index.html` (SPA React).
  - Por rodarem na mesma origem, não há necessidade de proxy extra nem configuração manual de CORS.

---

## 2. Variáveis de ambiente obrigatórias na Vercel

No painel do projeto na Vercel (**Settings → Environment Variables**), configure:

### Para persistência real (Recomendado — PostgreSQL no Supabase)

```env
DATABASE_MODE=supabase
DATABASE_URL=postgresql+psycopg://postgres.[SEU_PROJETO]:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

> **Dica**: Mesmo se você colar a URI padrão do Supabase começando com `postgres://` ou `postgresql://`, o backend converte automaticamente para `postgresql+psycopg://` e desativa o pool persistente (`NullPool`) no ambiente serverless da Vercel para evitar conexões ociosas com o Transaction Pooler (porta `6543`).

### Modo de demonstração sem banco externo (`DATABASE_MODE=local`)

Se `DATABASE_MODE` não for configurado (ou estiver como `local`), o backend detecta `VERCEL=1` e grava o SQLite em `/tmp/delivery_system.db` para evitar erro de sistema de arquivos somente leitura.

> **Atenção**: o diretório `/tmp` na Vercel é **efêmero** — os dados podem ser apagados entre execuções serverless (cold starts). Para uso real com dados persistentes, utilize `DATABASE_MODE=supabase`.

### Variáveis opcionais do WhatsApp

Por padrão, o modo de simulação vem ativado:

```env
WHATSAPP_PROVIDER_MODE=simulation
```

Quando possuir credenciais oficiais da Meta Cloud API:

```env
WHATSAPP_PROVIDER_MODE=meta_cloud
META_WHATSAPP_ACCESS_TOKEN=...
META_WHATSAPP_PHONE_NUMBER_ID=...
META_WHATSAPP_BUSINESS_ACCOUNT_ID=...
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
META_WHATSAPP_API_VERSION=v21.0
```

---

## 3. Passo a passo para publicar

1. **Prepare o banco no Supabase** (se for usar persistência):
   - Crie o projeto no Supabase e copie a connection string do **Transaction Pooler** (porta `6543`).
   - Opcionalmente, rode as migrações a partir da pasta `backend/` antes do primeiro acesso:
     ```bash
     cd backend
     DATABASE_MODE=supabase DATABASE_URL="postgresql+psycopg://..." alembic upgrade head
     ```
   - *(O entrypoint `/api/index.py` também executa `init_db()` na inicialização caso alguma tabela ainda não exista.)*

2. **Importe o repositório na Vercel**:
   - Mantenha o **Root Directory** como a raiz do repositório (`.`).
   - A Vercel lerá automaticamente `vercel.json` e `requirements.txt`.
   - Cadastre as variáveis de ambiente acima.
   - Clique em **Deploy**.

3. **Verifique após o deploy**:
   - Acesse `https://seu-projeto.vercel.app/api/health` e confirme `"status": "ok"`.
   - Acesse `https://seu-projeto.vercel.app` para abrir o painel do sistema.

---

## 4. Opção alternativa: deploy somente do Frontend (`frontend/`)

Caso prefira hospedar apenas a interface React na Vercel conectada a um backend FastAPI hospedado em outro servidor:

1. Defina **Root Directory** na Vercel como `frontend`.
2. A Vercel usará `frontend/vercel.json` (fallback SPA).
3. Configure a variável de ambiente:
   ```env
   VITE_API_BASE_URL=https://sua-api.exemplo.com/api
   ```
4. No backend externo, adicione o domínio da Vercel em `CORS_ORIGINS`.

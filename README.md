# Sistema de Gestão de Clientes e Comunicação para Entregador

Protótipo funcional para gestão de clientes, modelos de mensagens personalizadas (`{{nome}}`), campanhas gerais ou segmentadas e acompanhamento de envios pelo WhatsApp.

## Tecnologias utilizadas

- **Frontend**: React, TypeScript, Vite, TanStack Query, Tailwind CSS
- **Backend**: Python, FastAPI, SQLAlchemy 2, Pydantic, Alembic
- **Banco de dados**: SQLite (desenvolvimento local) com troca preparada por variável de ambiente para PostgreSQL (Supabase)

## Requisitos necessários

- Python 3.10 ou superior
- Node.js 20 ou superior (e `npm`)

## 1. Configuração e execução do Backend (FastAPI)

Entre na pasta `backend/`:

```bash
cd backend
```

Crie e ative um ambiente virtual Python:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Instale as dependências:

```bash
pip install -e ".[dev]"
```

Configure o arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

A configuração inicial já vem pronta para uso local com SQLite:

```env
DATABASE_MODE=local
DATABASE_URL=sqlite:///./data/delivery_system.db
```

Aplique as migrações do banco (opcional, pois a inicialização também garante a criação das tabelas):

```bash
alembic upgrade head
```

Inicie o servidor FastAPI na porta `8000`:

```bash
PYTHONPATH=src uvicorn delivery_system.main:app --reload --host 0.0.0.0 --port 8000
```

- **Backend API**: http://localhost:8000
- **Documentação interativa (`/docs`)**: http://localhost:8000/docs

## 2. Configuração e execução do Frontend (Vite + React)

Em outro terminal, entre na pasta `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

- **Frontend**: http://localhost:5173

O Vite está configurado para redirecionar automaticamente chamadas `/api/*` para `http://localhost:8000`.

## 3. Testes automatizados do Backend

Na pasta `backend/`:

```bash
pytest -v
```

## 4. Dados de demonstração

Na própria interface (no **Painel inicial** ou na aba **Clientes**), clique em **Carregar dados de demonstração** para inserir clientes fictícios (com números de teste `90000-10xx`), modelos de mensagens e campanhas de exemplo. Todos os registros fictícios são identificados claramente como demonstração.

## 5. Troca para PostgreSQL (Supabase) no futuro

Consulte [`infrastructure/supabase_setup.md`](infrastructure/supabase_setup.md) para trocar `DATABASE_MODE=local` para `DATABASE_MODE=supabase` usando apenas variáveis de ambiente e `alembic upgrade head`.

## 6. Modo Automático (Simulação e API Oficial da Meta)

Por padrão, `WHATSAPP_PROVIDER_MODE=simulation` está ativo no backend. Nesse modo, campanhas configuradas como automáticas simulam o envio sem fazer chamadas externas e exibem claramente que nenhuma mensagem real foi enviada. Quando você possuir uma conta oficial da Meta, basta preencher as variáveis `META_WHATSAPP_*` no `backend/.env`.

## 7. Deploy na Vercel

O repositório já inclui `vercel.json`, `api/index.py` e `requirements.txt` configurados na raiz para deploy completo (Frontend Vite + Backend FastAPI Serverless). Veja o passo a passo e as variáveis recomendadas (incluindo `DATABASE_MODE=supabase`) em [`docs/vercel_deploy.md`](docs/vercel_deploy.md).


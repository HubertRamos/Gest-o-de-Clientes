# Preparação para PostgreSQL (Supabase)

O sistema inicia configurado para SQLite local (`DATABASE_MODE=local`). Para migrar o armazenamento futuro para o PostgreSQL hospedado no Supabase, sem alterar nenhuma regra de negócio ou código das funcionalidades:

1. Crie um projeto no Supabase e obtenha a string de conexão PostgreSQL (URI).
2. Edite o arquivo `backend/.env` (nunca envie senhas para o Git):

```env
DATABASE_MODE=supabase
DATABASE_URL=postgresql+psycopg://postgres.[SEU_PROJETO]:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

3. Aplique a estrutura de tabelas usando o Alembic a partir da pasta `backend/`:

```bash
alembic upgrade head
```

4. Reinicie o servidor FastAPI. Todos os endpoints e modelos do SQLAlchemy passam a operar automaticamente sobre o PostgreSQL do Supabase.

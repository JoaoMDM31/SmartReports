# Deploy

Para acessar pela web sem abrir servidor local, veja tambem [Publicacao no GitHub e acesso pela web](github-web-deploy.md). O GitHub Pages hospeda o frontend, mas o backend FastAPI precisa de um host proprio.

## Docker Compose

1. Copie `.env.example` para `.env`.
2. Altere `JWT_SECRET_KEY`, credenciais do banco e `ALLOWED_ORIGINS`.
3. Execute:

```bash
docker compose up --build -d
```

Servicos:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Variaveis importantes

- `DATABASE_URL`: conexao SQLAlchemy com PostgreSQL.
- `REDIS_URL`: cache de analises por hash do arquivo.
- `JWT_SECRET_KEY`: segredo de assinatura dos tokens. Use valor longo e aleatorio.
- `ALLOWED_ORIGINS`: dominios liberados no CORS.
- `MAX_UPLOAD_MB`: limite de upload por arquivo.
- `VITE_API_URL`: URL publica da API usada pelo frontend.

## Producao SaaS

Recomendado:

- Usar HTTPS no balanceador ou proxy reverso.
- Desabilitar `AUTO_CREATE_TABLES` e usar Alembic para migracoes.
- Armazenar uploads originais em S3, Azure Blob ou GCS quando houver auditoria.
- Separar ambientes de staging e producao.
- Configurar backups automaticos do PostgreSQL.
- Ativar observabilidade com logs estruturados, traces e metricas.
- Isolar clientes por `tenant_id` quando o modo multiempresa for habilitado.

## Versao customizada

Para clientes enterprise:

- Criar tema visual por marca.
- Conectar SSO/SAML/OIDC.
- Configurar templates de PDF por departamento.
- Criar conectores com SharePoint, Google Drive, ERPs ou CRMs.
- Hospedar em infraestrutura do cliente quando necessario.

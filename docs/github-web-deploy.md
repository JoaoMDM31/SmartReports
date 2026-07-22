# Publicacao no GitHub e acesso pela web

Este projeto tem frontend React e backend FastAPI. Para acessar o SmartReports pela web sem abrir o servidor local, voce precisa publicar duas partes:

1. Frontend estatico no GitHub Pages.
2. Backend FastAPI em um host sempre ligado, como Render, Railway, Fly.io, VPS ou outro provedor Docker.

O GitHub Pages sozinho nao executa Python/FastAPI, PostgreSQL ou Redis. Ele publica apenas arquivos estaticos do frontend.

## 1. Criar repositorio no GitHub

Instale e autentique o GitHub CLI:

```bash
gh auth login
```

Na pasta do projeto:

```bash
git init
git add .
git commit -m "Prepare SmartReports for GitHub deployment"
gh repo create SmartReports --private --source=. --remote=origin --push
```

Se preferir repositorio publico, troque `--private` por `--public`.

## 2. Ativar GitHub Pages

No repositorio do GitHub:

1. Abra `Settings`.
2. Abra `Pages`.
3. Em `Build and deployment`, escolha `GitHub Actions`.

O workflow `.github/workflows/frontend-pages.yml` vai publicar o frontend automaticamente em:

```text
https://SEU_USUARIO.github.io/SmartReports/
```

## 3. Publicar o backend

Hospede o backend usando Docker a partir da pasta `backend/`.

Variaveis obrigatorias no provedor:

```text
APP_NAME=SmartReports
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg2://USUARIO:SENHA@HOST:PORTA/BANCO
REDIS_URL=redis://HOST:PORTA/0
JWT_SECRET_KEY=use-um-segredo-longo-e-aleatorio
ALLOWED_ORIGINS=https://SEU_USUARIO.github.io
MAX_UPLOAD_MB=25
```

A API publica deve expor:

```text
https://SUA_API_PUBLICA/api/health
https://SUA_API_PUBLICA/api/docs
```

## 4. Conectar frontend publico na API publica

No GitHub:

1. Abra `Settings`.
2. Abra `Secrets and variables`.
3. Abra `Actions`.
4. Crie uma `Repository variable` chamada `VITE_API_URL`.
5. Valor:

```text
https://SUA_API_PUBLICA/api
```

Depois rode o workflow `Frontend GitHub Pages` manualmente ou faca um novo push na branch principal.

## 5. Publicar imagens Docker no GitHub Container Registry

O workflow `.github/workflows/publish-containers.yml` publica imagens em:

```text
ghcr.io/SEU_USUARIO/smartreports-backend:latest
ghcr.io/SEU_USUARIO/smartreports-frontend:latest
```

Ele roda manualmente pelo GitHub Actions ou quando voce criar tags como:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Checklist de producao

- Trocar `JWT_SECRET_KEY`.
- Usar PostgreSQL gerenciado com backup.
- Usar Redis gerenciado ou cache equivalente.
- Configurar `ALLOWED_ORIGINS` com o dominio real do frontend.
- Configurar HTTPS no backend.
- Testar login, upload, PDF e chat depois do deploy.

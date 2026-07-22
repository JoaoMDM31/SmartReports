from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import auth, dashboard, health, reports
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.logging import configure_logging, get_logger
from app.core.middleware import InMemoryRateLimitMiddleware, RequestContextMiddleware


logger = get_logger(__name__)


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        description="Transforme planilhas em dashboards e relatorios profissionais automaticamente.",
        version=settings.app_version,
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url=f"{settings.api_prefix}/docs",
    )

    app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_minimum_size)
    app.add_middleware(InMemoryRateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_exception",
            extra={"method": request.method, "path": request.url.path},
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno inesperado. O time tecnico ja tem contexto para investigar."},
        )

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(reports.router, prefix=settings.api_prefix)
    app.include_router(dashboard.router, prefix=settings.api_prefix)

    return app


app = create_app()

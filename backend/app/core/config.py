from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "SmartReports"
    app_version: str = "1.1.0"
    environment: str = "development"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./smartreports.db"
    redis_url: str | None = None
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    allowed_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    auto_create_tables: bool = True
    max_upload_mb: int = 25
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    gzip_minimum_size: int = 1000
    allowed_upload_extensions: list[str] = [".xlsx", ".xlsm", ".xls", ".csv"]
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-sol"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_request_timeout_seconds: int = 30
    openai_max_context_chars: int = 12000
    openai_max_output_tokens: int = 1200
    openai_reasoning_effort: str | None = "low"

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

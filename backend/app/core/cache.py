import hashlib
import json
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings


def get_redis_client() -> Redis | None:
    settings = get_settings()
    if not settings.redis_url:
        return None
    try:
        return Redis.from_url(settings.redis_url, decode_responses=True)
    except RedisError:
        return None


def make_file_cache_key(file_bytes: bytes) -> str:
    digest = hashlib.sha256(file_bytes).hexdigest()
    return f"spreadsheet-analysis:{digest}"


def read_json_cache(key: str) -> dict[str, Any] | None:
    client = get_redis_client()
    if client is None:
        return None
    try:
        cached = client.get(key)
        return json.loads(cached) if cached else None
    except (RedisError, json.JSONDecodeError):
        return None


def write_json_cache(key: str, value: dict[str, Any], ttl_seconds: int = 3600) -> None:
    client = get_redis_client()
    if client is None:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except RedisError:
        return

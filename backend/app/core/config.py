from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Personal Finance Dashboard"
    database_url: str = "postgresql+asyncpg://finance:postgres@localhost:5432/finance"
    app_timezone: str = "America/Los_Angeles"

    # Optional AI / CLIProxyAPI / MCP env vars (configured via Docker environment)
    ai_api_base_url: str = ""
    ai_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash-high"
    mcp_bearer_token: str = ""

    # Static SPA bundle location (built into /app/static in Docker, or ../frontend/dist locally)
    static_dir: str = ""

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.app_timezone)

    @property
    def effective_ai_key(self) -> str:
        return (self.ai_api_key or self.gemini_api_key or "").strip()

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.effective_ai_key)

    @property
    def ai_provider_label(self) -> str:
        return "CLIProxyAPI" if self.ai_api_base_url.strip() else "Google Gemini"

    def resolve_static_dir(self) -> Path | None:
        if self.static_dir:
            p = Path(self.static_dir)
            if p.is_dir():
                return p
        candidates = [
            Path("/app/static"),
            Path(__file__).resolve().parents[3] / "frontend" / "dist",
        ]
        for c in candidates:
            if c.is_dir() and (c / "index.html").is_file():
                return c
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()

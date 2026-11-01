from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost:5432/protein_table"
    # The browser reaches the API through the frontend's own origin (Vite proxy), so no
    # cross-origin access is needed. Add origins here only if the frontend is hosted elsewhere.
    cors_origins: list[str] = []
    # Host headers the API answers to; anything else is refused (blocks DNS-rebinding attacks).
    allowed_hosts: list[str] = ["localhost", "127.0.0.1"]
    # Interactive docs (/docs, /redoc, /openapi.json) list every endpoint, so they're off by
    # default. Set ENABLE_DOCS=true in backend/.env while developing to turn them on.
    enable_docs: bool = False
    # Requests per minute allowed from one client before it gets HTTP 429.
    rate_limit_per_minute: int = 300


settings = Settings()

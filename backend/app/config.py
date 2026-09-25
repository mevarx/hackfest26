from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models import SessionSource


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_path: Path = Path("data/reroute.db")
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    use_mock_hana: bool = True
    use_mock_genai: bool = True
    ghost_twin_threshold: int = Field(default=5, ge=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def session_source(settings: Settings) -> SessionSource:
    if settings.use_mock_hana or settings.use_mock_genai:
        return "simulated"
    return "local"

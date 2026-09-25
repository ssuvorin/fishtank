"""Application settings — loaded from backend/.env via pydantic-settings (T002)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_JEV_MODEL: str = "~typesafe/jev-latest"
    OPENROUTER_VAR_MODEL: str = "~openai/gpt-sol-latest"
    CORS_ORIGINS: str = "http://localhost:5173"
    LAW_JSON_PATH: str = ""
    # ElevenLabs voice for the executive briefing. Empty key → feature off
    # (GET /api/v1/briefing/voice reports enabled=false; UI hides the player).
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "onwK4e9ZLuTAKqWW03F9"  # "Daniel — Steady Broadcaster"
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"
    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./spendlyzer.db"
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_jwt_secret: str = ""
    cors_origins: str = "http://localhost:3000"
    default_currency: str = "INR"
    model_dir: str = "./model_store"

    # ML reliability gates
    classifier_min_samples: int = 30
    classifier_min_macro_f1: float = 0.70
    classifier_min_confidence: float = 0.50
    anomaly_min_samples: int = 30
    forecast_min_months: int = 3
    forecast_max_reliable_mape: float = 0.25

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

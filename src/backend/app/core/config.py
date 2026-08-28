"""환경변수를 읽는 유일한 곳. 다른 모듈은 이 Settings 인스턴스를 import한다.

os.environ을 여기 말고 다른 파일에서 직접 읽지 않는다 — 무엇이 필요한지
한눈에 안 보이게 되기 때문이다.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://app:app@localhost:5432/univoice"
    redis_url: str = "redis://localhost:6379/0"

    llm_model_id: str = "global.anthropic.claude-sonnet-5"
    """대회에서 허용 모델이 바뀌거나 더 싼 모델로 내릴 수 있으므로 하드코딩하지 않는다."""

    login_session_ttl_seconds: int = 60 * 60 * 24
    """로그인 세션 TTL. 요청마다 연장된다(sliding) — auth_service.login이 매 조회 시 연장."""

    turn_lock_ttl_seconds: int = 30
    compact_lock_ttl_seconds: int = 60

    port: int = 8501

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

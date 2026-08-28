"""session/ — Redis가 사는 곳.

Redis 클라이언트는 이 모듈에서 한 번 만들어 프로세스 안에서 공유한다.
키 문자열은 이 패키지 밖에 등장하지 않는다 (README.md 규칙).
"""
from typing import Optional

import redis

from app.core.config import get_settings

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """프로세스당 하나의 동기 Redis 클라이언트를 게으르게 생성해 재사용한다.

    decode_responses=True 로 두어 조회 결과가 str로 나온다 —
    각 모듈이 bytes 디코딩을 반복하지 않게 한다.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _client

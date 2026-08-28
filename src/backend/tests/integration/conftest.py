"""integration 픽스처. 실제 PostgreSQL·Redis가 도달 가능할 때만 돈다.

DB/Redis가 없으면 (해커톤 CI가 아직 안 붙은 상태) 모듈 전체를 skip 한다 —
단위 테스트는 실서버 없이 이미 로직을 검증하므로, integration은 붙은 환경에서만 판정한다.
"""
import socket

import pytest

from app.core.config import get_settings


def _reachable(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def _pg_reachable() -> bool:
    # database_url: postgresql://user:pw@host:port/db
    import re

    m = re.search(r"@([^:/]+):(\d+)", get_settings().database_url)
    if not m:
        return _reachable("localhost", 5432)
    return _reachable(m.group(1), int(m.group(2)))


@pytest.fixture(scope="session", autouse=True)
def _require_services():
    if not _pg_reachable():
        pytest.skip("PostgreSQL 도달 불가 — integration 테스트를 건너뜁니다.")


@pytest.fixture()
def conn():
    """트랜잭션 하나를 열고 테스트 후 롤백해 DB를 더럽히지 않는다."""
    from app.repo.pool import get_pool

    pool = get_pool()
    with pool.connection() as c:
        tx = c.transaction()
        tx.__enter__()
        try:
            yield c
        finally:
            # 강제 롤백: 예외를 던져 트랜잭션 컨텍스트가 되돌리게 한다.
            try:
                tx.__exit__(RuntimeError, RuntimeError("rollback"), None)
            except RuntimeError:
                pass

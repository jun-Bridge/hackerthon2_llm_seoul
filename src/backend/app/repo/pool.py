"""PostgreSQL 커넥션 풀. 워커마다 하나씩 가진다.

풀 크기 × 워커 수가 PostgreSQL max_connections를 넘지 않게 잡는다 (docs/backend-design.md §6 참고).

psycopg 3 + psycopg_pool.ConnectionPool 을 쓴다. repo 계층이 raw SQL을 직접 쥐는 설계라
ORM을 얹지 않는다. 파라미터는 %s 바인딩만 쓰고, f-string으로 값을 넣지 않는다 (SQL 인젝션).
"""
from contextlib import contextmanager
from typing import Iterator, Optional

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.config import get_settings

_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    """프로세스당 하나의 풀을 게으르게(lazy) 생성해 재사용한다.

    main.py의 lifespan에서 한 번 호출해 미리 열어두는 것을 권장하지만,
    repo 함수가 직접 호출해도 같은 인스턴스를 돌려준다.

    커넥션은 dict_row로 설정해 모든 조회가 dict를 돌려주게 한다 —
    repo 함수들의 반환 계약({"id": ..., ...})이 여기에 의존한다.
    """
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


def close_pool() -> None:
    """앱 종료(lifespan shutdown) 시 풀을 닫는다."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def transaction(pool: Optional[ConnectionPool] = None) -> Iterator:
    """트랜잭션 컨텍스트. with transaction() as conn: ... 형태로 쓴다.

    services/ 가 여러 repo 함수를 하나의 트랜잭션으로 묶을 때 이걸 쓴다.
    (예: hold_complaint의 상태 전환 + 코멘트 삽입, submit의 4단계)
    repo/ 의 개별 함수는 이 conn을 받기만 하고 스스로 commit하지 않는다.

    블록이 정상 종료되면 commit, 예외가 나면 rollback 후 그 예외를 그대로 올린다.
    pool 인자를 생략하면 get_pool()의 프로세스 공용 풀을 쓴다.
    """
    if pool is None:
        pool = get_pool()
    with pool.connection() as conn:
        # psycopg의 connection 컨텍스트가 블록 종료 시 자동 commit,
        # 예외 발생 시 자동 rollback 한다. 명시적 트랜잭션 경계로 감싼다.
        with conn.transaction():
            yield conn

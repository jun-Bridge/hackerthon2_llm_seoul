"""PostgreSQL 커넥션 풀. 워커마다 하나씩 가진다.

풀 크기 × 워커 수가 PostgreSQL max_connections를 넘지 않게 잡는다 (docs/backend-design.md §6 참고).
"""
from contextlib import contextmanager
from typing import Iterator


def get_pool():
    """앱 시작 시 한 번 생성. main.py의 lifespan에서 호출.

    구현 시 psycopg_pool.ConnectionPool(settings.database_url) 반환.
    """
    raise NotImplementedError


@contextmanager
def transaction(pool) -> Iterator:
    """트랜잭션 컨텍스트. with transaction(pool) as conn: ... 형태로 쓴다.

    services/ 가 여러 repo 함수를 하나의 트랜잭션으로 묶을 때 이걸 쓴다.
    (예: hold_complaint의 상태 전환 + 코멘트 삽입, submit의 4단계)
    repo/ 의 개별 함수는 이 conn을 받기만 하고 스스로 commit하지 않는다.
    """
    raise NotImplementedError

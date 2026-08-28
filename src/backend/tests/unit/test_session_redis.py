"""session/ (Redis) 계층 단위 테스트 — fakeredis로 실서버 없이 검증.

roadmap-B 단계 3 "완료 기준":
- 로그인 세션 넣고 get이 TTL을 연장하는지
- 잠금이 두 번째 acquire에서 False인지
- chip_state.bump_if_same 반복 카운트
"""
import fakeredis
import pytest

import app.session as session_pkg
from app.session import login_session, turn_lock, compact_lock, chip_state


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    """모든 session 모듈이 쓰는 get_redis()를 fakeredis로 교체한다.

    각 모듈이 `from app.session import get_redis`로 이름을 자기 네임스페이스에
    바인딩했으므로, 패키지뿐 아니라 각 모듈의 get_redis도 함께 교체한다.
    """
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    provider = lambda: client
    monkeypatch.setattr(session_pkg, "get_redis", provider)
    for mod in (login_session, turn_lock, compact_lock, chip_state):
        monkeypatch.setattr(mod, "get_redis", provider)
    return client


def test_login_session_roundtrip():
    sid = login_session.create(user_id=7, school_id=3, role="student")
    assert isinstance(sid, str) and len(sid) > 20  # 추측 불가능한 길이

    data = login_session.get(sid)
    assert data == {"user_id": 7, "school_id": 3, "role": "student"}

    login_session.delete(sid)
    assert login_session.get(sid) is None


def test_login_session_get_extends_ttl(fake_redis):
    sid = login_session.create(user_id=1, school_id=1, role="admin")
    key = f"sess:{sid}"
    # TTL을 인위적으로 낮춘 뒤 get이 다시 늘리는지 확인.
    fake_redis.expire(key, 5)
    assert fake_redis.ttl(key) <= 5
    login_session.get(sid)
    assert fake_redis.ttl(key) > 5  # sliding 연장됨


def test_login_session_missing_returns_none():
    assert login_session.get("does-not-exist") is None
    assert login_session.get("") is None


def test_turn_lock_second_acquire_fails():
    assert turn_lock.acquire(42) is True
    assert turn_lock.acquire(42) is False  # 이미 잠김
    turn_lock.release(42)
    assert turn_lock.acquire(42) is True  # 해제 후 다시 가능


def test_compact_lock_second_acquire_fails():
    assert compact_lock.acquire(9) is True
    assert compact_lock.acquire(9) is False
    compact_lock.release(9)
    assert compact_lock.acquire(9) is True


def test_chip_state_bump_same_and_reset():
    # 같은 단계 반복 → 카운트 증가
    assert chip_state.bump_if_same(1, "location") == 1
    assert chip_state.bump_if_same(1, "location") == 2
    assert chip_state.bump_if_same(1, "location") == 3
    # 다른 단계로 바뀌면 1로 리셋
    assert chip_state.bump_if_same(1, "detail") == 1
    state = chip_state.get_state(1)
    assert state == {"step": "detail", "repeat_count": 1}


def test_chip_state_missing_returns_none():
    assert chip_state.get_state(999) is None

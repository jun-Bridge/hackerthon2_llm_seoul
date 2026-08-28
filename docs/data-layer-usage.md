# 데이터 계층(B) 사용법 — 서비스가 pool·repo를 부르는 방법

_2026-08-28 · 대상: A(auth_service)·C(session/complaint_service)_

**서비스가 B의 `repo`/`session`을 어떻게 부르는지**를 한곳에 정리한 문서다.
"pool을 어떻게 얻나", "트랜잭션은 누가 잡나" 같은 질문의 정답.

- 함수 시그니처(계약)는 `app/INTERFACES.md`와 각 스텁.
- 트랜잭션 경계·격리 근거는 `docs/backend-design.md` §3~§5.
- 이 문서는 **호출 패턴**만 다룬다.

---

## 0. 한 줄 답

> **`get_pool()`을 직접 부를 필요 없다. `with pool.transaction() as conn:` 안에서
> repo 함수에 `conn`을 넘겨라.** commit/rollback은 `with` 블록이 자동으로 한다.

`app.state` 주입도, DI도 쓰지 않는다. pool은 **모듈 전역 싱글턴**이다.

---

## 1. pool은 어떻게 얻나

**둘 다 아니다 — 대개 직접 얻을 필요가 없다.**

| 방법 | 되나? | 설명 |
|---|---|---|
| `get_pool()`을 매번 호출 | ✅ 되지만 불필요 | 캐시된 싱글턴(`_pool` 전역)이라 비용 0. 처음 한 번만 생성 |
| `app.state`로 주입 | ❌ 아님 | 이 프로젝트는 DI를 안 쓴다 |
| `with pool.transaction() as conn` | ✅ **이걸 쓴다** | pool 인자를 생략하면 내부에서 `get_pool()`을 자동 호출 |

`get_pool()`은 프로세스(=uvicorn 워커)당 하나의 `ConnectionPool`을 게으르게 만들어
재사용한다. 여러 번 불러도 같은 인스턴스를 돌려주므로 "매번 부르면 새로 생기나?" 걱정은 없다.

```python
# app/repo/pool.py — 요지
_pool = None
def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(..., open=True)   # 최초 1회만
    return _pool
```

---

## 2. 서비스가 쓰는 표준 패턴

`repo` 함수는 **첫 인자로 `conn`을 받는다** (pool이 아니다). 트랜잭션 경계는 **서비스가**
`transaction()`으로 잡고, 그 안에서 repo에 `conn`을 넘긴다. commit은 `with` 블록이 한다.

### 2.1 여러 repo를 한 트랜잭션으로 (쓰기·전이)

```python
from app.repo import pool, school_repo, user_repo

def signup(email: str, password: str, admin_code: str | None):
    domain = school_repo.normalize_domain(email)   # 소문자·@뒤·공백 정규화
    with pool.transaction() as conn:               # ← pool 인자 없이
        school = school_repo.find_by_domain(conn, domain)
        if school is None:
            raise UnsupportedDomainError("지원하지 않는 학교입니다.")
        role = _decide_role(conn, school["id"], admin_code)
        user_id = user_repo.create(conn, school["id"], email, _hash(password), role)
    # 블록 정상 종료 → commit / 예외 → rollback (둘 다 자동)
    return user_id, role
```

### 2.2 단발 조회 (읽기)

읽기도 같은 패턴으로 통일한다.

```python
def list_schools():
    with pool.transaction() as conn:
        return school_repo.list_all(conn)
```

> 트랜잭션 없이 커넥션만 빌리고 싶으면 `with pool.get_pool().connection() as conn:` 도
> 되지만, **일관성을 위해 `transaction()` 하나로 통일**하길 권한다. 읽기 전용이어도 무해하다.

---

## 3. 트랜잭션 경계 규칙 (중요)

| 규칙 | 이유 |
|---|---|
| **`repo` 함수는 스스로 commit하지 않는다** | 여러 개를 한 트랜잭션으로 묶을 수 있어야 한다 |
| **경계는 서비스가 `transaction()`으로 잡는다** | commit/rollback 책임이 한곳에 |
| **`with` 블록 안에서만 `conn`을 쓴다** | 블록을 벗어난 conn은 이미 반납됨 |
| **LLM 호출 중에는 conn을 붙들지 않는다** | Bedrock이 수 초 → 풀이 마른다. `저장 → 반납 → LLM → 다시 얻어 저장` (backend-design §7-2.2) |

예 — 보류는 상태 전이 + 코멘트가 **한 트랜잭션**이어야 한다(사유 없는 보류 방지):

```python
def hold(complaint_id, school_id, admin_id, reason):
    if not reason.strip():
        raise HoldReasonRequiredError()          # DB 부르기 전에 거른다
    with pool.transaction() as conn:
        if not complaint_repo.hold(conn, complaint_id, school_id):
            raise InvalidTransitionError()        # 0행 → 롤백
        comment_repo.add(conn, complaint_id, admin_id, reason, is_hold_reason=True)
```

---

## 4. lifespan에서 미리 열기 (A가 결정, 권장)

`get_pool()`은 lazy라 첫 요청이 풀 생성 비용(~수십 ms)을 뒤집어쓴다. `main.py`(A 소유)
lifespan에서 startup에 한 번 열어두면 그 지연이 사라진다. **안 넣어도 동작은 한다.**

```python
# app/main.py
from contextlib import asynccontextmanager
from app.repo.pool import get_pool, close_pool

@asynccontextmanager
async def lifespan(app):
    get_pool()      # startup: 풀 미리 염
    yield
    close_pool()    # shutdown: 풀 닫음

app = FastAPI(title="UniVoice", lifespan=lifespan)
```

`close_pool()`은 B가 제공하는 종료 헬퍼다.

---

## 5. Redis(session/)도 같은 방식

`session/`의 함수들(`login_session`·`turn_lock`·`compact_lock`·`chip_state`)은
**커넥션을 넘길 필요가 없다.** 내부에서 프로세스 공용 Redis 클라이언트(`get_redis()`)를
알아서 쓴다. 서비스는 그냥 부르면 된다.

```python
from app.session import login_session, turn_lock

sid = login_session.create(user_id, school_id, role)   # → 쿠키에 실을 값
data = login_session.get(sid)                           # {user_id, school_id, role} 또는 None (+sliding TTL)

if not turn_lock.acquire(session_id):                   # SET NX
    raise TurnInProgressError()
try:
    ...
finally:
    turn_lock.release(session_id)                       # 실패로 끝나도 반드시
```

---

## 6. 자주 하는 질문

**Q. `get_pool()`을 매번 부르면 커넥션이 계속 생기나?**
아니다. 풀 자체가 싱글턴이고, 커넥션은 `with ... as conn` 블록이 끝나면 풀로 **반납**된다.

**Q. 서비스가 pool을 인자로 들고 다녀야 하나?**
아니다. `transaction()`이 알아서 `get_pool()`을 부른다. 테스트에서 다른 풀을 주입하고
싶을 때만 `transaction(pool=...)`로 넘긴다 (그것 때문에 인자가 선택적으로 열려 있다).

**Q. repo 함수에 `school_id`를 왜 매번 넘기나?**
학교 격리를 repo 계층에서 강제하기 위해서다(불변식 #1). 세션에서 꺼낸 `school_id`를
그대로 넘긴다 — 안 넘기면 함수 호출 자체가 안 된다.

**Q. 조회 결과 형태는?**
커넥션이 `dict_row`라 모든 조회가 `dict`(또는 `list[dict]`)를 돌려준다.
`row["id"]`처럼 키로 접근한다.

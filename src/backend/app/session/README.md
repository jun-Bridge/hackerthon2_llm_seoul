# session/ — Redis가 사는 곳

**Redis 키 문자열은 이 폴더 밖에 등장하지 않는다.** 키 이름이 흩어지면 지울 때 하나를 빠뜨린다.

여기 들어가는 것은 전부 **잃어도 되는 것**뿐이다 — 로그인 세션(다시 로그인하면 됨), 턴/압축 잠금(다음 턴에 정리됨), 칩 캐시(DB에 정본이 있음). 민원·대화·확정안은 절대 여기 두지 않는다(그건 `repo/`=PostgreSQL).

정본: `docs/backend-design.md` §7-2 (Redis↔DB 타이밍), requirements.md "State Storage" 절.

## 파일과 키

| 파일 | Redis 키 | 내용 | TTL |
|---|---|---|---|
| `login_session.py` | `sess:{login_sid}` | `{user_id, school_id, role}` | 요청마다 연장(sliding) |
| `turn_lock.py` | `turn:{sid}:running` | 턴 중복 방지 | 짧은 고정 (`turn_lock_ttl_seconds`) |
| `compact_lock.py` | `compact:{sid}` | 압축 중복 방지 | 짧은 고정 (`compact_lock_ttl_seconds`) |
| `chip_state.py` | `sess_state:{sid}` | 현재 단계·반복 횟수 (칩 캐시) | 짧은 고정 |

## 지켜야 할 것

- **잠금은 `SET NX`로 세운다.** 워커가 여럿이라 "있는지 보고 세우기(GET 후 SET)"로 하면 두 워커가 동시에 통과한다. `SET key val NX EX ttl` 한 번의 원자 연산이어야 한다.
- **모든 키에 TTL이 있다.** TTL 없는 키를 만들지 않는다 — 지우는 것을 잊으면 영원히 남는다.
- **로그인 세션만 sliding**(요청마다 연장), 나머지는 고정 TTL. 미접수 대화를 길게 쓰는 도중 로그아웃되면 안 되기 때문.
- **`chip_state`는 캐시일 뿐이다.** 만료돼도 칩이 사라지면 안 된다 — 정본은 `complaint_conversations.choices`(DB)다. `session_service`가 캐시 미스 시 DB에서 다시 읽는다.
- 클라이언트(브라우저)에는 세션 id만 HttpOnly 쿠키로 나간다. 세션 실체는 여기 Redis에만 있다.

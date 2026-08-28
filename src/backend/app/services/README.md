# services/ — 판단이 사는 곳

이 폴더가 이 백엔드에서 유일하게 "머리를 쓰는" 계층이다. 상태 전이가 되는지, 소유자가 맞는지, 코드가 유효한지, 트랜잭션을 어디서 끊는지 — 전부 여기서 정한다. `docs/backend-design.md` §1·§4·§5가 정본.

## 만들 파일

| 파일 | 책임 | 상세 설계 위치 |
|---|---|---|
| `auth_service.py` | 가입 규칙(도메인 매칭·코드 판정), 로그인, 비밀번호 | `backend-design.md` §6 |
| `session_service.py` | 대화 왕복, 턴 잠금, 칩 병합, 세션 목록·압축, 접수 트랜잭션 | `backend-design.md` §7, §7-1, §7-2 |
| `complaint_service.py` | 상태 전이 5종 래핑, 철회, 코멘트 | `design.md` Components — ComplaintService |
| `errors.py` | 도메인 예외 (`InvalidTransition`, `NotOwner`, `HoldReasonRequired` 등) | `core/errors.py`가 이걸 HTTP로 변환 |

## 지켜야 할 것 (design.md Correctness Properties와 1:1 대응)

- **상태 전이는 조회 후 판정이 아니라 `repo`의 `UPDATE ... WHERE status=<전제>`를 그대로 호출한 결과(bool)로 판단한다.** 서비스가 먼저 `SELECT`로 상태를 보고 "지금 확인 상태니까 수락 가능"이라고 판단하면 안 된다 — 워커가 여럿이라 두 관리자가 동시에 누르면 둘 다 통과한다.
- **`hold()`는 상태 전환과 코멘트 삽입을 한 트랜잭션으로 묶는다.** `repo.hold_complaint()`가 이미 트랜잭션을 갖고 있다면 서비스는 빈 사유만 사전에 걸러내고 나머지는 위임한다.
- **`llm`을 직접 호출하고 결과의 `Usage`를 `bedrock_logs`에 적재하는 것은 `session_service`의 책임이다.** `llm/`이 스스로 로그를 남기지 않는다 (`llm`은 `school_id`를 모른다).
- **접수(`submit`)의 트랜잭션은 넷이다**: `complaints` INSERT → 대화 행에 `complaint_id` 연결 → `chat_sessions.complaint_id` 채움(읽기 전용화) → 다음 세션 발급. 넷 중 하나라도 실패하면 전부 롤백.
- **`school_id`와 작성자는 요청 본문이 아니라 세션 행(`chat_sessions`)이나 로그인 세션에서 가져온다.** 클라이언트가 보낸 값을 신뢰하지 않는다.

## 안 할 것

- SQL을 여기 쓰지 않는다 (`repo/`로).
- Redis 키 문자열을 여기 쓰지 않는다 (`session/`의 함수를 호출).
- Bedrock 요청 바디를 여기서 조립하지 않는다 (`llm/`의 함수를 호출하고 결과만 받는다).

# api/ — HTTP 엔드포인트

**로직 없음.** 요청 파싱 → `Depends`로 사용자/권한 꺼내기 → `services/` 호출 → 응답 직렬화, 이 셋뿐이다.

라우터에 `if 상태 == '확인': ...` 같은 판단이 생기면 그건 `services/`로 내려가야 한다.

## deps.py — 인증·역할·소유권 의존성

`docs/backend-design.md` §6.3(요청마다 세션이 복원되는 경로)이 정본.

구현할 것:
- `current_user`: 쿠키의 세션 id로 Redis 조회 → `{user_id, school_id, role}`. 없으면 401 `UNAUTHENTICATED`
- `require_admin`: `current_user`를 감싸서 `role != 'admin'`이면 403 `FORBIDDEN_ROLE`
- `require_session_owner(sid, user_id)`: 남의 대화 세션이면 **404** (403이 아니다 — 존재 여부 자체를 안 흘린다. `design.md` Correctness Property #10 참조)

이 세 가지를 라우터가 `Depends(...)`로만 받는다. 라우터 안에서 직접 Redis나 DB를 조회하지 않는다.

## routes/ — 엔드포인트 파일 분리

`docs/api-contract.md` 1장 표가 어떤 프론트 함수가 어떤 경로에 매핑되는지 정본이다. 파일은 그 표의 묶음대로 나눈다.

| 파일 | 담당 경로 |
|---|---|
| `health.py` | `GET /health` |
| `schools.py` | `GET /schools` (인증 불필요, 가입 드롭다운용) |
| `auth.py` | `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/password`, `DELETE /auth/me` |
| `session.py` | `/chat-sessions`, `/chat-sessions/{sid}`, `/chat-sessions/{sid}/messages`, `/chat-sessions/{sid}/submit` |
| `board.py` | `GET /complaints`, `GET /complaints/{id}`, `/complaints/{id}/conversation`, `/complaints/{id}/withdraw` |
| `admin.py` | `/admin/stats`, `/admin/complaints/{id}/{open,accept,resolve,hold,reject,comments}`, `/admin/bedrock-logs` |

**주의할 것 두 가지**:
1. **상세 열람(`/admin/complaints/{id}/open`)은 `GET`이 아니라 `POST`다.** 조회처럼 보이지만 `미확인→확인` 부작용이 있다. `GET`으로 두면 브라우저나 프록시의 프리페치가 열지도 않은 민원을 확인 처리한다. (`docs/api-contract.md` #17 참조)
2. **관리자 라우트는 전부 `Depends(require_admin)`을 건다.** 학생 계정이 부르면 403이어야 한다.

각 엔드포인트의 요청/응답 스키마, 오류 코드는 `docs/api-contract.md` 2장에 함수별로 정리되어 있다. 여기서 새로 설계하지 않는다.

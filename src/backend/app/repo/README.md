# repo/ — SQL이 사는 곳

**이 폴더 밖에는 SQL이 없다.** `school_id` 학교 격리와 `철회` 제외를 강제하는 유일한 계층이라, 여기 말고 다른 곳에서 쿼리를 짜면 격리가 새는 지점이 생긴다.

## 규칙

- **모든 조회·변경 함수는 `school_id`를 필수 인자로 받는다.** 인자를 안 넘기면 함수를 호출할 수 없게 시그니처로 강제한다 (파이썬이라 타입 체커/린트로 보강하거나, 최소한 코드 리뷰에서 이 규칙을 본다).
- **`status != '철회'` 조건은 조회 함수 안에 내장한다.** 호출하는 쪽(서비스)이 매번 조건을 붙이게 하면 언젠가 하나를 빠뜨린다.
- **상태 전이 함수는 `UPDATE ... WHERE id=? AND school_id=? AND status=<전제상태>`로 작성하고 영향받은 행 수(또는 bool)를 반환한다.** `SELECT` 후 `UPDATE`하는 두 단계로 쪼개지 않는다.

## 만들 파일

| 파일 | 주요 함수 |
|---|---|
| `school_repo.py` | `find_by_domain(domain)`, `list_all()`(별칭 포함), `verify_admin_code(school_id, code)` |
| `user_repo.py` | `create`, `find_by_email`, `get_hash`, `change_password`, `delete` |
| `chat_session_repo.py` | 세션 생성/목록/메타 조회, 압축 경계 갱신 (`docs/backend-design.md` §7.3 스키마 참고) |
| `conversation_repo.py` | 대화 행 삽입/조회 (세션 기준·민원 기준 두 경로), `refined_json` 마지막 값 조회 |
| `complaint_repo.py` | `create`, `list`, `get`, `get_stats`, 상태 전이 5종(`confirm/accept/resolve/hold/reject`), `withdraw` |
| `comment_repo.py` | `add`, `list` |
| `bedrock_log_repo.py` | `add`(school_id, model_id, is_complete, latency_ms, tokens, error) |

## 상태 전이 함수 시그니처 예시

```python
def accept_complaint(conn, complaint_id: int, school_id: int) -> bool:
    """확인 → 처리중. 조건 불일치 시 False. 조회 후 판정하지 않는다."""
    result = conn.execute(
        "UPDATE complaints SET status = '처리중' "
        "WHERE id = %s AND school_id = %s AND status = '확인'",
        (complaint_id, school_id)
    )
    return result.rowcount > 0
```

`confirm_complaint`(미확인→확인)는 실패해도 예외가 아니라 그냥 무동작이어야 한다 — 여러 번 호출해도 안전해야 하는 멱등 동작이다(`design.md` Correctness Property #7).

## 스키마 정본

DDL은 여기 만들지 않는다. `.kiro/specs/complaint-assistant/requirements.md`의 "PostgreSQL Schema" 절이 정본이고, `init_db.py`가 그걸 그대로 실행한다. ORM을 쓴다면 모델 정의도 그 스키마와 정확히 일치해야 한다 (컬럼명, CHECK 제약, FK의 ON DELETE 방식까지).

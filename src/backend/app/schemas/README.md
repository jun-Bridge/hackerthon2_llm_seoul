# schemas/ — API 계약 (Pydantic)

HTTP 경계를 넘는 모든 타입. `docs/api-contract.md`의 TypeScript 인터페이스(`Me`, `Complaint`, `Comment`, `ConversationTurn`, `School` 등)와 **1:1로 짝을 맞춘다.** 한쪽을 고치면 반드시 다른 쪽도 고친다.

## 만들 파일

| 파일 | 타입 |
|---|---|
| `auth.py` | `SignupIn`, `LoginIn`, `ChangePasswordIn`, `Me` |
| `session.py` | `SendMessageIn`, `RefineResultOut`, `SessionSummaryOut`, `TurnOut` |
| `complaint.py` | `ComplaintOut`, `CommentOut`, `HoldIn`, `WithdrawIn` |
| `common.py` | `ErrorResponse`(`{error: {code, message}}` 형태), 페이지네이션 있으면 여기 |

## 주의할 것

- **`ComplaintOut`에 `submitted_by_user_id`를 절대 넣지 않는다.** 대신 `is_mine: bool` 필드를 둔다 — 서버가 세션과 대조해 계산한 값만 응답에 실린다 (`design.md` Correctness Property #4).
- **`ComplaintOut.comments`는 맥락에 따라 내용이 다르다.** 목록 응답에서는 `is_hold_reason=True`인 것만, 상세 응답에서는 전부. 타입은 같지만(`list[CommentOut]`) 개수를 프론트가 믿으면 안 된다 — `docs/api-contract.md` 0장 "comments는 어디서 왔느냐에 따라 내용이 다르다" 참조.
- **오류 응답은 전부 같은 모양이다**: `{"error": {"code": "...", "message": "..."}}`. `common.py`의 `ErrorResponse`로 통일하고, 코드 목록은 `docs/api-contract.md`의 오류 코드 표가 정본이다 (임의로 새 코드를 만들지 않는다).
- ORM 모델(`repo/`가 다루는 것)은 이 폴더의 타입과 별개다. `repo` 함수가 dict나 튜플을 반환하면 서비스가 이 스키마로 변환해 라우터에 넘긴다.

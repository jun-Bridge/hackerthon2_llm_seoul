# UniVoice — Design

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│              AWS Bedrock (Claude Sonnet 5)           │
│   도구 둘: ask_followup · classify_and_refine        │
│   tool_choice=any — 매 턴 하나는 반드시 부른다        │
└───────────────────────────┬──────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │  FastAPI (uvicorn)  │
                 │  워커 N개 · :8501    │
                 │  정적 프론트도 서빙  │
                 └───┬──────────────┬──┘
                     │              │
        ┌────────────▼────┐  ┌──────▼──────────────┐
        │  PostgreSQL     │  │       Redis         │
        │  확정된 것       │  │   살아있는 것        │
        ├─────────────────┤  ├─────────────────────┤
        │ schools         │  │ sess:{login_sid}    │
        │ admin_codes     │  │ turn:{sid}:running  │
        │ users           │  │ compact:{sid}       │
        │ chat_sessions   │  │ sess_state:{sid}    │
        │ complaints      │  └─────────────────────┘
        │ ..._conversations │
        │ ..._comments    │
        │ bedrock_logs    │
        └─────────────────┘
```

**워커가 여럿이라는 것의 의미**: LLM 호출이 수 초씩 걸린다. 워커가 하나면 한 사람이 민원을
정제하는 동안 다른 사람의 게시판 조회까지 막힌다. 워커를 늘려 그 대기가 서로를 막지 않게 한다.
**대신 프로세스 메모리에 상태를 둘 수 없다** — 다음 요청이 다른 워커로 갈 수 있으므로
세션은 Redis, 확정 데이터는 PostgreSQL에 둔다.

**역할 기반 화면 분기**: 목업 HTML은 상단 스위처로 학생/관리자 뷰를 자유 전환하지만, 실제 서비스에서는 로그인 세션의 `role`이 화면을 고정한다. 관리자 계정으로 로그인하면 관리자 대시보드만 보이고, 학생 계정은 작성+게시판만 보인다.

**변환이 대화형이라는 것의 의미**: 학생 입력 한 번으로 끝나는 원샷 변환이 아니다. 모델은 매 턴 도구 **둘 중 하나**를 부른다 — 부족하면 `ask_followup`(질문 + 선택지), 충분하면 `classify_and_refine`(확정안). **어느 것을 불렀는지가 곧 "부족한가"의 답이다.** 이 왕복이 `complaint_conversations`에 전부 쌓이고, 확정되면 미리보기가 뜬다.

**처리 상태가 열람/결정/진행 세 국면으로 나뉜다는 것의 의미**: 접수된 민원은 관리자가 아직 안 본 `미확인`으로 시작한다. 상세 화면을 여는 행위 자체가 `확인`으로 전환시키고(버튼 없음), `확인` 상태에서만 수락/보류/거절 결정이 가능해진다. 수락은 즉시 끝나는 게 아니라 `처리중`을 거쳐야 `해결완료`에 도달한다. 보류는 사유 코멘트가 없으면 전환 자체가 성립하지 않는다.

---

## Data Models

### 정본은 `requirements.md`다

**ER 관계도와 PostgreSQL 스키마는 `requirements.md`의 Data Model 절이 정본이다.**
여기에 다시 적지 않는다 — 두 곳에 두면 반드시 갈라진다(실제로 갈라져 있었다).

읽을 때 놓치기 쉬운 것만 짚는다.

| 관계 | 삭제 전파 | 왜 |
|---|---|---|
| `user → complaints` | **SET NULL** | 민원은 학교의 공공 기록이라 탈퇴와 무관하게 보존. 게시판은 이미 익명이라 표시에 영향 없음 |
| `user → chat_sessions` | CASCADE | 대화 목록은 개인 것이므로 계정과 함께 사라진다 |
| `chat_sessions → conversations` | **SET NULL** | ★ 세션이 사라져도 **접수된 민원의 근거 대화는 남아야 한다.** CASCADE면 탈퇴 시 민원은 남는데 원문이 비는 사고가 난다 |
| `complaints → conversations` | CASCADE | 민원이 지워지면 대화도 무의미 |
| `user → complaint_comments` | SET NULL | 코멘트 텍스트는 남는다. 표시가 어차피 "관리자"뿐이라 식별이 노출되지 않는다 |

**대화 행은 두 주인을 갖는다.** 접수 전에는 `chat_session_id`로, 접수 후에는 두 FK가
모두 채워져 어느 쪽으로 찾아도 같은 행이 나온다.

## File Structure

> **대화 세션 테이블이 추가됐다.** `chat_sessions`(과거 대화 목록·세션주제·압축 경계)와
> `complaint_conversations`의 두 FK(`chat_session_id` SET NULL · `complaint_id` CASCADE) 구조는
> `requirements.md`의 스키마와 `docs/backend-design.md` §7이 정본이다.


```
hackerthon2_llm_1/
├─ app.py                        # 진입점: 인증 → role 분기
├─ bedrock_simple_test.py        # Bedrock 연결 테스트
├─ requirements.txt
├─ init_db.py                    # PostgreSQL 스키마 초기화
├─ seed_schools.py               # 학교/이메일 도메인/관리자 코드 데모 시드
├─ backup_db.py                  # DB 백업 (cron)
│
├─ app/                          # 백엔드 계층 — docs/backend-design.md §2가 정본
│  ├─ main.py                   # FastAPI. 라우터 등록 → 정적 mount (순서 중요)
│  ├─ api/{deps.py, routes/}
│  ├─ schemas/                  # Pydantic 계약 타입
│  ├─ services/                 # 판단이 사는 곳
│  ├─ repo/                     # SQL이 사는 곳
│  ├─ session/                  # Redis가 사는 곳
│  ├─ llm/                      # Bedrock이 사는 곳
│  └─ core/                     # 설정·예외·로깅
│
├─ frontend/                    # 정적 파일. 같은 서버가 서빙
│
├─ docs/                         # 설계 문서 · 프론트·백 연결 규약
└─ .kiro/specs/complaint-assistant/
```

**기존 설계에서 제거된 것**: `document_core.py`, `tool_executor.py`(줄 단위 편집용), `proposal_manager.py`. 이 서비스는 문서를 줄 단위로 편집하지 않고, 민원 하나 = 대화 후 확정되는 레코드 하나이므로 제안/승인/diff 개념이 필요 없다.

---

## 상태를 어디에 두나

**정본은 `requirements.md`의 "상태를 어디에 두나" 절과 `docs/backend-design.md` §7·§7-2다.**
여기에 표를 다시 그리지 않는다.

요점 셋.

1. **로그인 세션은 HttpOnly 쿠키 + Redis.** 새로고침해도, 탭을 닫았다 열어도 유지된다.
   워커가 여럿이라 프로세스 메모리에 둘 수 없다.
2. **대화는 매 턴 즉시 PostgreSQL에 쓴다.** 작업본 방식을 쓰지 않는다 —
   여기 쌓이는 것은 append-only 대화라 한 턴이 곧 확정이고, 미루면 새로고침에 사라진다.
   **나갈 때 저장하는 동작이 없다.**
3. **Redis에는 잃어도 되는 것만.** 턴 잠금·압축 잠금·단계 캐시.
   Redis가 통째로 죽어도 민원과 대화는 사라지지 않는다.

**대화 세션 컨테이너는 세 겹이다** — 현재 대화(버퍼) → 차면 과거 대화로 밀리고 →
쌓이면 **이전 세션주제와 함께** 압축해 새 세션주제. 압축이 누적되므로 대화가 길어져도
초반 맥락이 사라지지 않는다.

**소유자는 `chat_sessions.user_id`가 쥔다.** 세션이 "과거 대화" 목록에 남아야 하므로
어차피 영속 행이고, 행이 있으면 소유자도 거기 있는 게 맞다.

---

## Component Design

**모듈 구성과 계층 규칙은 `docs/backend-design.md` §2가 정본이다.**
클래스 목록이나 메서드 시그니처를 여기에 다시 적지 않는다.

> 이전 판은 `DatabaseManager`·`BedrockClient`·`ComplaintService`·`AuthManager` 네 클래스로
> 그려져 있었다. 지금은 **계층으로 나뉜다** — `routes`(파사드) → `services`(판단) →
> `repo`(SQL) / `session`(Redis) / `llm`(Bedrock). 같은 것을 두 방식으로 그려두면 갈라진다.

여기서는 **구현 방식과 무관하게 지켜야 할 도메인 규칙**만 남긴다.

### 상태 전이 규칙

| 전이 | 전제 | 비고 |
|---|---|---|
| `미확인 → 확인` | 관리자가 상세를 **열람** | 버튼이 아니다. 여러 번 열어도 안전(멱등) |
| `확인 → 처리중` | 수락 | `미확인`에서는 불가 — 보지도 않고 결정할 수 없다 |
| `처리중 → 해결완료` | 해결 완료 | **건너뛸 수 없다.** `확인`에서 바로 갈 수 없다 |
| `확인 → 보류` | 보류 + **사유 필수** | 상태와 사유가 함께 성립한다. 하나만 남지 않는다 |
| `확인 → 거절` | 거절 | 최종 상태 |
| `무엇이든 → 철회` | 학생 본인 + 비밀번호 | 관리자 전이와 독립 |

**전이 검증은 조회 후 판정이 아니라 `UPDATE ... WHERE status=<전제>`다.**
워커가 여럿이라 조회 후 판정하면 두 관리자가 동시에 눌렀을 때 둘 다 통과한다.

### LLM 계약

모델은 매 턴 **도구 둘 중 하나**를 반드시 부른다(`tool_choice: any`).

| 부른 것 | 뜻 | 담긴 것 |
|---|---|---|
| `ask_followup` | 부족하다 | `missing` · `question` · `choices[]` |
| `classify_and_refine_complaint` | 충분하다 | 카테고리(**enum 7종**) · 위치 · 제목 · 본문 · 세션 제목 |

**"부족한가"를 도구의 부재로 읽지 않는다.** 부재로 읽으면 되묻는 문장만 얻고
**선택지를 만들 수 없다.** 억지 채움은 도구를 나누는 것으로 막는다 —
부족할 때 부를 도구가 따로 있으면 확정 도구를 억지로 부를 이유가 없다.

**카테고리를 `enum`으로 묶는다.** 자유 문자열이면 매번 미묘하게 다른 값이 와서
`complaints.category`와 매칭이 깨진다.

### 격리와 익명

- **`school_id` 필터는 `repo` 계층이 강제한다.** 모든 조회 함수가 필수 인자로 받는다 —
  서비스마다 손으로 붙이면 언젠가 하나를 빠뜨린다.
- **작성자 id는 응답에 실리지 않는다.** 서버가 세션과 대조해 `is_mine` 불린 하나로 답한다.
- **철회 제외도 `repo`가 한다.** `status <> '철회'`를 조회 함수 안에 넣어두면 서비스가 잊어도 새지 않는다.

상세 규격은 `docs/backend-design.md`, 밖으로 보이는 계약은 `docs/api-contract.md`.

## UI Design

> **화면과 API의 대응은 `docs/api-contract.md` §4-0이 정본이다.**
> 여기에 다시 적지 않는다 — 두 곳에 두면 갈라진다.

요점만.

- **역할이 화면을 고정한다.** `getMe()`의 `role`로 갈리고, 전환 버튼은 만들지 않는다.
- **학생 화면** — 사이드바(과거 대화 목록) · 대화창(말풍선 + 칩) · 게시판.
- **관리자 화면** — 통계 카드 · 필터 탭 · 목록 · 상세 모달(대화 전체 + 코멘트 + 결정 버튼).
- **상태 변경 후 갱신** — 응답이 갱신된 민원이므로 상세는 그것으로 갈아끼우고,
  **목록과 통계만 다시 받는다.** 전체를 다시 받지 않는다.

## Data Flow

### 민원 대화 → 접수 (변경 없음)
```
학생 메시지 → send_message() → 대화 기록 → refine_complaint()
  → is_complete=False → 되묻기 반복
  → is_complete=True  → 미리보기 → "정식 접수" → submit() → create_complaint()
       (상태는 항상 '미확인'으로 시작)
```

### 관리자 열람 → 자동 확인
```
목록에서 민원 클릭
  → selected_complaint_id 세션에 저장
  → ComplaintService.open_detail(id, school_id) 호출 (같은 요청 내에서)
       → db.confirm_complaint(): status='미확인' 조건이 맞으면 '확인'+confirmed_at 기록
       → 이미 확인 이후 상태면 조건 불일치로 아무 변화 없음 (안전하게 재호출 가능)
  → → 상세 화면과 목록 통계 모두 최신 상태 반영
```

### 결정 버튼 (확인 상태에서만 노출)
```
[수락] → accept() → db.accept_complaint(): '확인'→'처리중'
[보류] → 모달에서 reason 입력 → hold(reason) → 빈 값이면 서비스 레이어에서 거부
                                → db.hold_complaint(): '확인'→'보류' + 코멘트 INSERT (단일 트랜잭션)
[거절] → reject() → db.reject_complaint(): '확인'→'거절'
```

### 처리중 이후
```
[해결 완료] → resolve() → db.resolve_complaint(): '처리중'→'해결완료'
```

### 코멘트 (상태 무관, 언제든)
```
코멘트 입력 → add_comment() → db.add_comment() INSERT (is_hold_reason=0)
```

### 철회 (변경 없음)
```
학생 "철회" → 비밀번호 확인 → withdraw() → status='철회' → 모든 목록에서 제외
```

---

## Error Handling

### Bedrock 호출 오류
```python
try:
    result = complaint_service.send_message(session_id, text)
except BedrockRefineError:
    st.error("AI 응답 처리에 실패했습니다. 다시 시도해주세요.")
except botocore.exceptions.ClientError as e:
    code = e.response['Error']['Code']
    st.error("요청이 많습니다. 잠시 후 다시 시도하세요." if code == 'ThrottlingException' else f"Bedrock 오류: {e}")
```

### 가입/로그인 오류
- 이메일 중복 → "이미 존재하는 이메일입니다"
- 도메인 미등록 → "지원하지 않는 학교 이메일입니다"
- 관리자 코드 불일치 → 가입 차단

### 상태 전이 오류
- `accept/resolve/hold/reject`가 각각 선행 상태 조건에 안 맞으면 `rowcount=0` → 서비스 레이어가 `(False, "<상태>만 ~할 수 있습니다")` 반환. UI가 정상적으로 버튼을 상태별로만 노출하면 이 경로는 사실상 발생하지 않지만, 여러 탭에서 동시에 같은 민원을 조작하는 경쟁 상황(예: 관리자 두 명이 같은 민원을 동시에 처리)의 방어선이다.
- 보류 코멘트 빈 값 → "보류 사유를 입력해야 합니다", DB 호출 자체가 일어나지 않음

### 철회 오류
- 비밀번호 불일치 → "비밀번호가 올바르지 않습니다"
- 소유권 불일치 → "본인이 접수한 민원만 철회할 수 있습니다" (UI에서 버튼 자체를 안 보여주므로 방어적 계층)

### 권한 경계
- 모든 민원 조회/전이 쿼리는 `school_id`를 WHERE에 포함 (DB 레이어 필수 계약)
- 철회는 `submitted_by_user_id`를 WHERE에 포함
- 상태 전이 5종 메서드는 선행 상태를 WHERE에 포함 (전이 규칙을 DB 레이어에서 강제)

---

## Testing Strategy

### M2 검증 (대화형 정제) — 변경 없음
```python
def test_refine_asks_when_incomplete():
    result = bedrock_client.refine_complaint([{"role": "student", "content": "에어컨이 이상해요"}])
    assert result["is_complete"] is False

def test_refine_completes_after_followup():
    conversation = [
        {"role": "student", "content": "에어컨이 이상해요"},
        {"role": "assistant", "content": "어느 건물 몇 층인가요?"},
        {"role": "student", "content": "공학관 3층 실습실이요, 소리가 심해요"}
    ]
    result = bedrock_client.refine_complaint(conversation)
    assert result["is_complete"] is True
    assert result["category"] in CATEGORIES
```

### M3 검증 (학교 격리 / 철회) — 변경 없음, 생략

### M4 검증 (상태 전이 규칙)
```python
def test_new_complaint_starts_unconfirmed():
    school_id = seed학교("A대학교", "a.ac.kr")
    user_a = db.create_user(school_id, "a@a.ac.kr", "password1", "student")
    complaint_id = db.create_complaint(school_id, user_a, "draft-1", "기타", "위치", "제목", "본문")
    complaint = db.get_complaint(complaint_id, school_id)
    assert complaint["status"] == "미확인"

def test_opening_detail_auto_confirms():
    complaint_id = ...  # 미확인 상태로 생성
    complaint_service.open_detail(complaint_id, school_id)
    assert db.get_complaint(complaint_id, school_id)["status"] == "확인"

def test_accept_requires_confirmed_status():
    complaint_id = ...  # 아직 미확인
    ok, msg = complaint_service.accept(complaint_id, school_id)
    assert ok is False  # 미확인 상태에서는 수락 불가

def test_accept_then_resolve_sequence():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)      # 미확인 → 확인
    complaint_service.accept(complaint_id, school_id)           # 확인 → 처리중
    ok, _ = complaint_service.resolve(complaint_id, school_id)  # 처리중 → 해결완료
    assert ok is True
    assert db.get_complaint(complaint_id, school_id)["status"] == "해결완료"

def test_cannot_resolve_without_accept():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)  # 확인 상태까지만
    ok, msg = complaint_service.resolve(complaint_id, school_id)  # 처리중을 건너뜀
    assert ok is False

def test_hold_requires_reason():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)
    ok, msg = complaint_service.hold(complaint_id, school_id, admin_user_id, reason="")
    assert ok is False
    assert db.get_complaint(complaint_id, school_id)["status"] == "확인"  # 전환 안 됨

def test_hold_with_reason_creates_comment():
    complaint_id = ...
    complaint_service.open_detail(complaint_id, school_id)
    complaint_service.hold(complaint_id, school_id, admin_user_id, reason="부품 재고 확인 필요")
    comments = db.get_comments(complaint_id)
    assert any(c["is_hold_reason"] for c in comments)

def test_comment_allowed_regardless_of_status():
    complaint_id = ...  # 미확인 상태
    ok, _ = complaint_service.add_comment(complaint_id, admin_user_id, "확인 예정입니다")
    assert ok is True  # 미확인 상태에서도 코멘트는 가능
```

### M4 검증 (school_id 경계) — 기존과 동일하게 유지, 전이 메서드에도 적용
```python
def test_accept_fails_across_schools():
    school_a_id = seed학교("A대학교", "a.ac.kr")
    school_b_id = seed학교("B대학교", "b.ac.kr")
    user_a = db.create_user(school_a_id, "a@a.ac.kr", "password1", "student")
    complaint_id = db.create_complaint(school_a_id, user_a, "draft-1", "기타", "위치", "제목", "본문")
    db.confirm_complaint(complaint_id, school_a_id)

    ok = db.accept_complaint(complaint_id, school_b_id)  # 다른 학교로 시도
    assert ok is False
    assert db.get_complaint(complaint_id, school_a_id)["status"] == "확인"  # 안 바뀜
```

---

## Performance Considerations

- Bedrock 응답 시간: 왕복당 2~4초
- 대화 왕복 수: 보통 1~3회
- 게시판/통계/코멘트 조회: < 50ms (PostgreSQL, 학교당 민원 수 적음)

---

## Security

- 비밀번호: bcrypt 해싱, 평문 저장 금지
- 관리자 코드: 시드 스크립트로만 생성
- 학교 스코프: 모든 민원 쿼리에서 `school_id` 필수
- 상태 전이: 각 메서드가 선행 상태를 WHERE에 포함해 순서를 우회한 전이를 DB 레벨에서 차단
- 철회 소유권: `submitted_by_user_id` 필수
- 익명성: `submitted_by_user_id`, 코멘트 `author_user_id`는 화면에 절대 표시하지 않음 (내부 로직 전용)
- EC2: Instance Profile로 Bedrock 인증, Access Key 없음

---

## Next Steps (Post-Competition)

1. 관리자 알림 (신규 민원 발생 시)
2. 학생에게 상태 변경 알림
3. 카테고리별/기간별 통계 대시보드
4. 이미지 첨부
5. 실시간 반영 고도화 (SSE — 현재 구조에서 바로 가능)
